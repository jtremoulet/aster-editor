import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../../export/export-docx';
import { RED_PNG_DATA_URL } from '../../export/testing/sample';
import {
  alterTemplate,
  bodyOf,
  checkIntegrity,
  differingParts,
  exportInTemplate,
  fixture,
  fixturePath,
  importStyled,
  normalizeXml,
  partsOf,
  textOf,
  topLevelBlocks,
} from './testing';

/**
 * Correctifs de la relecture R27 (lot F27), suite : corps greffé (styles, identifiants,
 * sections, en-têtes relus, bordures, blancs) et intégrité des fixtures. Chaque test reprend
 * la preuve du relecteur (`docs/reviews/R27.md`).
 */

const CLIENT = 'client/Modele_Demo_DER.docx';

describe('R27-07 : type des styles référencés', () => {
  it('un style de caractère sur un paragraphe (et inversement) est retiré avec avertissement', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate(
      '<p data-docx-style="Hyperlink">p</p><p><span data-docx-run-style="Heading1">r</span></p>' +
        '<table data-docx-style="Citation"><tr><td><p>c</p></td></tr></table>',
      template,
    );
    const document = textOf(result.parts, 'word/document.xml');
    expect(document).not.toContain('<w:pStyle w:val="Hyperlink"/>');
    expect(document).not.toContain('<w:rStyle w:val="Heading1"/>');
    expect(document).not.toContain('<w:tblStyle w:val="Citation"/>');
    const messages = result.warnings
      .filter((warning) => warning.code === 'template-style-missing')
      .map((warning) => warning.message);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toContain('« Hyperlink » de caractère référencé comme style de paragraphe');
    expect(messages[1]).toContain('« Heading1 » de paragraphe référencé comme style de caractère');
    expect(messages[2]).toContain('« Citation » de paragraphe référencé comme style de tableau');
    expect(checkIntegrity(result.parts)).toEqual([]);
  });
});

describe('R27-08 et dette (b) : identifiants bornés à xsd:int', () => {
  it('numId 2147483647 dans le gabarit : la liste neuve reçoit un id libre sous le plafond', async () => {
    const source = await fixture('15-listes-numerotation.docx');
    const numbering = textOf(await partsOf(source), 'word/numbering.xml');
    const abstractId = /<w:abstractNum w:abstractNumId="(\d+)"/.exec(numbering)?.[1] ?? '';
    expect(abstractId).not.toBe('');
    const template = await alterTemplate(source, {
      replace: {
        'word/numbering.xml': numbering.replace(
          '</w:numbering>',
          `<w:num w:numId="2147483647"><w:abstractNumId w:val="${abstractId}"/></w:num></w:numbering>`,
        ),
      },
    });
    const result = await exportInTemplate('<ul><li><p>a</p></li></ul>', template);
    const used = Array.from(
      textOf(result.parts, 'word/document.xml').matchAll(/<w:numId w:val="(\d+)"\/>/g),
    ).map((match) => Number(match[1]));
    expect(used).toHaveLength(1);
    expect(used[0]).toBeLessThanOrEqual(2147483647);
    expect(used[0]).toBeGreaterThan(0);
    expect(textOf(result.parts, 'word/numbering.xml')).toContain(
      `<w:num w:numId="${String(used[0])}">`,
    );
    expect(checkIntegrity(result.parts)).toEqual([]);
  });

  it('<ol start> démesuré : w:start et w:startOverride bornés à 2147483647', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate(
      '<ol start="99999999999999999"><li><p>b</p></li></ol>',
      template,
    );
    const numbering = textOf(result.parts, 'word/numbering.xml');
    expect(numbering).toContain('<w:startOverride w:val="2147483647"/>');
    expect(numbering).not.toContain('9007199254740991');
    const fresh = textOf(
      await partsOf(
        await (
          await exportDocx('<ol start="99999999999999999"><li><p>b</p></li></ol>')
        ).arrayBuffer(),
      ),
      'word/numbering.xml',
    );
    expect(fresh).toContain('<w:start w:val="2147483647"/>');
  });
});

