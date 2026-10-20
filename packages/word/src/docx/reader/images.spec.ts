import { describe, expect, it, vi } from 'vitest';
import { MAX_IMAGE_PX, bytesToDataUrl, createImageConverter, isSafeImageUrl } from './images';
import { PNG_1X1, buildPackage, createTestContext, fragment, renderBody } from './testing-blocks';
import type { DocxPackage } from './types';

const PNG_DATA_URL = bytesToDataUrl(PNG_1X1, 'image/png');

function drawingXml(
  options: {
    readonly anchor?: string;
    readonly descr?: string;
    readonly title?: string;
    readonly embed?: string;
  } = {},
): string {
  const embed = options.embed ?? 'rId5';
  const docPr = `<wp:docPr id="1" name="Image 1"${options.descr === undefined ? '' : ` descr="${options.descr}"`}${options.title === undefined ? '' : ` title="${options.title}"`}/>`;
  const graphic = `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:blipFill><a:blip r:embed="${embed}"/></pic:blipFill></pic:pic></a:graphicData></a:graphic>`;
  const inner = `<wp:extent cx="1905000" cy="952500"/>${docPr}${graphic}`;
  return options.anchor === undefined
    ? `<w:drawing><wp:inline>${inner}</wp:inline></w:drawing>`
    : `<w:drawing><wp:anchor><wp:positionH relativeFrom="margin"><wp:align>${options.anchor}</wp:align></wp:positionH>${inner}</wp:anchor></w:drawing>`;
}

async function imagePackage(
  target = 'media/image1.png',
  bytes: Uint8Array | null = PNG_1X1,
): Promise<DocxPackage> {
  const parts: Record<string, Uint8Array> = {};
  if (bytes) parts[`word/${target}`] = bytes;
  return buildPackage('', {
    rels: [
      { id: 'rId5', type: 'image', target },
      { id: 'rIdExt', type: 'image', target: 'https://example.com/a.png', external: true },
    ],
    parts,
  });
}

describe('createImageConverter', () => {
  it('encode des octets en data URL par morceaux, sans Buffer', () => {
    expect(PNG_DATA_URL.startsWith('data:image/png;base64,iVBORw0KGgo')).toBe(true);
    const big = new Uint8Array(70000).fill(65);
    expect(bytesToDataUrl(big, 'image/gif')).toBe(
      `data:image/gif;base64,${btoa('A'.repeat(70000))}`,
    );
  });

  it('rend une image inline en data URL avec alt, title, width et height', async () => {
    const pkg = await imagePackage();
    const ctx = await createTestContext(pkg);
    const html = await ctx.images.drawing(
      fragment(drawingXml({ descr: 'Un carré', title: 'Titre' })),
      ctx,
    );
    expect(html).toBe(
      `<img src="${PNG_DATA_URL}" alt="Un carré" title="Titre" width="200" height="100">`,
    );
    expect(ctx.warnings).toEqual([]);
  });

  it('image ancrée : alignement depuis wp:positionH/wp:align, alt vide sinon', async () => {
    const ctx = await createTestContext(await imagePackage());
    expect(await ctx.images.drawing(fragment(drawingXml({ anchor: 'center' })), ctx)).toBe(
      `<img src="${PNG_DATA_URL}" alt="" width="200" height="100" data-align="center">`,
    );
    expect(await ctx.images.drawing(fragment(drawingXml({ anchor: 'inside' })), ctx)).not.toContain(
      'data-align',
    );
  });

  it('appelle le hook upload avec un File et utilise l’URL retournée', async () => {
    const upload = vi.fn(
      async (file: File) => `https://cdn/${file.name}?${String(file.size)}:${file.type}`,
    );
    const ctx = await createTestContext(await imagePackage(), { upload });
    const html = await ctx.images.drawing(fragment(drawingXml()), ctx);
    expect(html).toBe(
      `<img src="https://cdn/image-1.png?${String(PNG_1X1.length)}:image/png" alt="" width="200" height="100">`,
    );
    expect(upload).toHaveBeenCalledTimes(1);
    expect(ctx.warnings).toEqual([]);
  });

  it('upload en échec ou sans URL : repli en base64 avec image-upload-failed', async () => {
    const failing = vi.fn(async () => {
      throw new Error('réseau');
    });
    const ctx = await createTestContext(await imagePackage(), { upload: failing });
    expect(await ctx.images.drawing(fragment(drawingXml()), ctx)).toContain(
      `src="${PNG_DATA_URL}"`,
    );
    expect(ctx.warnings).toEqual([
      { code: 'image-upload-failed', message: expect.stringContaining('réseau') },
    ]);
    const empty = await createTestContext(await imagePackage(), { upload: async () => '' });
    expect(await empty.images.drawing(fragment(drawingXml()), empty)).toContain(PNG_DATA_URL);
    expect(empty.warnings[0]?.code).toBe('image-upload-failed');
  });

  it('ignore avec image-skipped : extension non affichable, relation absente, externe, partie manquante', async () => {
    const emf = await createTestContext(await imagePackage('media/image1.emf'));
    expect(await emf.images.drawing(fragment(drawingXml()), emf)).toBe('');
    expect(emf.warnings).toEqual([
      { code: 'image-skipped', message: expect.stringContaining('emf') },
    ]);

    const ctx = await createTestContext(await imagePackage('media/image1.png', null));
    expect(await ctx.images.drawing(fragment(drawingXml({ embed: 'rId404' })), ctx)).toBe('');
    expect(await ctx.images.drawing(fragment(drawingXml({ embed: 'rIdExt' })), ctx)).toBe('');
    expect(await ctx.images.drawing(fragment(drawingXml()), ctx)).toBe('');
    expect(ctx.warnings.map((w) => w.code)).toEqual([
      'image-skipped',
      'image-skipped',
      'image-skipped',
    ]);
    expect(ctx.warnings[1]?.message).toContain('externe');
    expect(ctx.warnings[2]?.message).toContain('absente');
  });

  it('w:pict VML : v:imagedata r:id et dimensions du style', async () => {
    const ctx = await createTestContext(await imagePackage());
    const pict = fragment(
      '<w:pict><v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:72pt;height:36pt"><v:imagedata r:id="rId5" o:title="Logo"/></v:shape></w:pict>',
    );
    expect(await ctx.images.drawing(pict, ctx)).toBe(
      `<img src="${PNG_DATA_URL}" alt="Logo" width="96" height="48">`,
    );
  });

  it('dessin sans image (zone de texte) : objet perdu signalé à chaque occurrence, texte conservé', async () => {
    const ctx = await createTestContext(await imagePackage());
    const textbox = fragment(
      '<w:drawing><wp:inline><wp:extent cx="1" cy="1"/><wp:docPr id="7" name="Zone de texte 1"/><a:graphic><a:graphicData uri="x"><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Dedans</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:inline></w:drawing>',
    );
    expect(await ctx.images.drawing(textbox, ctx)).toBe('Dedans');
    expect(await ctx.images.drawing(textbox, ctx)).toBe('Dedans');
    const entry = { kind: 'textbox', where: 'body', text: 'Dedans', detail: 'Zone de texte 1' };
    expect(ctx.lost).toEqual([entry, entry]);
    const warning = { code: 'object-lost', message: expect.stringContaining('Zone de texte 1') };
    expect(ctx.warnings).toEqual([warning, warning]);
  });

  it('R25-15 : chaque forme ou zone de texte est signalée, même anonyme ou identique à une autre', async () => {
    const ctx = await createTestContext(await imagePackage());
    const shape = '<w:p><w:r><w:pict><v:rect/></w:pict></w:r></w:p>';
    const textbox = (text: string): string =>
      `<w:p><w:r><w:drawing><wp:anchor><wp:docPr id="1" name="Zone"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>`;
    const html = await renderBody(shape + shape + textbox('A') + textbox('A') + textbox('B'), ctx);
    expect(html).toBe('<p></p><p></p><p>A</p><p>A</p><p>B</p>');
    expect(ctx.lost.map((lost) => [lost.kind, lost.detail, lost.text])).toEqual([
      ['shape', 'forme', undefined],
      ['shape', 'forme', undefined],
      ['textbox', 'Zone', 'A'],
      ['textbox', 'Zone', 'A'],
      ['textbox', 'Zone', 'B'],
    ]);
    expect(ctx.warnings.filter((w) => w.code === 'object-lost')).toHaveLength(5);
  });

  it('R25-02 : un a:blip hors pic:pic (fond d’une zone de texte) n’est pas une image, le texte est conservé et signalé', async () => {
    const ctx = await createTestContext(await imagePackage());
    const html = await renderBody(
      '<w:p><w:r><w:drawing><wp:anchor><wp:extent cx="914400" cy="914400"/><wp:docPr id="2" name="Zone de texte 9"/>' +
        '<a:graphic><a:graphicData><wps:wsp><wps:spPr><a:blipFill><a:blip r:embed="rId5"/></a:blipFill></wps:spPr>' +
        '<wps:txbx><w:txbxContent><w:p><w:r><w:t>TEXTE IMPORTANT &lt;script&gt;</w:t></w:r></w:p></w:txbxContent></wps:txbx>' +
        '</wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing></w:r></w:p>',
      ctx,
    );
    expect(html).toBe('<p>TEXTE IMPORTANT &lt;script&gt;</p>');
    expect(ctx.lost).toEqual([
      {
        kind: 'textbox',
        where: 'body',
        text: 'TEXTE IMPORTANT <script>',
        detail: 'Zone de texte 9',
      },
    ]);
    expect(ctx.warnings.map((w) => w.code)).toEqual(['object-lost']);
  });

  it('R25-02 : un dessin avec image et zone de texte rend l’image puis le texte, et signale la zone', async () => {
    const ctx = await createTestContext(await imagePackage());
    const group = fragment(
      '<w:drawing><wp:inline><wp:extent cx="914400" cy="914400"/><wp:docPr id="3" name="Groupe 1"/><a:graphic><a:graphicData>' +
        '<wpg:wgp><pic:pic><pic:blipFill><a:blip r:embed="rId5"/></pic:blipFill></pic:pic>' +
        '<wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>Légende</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></wpg:wgp>' +
        '</a:graphicData></a:graphic></wp:inline></w:drawing>',
    );
    expect(await ctx.images.drawing(group, ctx)).toBe(
      `<img src="${PNG_DATA_URL}" alt="" width="96" height="96">Légende`,
    );
    expect(ctx.lost).toEqual([
      { kind: 'textbox', where: 'body', text: 'Légende', detail: 'Groupe 1' },
    ]);
    expect(ctx.warnings.map((w) => w.code)).toEqual(['object-lost']);
  });

  it('R25-04 : mc:AlternateContent → contenu du mc:Choice converti, le mc:Fallback ignoré', async () => {
    const ctx = await createTestContext(await imagePackage());
    const alternate = (choice: string): string =>
      `<mc:AlternateContent><mc:Choice Requires="wps">${choice}</mc:Choice>` +
      '<mc:Fallback><w:pict><v:shape id="Zone de texte 1"><v:textbox><w:txbxContent><w:p><w:r><w:t>REPLI</w:t></w:r></w:p></w:txbxContent></v:textbox></v:shape></w:pict></mc:Fallback></mc:AlternateContent>';
    const textbox =
      '<w:drawing><wp:anchor><wp:docPr id="1" name="Zone de texte 1"/><a:graphic><a:graphicData><wps:wsp><wps:txbx><w:txbxContent><w:p><w:r><w:t>TEXTE DE LA ZONE</w:t></w:r></w:p></w:txbxContent></wps:txbx></wps:wsp></a:graphicData></a:graphic></wp:anchor></w:drawing>';
    // Appel direct avec l'enveloppe (ce que fait le convertisseur de runs) : zone de texte, puis image.
    expect(await ctx.images.drawing(fragment(alternate(textbox)), ctx)).toBe('TEXTE DE LA ZONE');
    expect(await ctx.images.drawing(fragment(alternate(drawingXml())), ctx)).toBe(
      `<img src="${PNG_DATA_URL}" alt="" width="200" height="100">`,
    );
    // Dans un paragraphe : une seule conversion, pas de doublon avec le repli VML.
    const html = await renderBody(
      `<w:p><w:r><w:t>Avant</w:t></w:r><w:r>${alternate(textbox)}</w:r><w:r><w:t>Après</w:t></w:r></w:p>`,
      ctx,
    );
    expect(html).toBe('<p>AvantTEXTE DE LA ZONEAprès</p>');
    const entry = {
      kind: 'textbox',
      where: 'body',
      text: 'TEXTE DE LA ZONE',
      detail: 'Zone de texte 1',
    };
    expect(ctx.lost).toEqual([entry, entry]);
    // `mc:Choice` vide : repli sur `mc:Fallback`.
    expect(
      await ctx.images.drawing(
        fragment(
          '<mc:AlternateContent><mc:Choice Requires="wps"/><mc:Fallback><w:pict><v:shape style="width:72pt"><v:imagedata r:id="rId5"/></v:shape></w:pict></mc:Fallback></mc:AlternateContent>',
        ),
        ctx,
      ),
    ).toBe(`<img src="${PNG_DATA_URL}" alt="" width="96">`);
  });

  it('R25-10 : URL d’upload à schéma interdit → repli base64 et image-upload-failed', async () => {
    const image = await imagePackage();
    for (const url of [
      'javascript:alert(1)',
      ' JavaScript:alert(1)',
      'java\nscript:alert(1)',
      'data:text/html,<script>',
      'vbscript:x',
      'file:///etc/passwd',
    ]) {
      const ctx = await createTestContext(image, { upload: async () => url });
      expect(await ctx.images.drawing(fragment(drawingXml()), ctx)).toBe(
        `<img src="${PNG_DATA_URL}" alt="" width="200" height="100">`,
      );
      expect(ctx.warnings).toEqual([
        { code: 'image-upload-failed', message: expect.stringContaining('schéma') },
      ]);
    }
    for (const url of [
      'https://cdn/x.png',
      'http://cdn/x.png',
      'blob:https://app/uuid',
      'data:image/png;base64,AAAA',
      '/media/x.png',
      'media/x.png?v=1',
      '//cdn/x.png',
    ]) {
      const ctx = await createTestContext(image, { upload: async () => ` ${url} ` });
      expect(await ctx.images.drawing(fragment(drawingXml()), ctx)).toBe(
        `<img src="${url}" alt="" width="200" height="100">`,
      );
      expect(ctx.warnings).toEqual([]);
    }
    expect(isSafeImageUrl('')).toBe(false);
    expect(isSafeImageUrl('DATA:IMAGE/svg+xml,<svg/>')).toBe(true);
  });

  it('R25-10 : dimensions bornées à 20 000 px, exposant VML lu, valeurs non finies ignorées', async () => {
    const ctx = await createTestContext(await imagePackage());
    const huge = fragment(
      drawingXml().replace('cx="1905000" cy="952500"', 'cx="99999999999999" cy="-5"'),
    );
    expect(await ctx.images.drawing(huge, ctx)).toBe(
      `<img src="${PNG_DATA_URL}" alt="" width="${String(MAX_IMAGE_PX)}">`,
    );
    const infinite = fragment(
      drawingXml().replace('cx="1905000" cy="952500"', 'cx="1e400" cy="abc"'),
    );
    expect(await ctx.images.drawing(infinite, ctx)).toBe(`<img src="${PNG_DATA_URL}" alt="">`);
    const vml = fragment(
      '<w:pict><v:shape style="width:1e9pt;height:1.5e1pt"><v:imagedata r:id="rId5"/></v:shape></w:pict>',
    );
    expect(await ctx.images.drawing(vml, ctx)).toBe(
      `<img src="${PNG_DATA_URL}" alt="" width="20000" height="20">`,
    );
    expect(ctx.warnings).toEqual([]);
  });

  it('utilise les relations de la partie courante (image dans un en-tête)', async () => {
    const pkg = await buildPackage('', {
      parts: {
        'word/_rels/header1.xml.rels': `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/logo.png"/></Relationships>`,
        'word/media/logo.png': PNG_1X1,
      },
    });
    const ctx = await createTestContext(pkg, {}, { part: 'word/header1.xml', where: 'header' });
    expect(
      await createImageConverter(pkg, ctx.options).drawing(fragment(drawingXml()), ctx),
    ).toContain(PNG_DATA_URL);
  });
});