describe('R27-09 : gabarit sans w:sectPr final', () => {
  it('layout.headers ignoré avec avertissement template-section-missing', async () => {
    const source = await fixture('13-styles-nommes.docx');
    const document = textOf(await partsOf(source), 'word/document.xml');
    const template = await alterTemplate(source, {
      replace: { 'word/document.xml': document.replace(/<w:sectPr>[\s\S]*<\/w:sectPr>/, '') },
    });
    const result = await exportInTemplate('<p>Corps</p>', template, {
      layout: { headers: { default: { html: '<p>En-tête</p>' } } },
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(['template-section-missing']);
    expect(differingParts(await partsOf(template), result.parts)).toEqual(['word/document.xml']);
    expect(checkIntegrity(result.parts)).toEqual([]);
    const silent = await exportInTemplate('<p>Corps</p>', template);
    expect(silent.warnings).toEqual([]);
  });
});

describe('R27-10 : en-têtes du gabarit lus sans import complet', () => {
  it('un pied avec champs de fusion est comparé après le même prétraitement qu’à l’import', async () => {
    const source = await fixture('16-sections.docx');
    const parts = await partsOf(source);
    // Le pied par défaut effectif (dernière section) : celui qui porte « pied par défaut ».
    const footerPath = Array.from(parts.keys()).find(
      (path) =>
        /^word\/footer\d+\.xml$/.test(path) && textOf(parts, path).includes('pied par défaut'),
    );
    expect(footerPath).toBeDefined();
    const footer = textOf(parts, footerPath ?? '');
    const fields =
      '<w:p><w:r><w:t xml:space="preserve">Dossier </w:t></w:r>' +
      '<w:fldSimple w:instr=" MERGEFIELD dossier "><w:r><w:t>«dossier»</w:t></w:r></w:fldSimple></w:p>';
    const template = await alterTemplate(source, {
      replace: { [footerPath ?? '']: footer.replace(/<w:p>.*<\/w:p>/, fields) },
    });
    const imported = await importStyled(template);
    expect(JSON.stringify(imported.layout.footers)).toContain('dossier');
    const result = await exportInTemplate('<p>Corps</p>', template, { layout: imported.layout });
    expect(result.warnings).toEqual([]);
    expect(differingParts(await partsOf(template), result.parts)).toEqual(['word/document.xml']);
  });

  it('layout identique sur 16 : rien n’est régénéré ; en-tête modifié : seul lui l’est', async () => {
    const template = await fixture('16-sections.docx');
    const imported = await importStyled(template);
    const same = await exportInTemplate('<p>Corps</p>', template, { layout: imported.layout });
    expect(differingParts(await partsOf(template), same.parts)).toEqual(['word/document.xml']);
    const changed = await exportInTemplate('<p>Corps</p>', template, {
      layout: {
        ...imported.layout,
        headers: { ...imported.layout.headers, first: { html: '<p>Première neuve</p>' } },
      },
    });
    const created = differingParts(await partsOf(template), changed.parts).filter((path) =>
      /^word\/(header|footer)\d+\.xml$/.test(path),
    );
    expect(created).toHaveLength(1);
    const again = await importStyled(changed.buffer);
    expect(again.layout.headers?.first?.html).toContain('Première neuve');
    expect(again.layout.headers?.default).toEqual(imported.layout.headers?.default);
    expect(again.layout.footers).toEqual(imported.layout.footers);
  });
});

describe('R27-11 : w:space des bordures de paragraphe', () => {
  it('fixture 12 : l’encadré quatre côtés ressort avec w:space="1" partout, identique à l’original', async () => {
    const template = await fixture('12-paragraphes.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template);
    const originalBlocks = topLevelBlocks(
      normalizeXml(bodyOf(textOf(await partsOf(template), 'word/document.xml'))),
    );
    const blocks = topLevelBlocks(normalizeXml(bodyOf(textOf(result.parts, 'word/document.xml'))));
    const box = /<w:pBdr><w:top[^>]*\/><w:left[^>]*\/><w:bottom[^>]*\/><w:right[^>]*\/><\/w:pBdr>/;
    const before = originalBlocks.find((block) => box.test(block));
    const after = blocks.find((block) => box.test(block));
    expect(before).toBeDefined();
    expect(after).toBe(before);
    expect(after).toContain('<w:left w:val="single" w:color="000000" w:sz="8" w:space="1"/>');
  });

  it('export neuf : encadré à 1 pt, filet vertical seul à 4 pt', async () => {
    const document = textOf(
      await partsOf(
        await (
          await exportDocx(
            '<p style="border: 1pt solid #000000">Encadré</p><p style="border-left: 1.5pt solid #808080">Barre</p><p style="border-bottom: 1pt solid #000000">Filet</p>',
          )
        ).arrayBuffer(),
      ),
      'word/document.xml',
    );
    const borders = Array.from(
      document.matchAll(/<w:(top|left|bottom|right) [^>]*w:space="(\d)"/g),
    ).map((match) => `${match[1]}:${match[2]}`);
    expect(borders).toEqual(['top:1', 'left:1', 'bottom:1', 'right:1', 'left:4', 'bottom:1']);
  });
});

describe('dette (a) : espace finale d’un paragraphe conservée', () => {
  it('fixture 17 : import → export gabarit → import strictement idempotent', async () => {
    const template = await fixture('17-objets-perdus.docx');
    const imported = await importStyled(template);
    expect(imported.html).toContain('Forme (wps:wsp sans texte) : </p>');
    const result = await exportInTemplate(imported.html, template);
    expect(textOf(result.parts, 'word/document.xml')).toContain(
      '<w:t xml:space="preserve">Forme (wps:wsp sans texte) : </w:t>',
    );
    const again = await importStyled(result.buffer);
    expect(again.html).toBe(imported.html);
  });

  it.skipIf(!existsSync(fixturePath(CLIENT)))(
    'document client : idempotence stricte hors cellules et liens',
    async () => {
      const template = await fixture(CLIENT);
      const imported = await importStyled(template);
      const result = await exportInTemplate(imported.html, template, {
        variables: { mode: 'resolve', values: {} },
      });
      const again = await importStyled(result.buffer);
      // Limites connues du lot L27 (bordures `nil` de cellule, lien `HYPERLINK` en champ) et
      // règle de blancs HTML (deux espaces consécutives réduites à une) : neutralisées. L'espace
      // finale, elle, est conservée telle quelle.
      const comparable = (html: string): string =>
        html
          .replace(/<(td|th)([^>]*?) style="[^"]*"/g, '<$1$2')
          .replace(/<a href="([^"]*)">[\s\S]*?<\/a>/g, '<a href="$1"></a>')
          .replace(/ {2,}/g, ' ');
      expect(imported.html).toMatch(/exigences\. {2}<\/span>/);
      expect(again.html).toMatch(/exigences\. <\/span>/);
      expect(comparable(again.html)).toBe(comparable(imported.html));
    },
  );
});

describe('intégrité après correctifs (fixtures 11-17, 03, 09)', () => {
  for (const name of [
    '11-styles-inline.docx',
    '12-paragraphes.docx',
    '13-styles-nommes.docx',
    '14-tableaux-riches.docx',
    '15-listes-numerotation.docx',
    '16-sections.docx',
    '17-objets-perdus.docx',
    '03-images.docx',
    '09-variables-mergefields.docx',
  ]) {
    it(`${name} : aller-retour sans problème d’intégrité ni avertissement`, async () => {
      const template = await fixture(name);
      const imported = await importStyled(template);
      const result = await exportInTemplate(
        `${imported.html}<p><img src="${RED_PNG_DATA_URL}" alt="r"></p>`,
        template,
      );
      expect(checkIntegrity(result.parts)).toEqual([]);
      expect(result.warnings).toEqual([]);
    });
  }
});
