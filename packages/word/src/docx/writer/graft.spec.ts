import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx.js';
import { RED_PNG_DATA_URL } from '../../export/testing/sample.js';
import {
  alterTemplate,
  bodyOf,
  differingParts,
  exportInTemplate,
  finalSectPr,
  fixture,
  fixturePath,
  importStyled,
  normalizeXml,
  partsOf,
  textOf,
  topLevelBlocks,
} from './testing.js';

/** GIF 1x1 en base64 : une seconde image, d'un autre format que le PNG des fixtures. */
const GIF_DATA_URL =
  'data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==';

/** HTML comparable : blancs réduits, blancs collés aux balises et spans vides retirés. */
function normalizeHtml(html: string): string {
  return html
    .replace(/\s+/g, ' ')
    .replace(/\s+</g, '<')
    .replace(/>\s+/g, '>')
    .replace(/<span[^>]*><\/span>/g, '')
    .trim();
}

/** Blocs normalisés du corps d'un `document.xml`. */
function blocksOf(xml: string): string[] {
  return topLevelBlocks(normalizeXml(bodyOf(xml)));
}

/** Tous les `w:sectPr` d'un `document.xml`, dans l'ordre, tels qu'écrits. */
function allSectPrsOf(xml: string): string[] {
  return xml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>|<w:sectPr\b[^>]*\/>/g) ?? [];
}

const STYLED_FIXTURES = [
  '11-styles-inline.docx',
  '12-paragraphes.docx',
  '13-styles-nommes.docx',
  '14-tableaux-riches.docx',
  '15-listes-numerotation.docx',
  '16-sections.docx',
  '17-objets-perdus.docx',
];

describe('greffe sans modification (fixtures 11-17)', () => {
  for (const name of STYLED_FIXTURES) {
    it(`${name} : parties hors corps identiques à l'octet, sectPr conservé, import idempotent`, async () => {
      const template = await fixture(name);
      const imported = await importStyled(template);
      const result = await exportInTemplate(imported.html, template);
      const original = await partsOf(template);
      expect(result.warnings).toEqual([]);
      expect(differingParts(original, result.parts)).toEqual(
        differingParts(original, result.parts).filter((path) => path === 'word/document.xml'),
      );
      // Le sectPr final est celui du gabarit, aux références héritées des sections précédentes près.
      const withoutReferences = (xml: string): string =>
        xml.replace(/<w:(?:headerReference|footerReference)[^>]*\/>|<w:titlePg\/>/g, '');
      const resultSectPr = finalSectPr(textOf(result.parts, 'word/document.xml'));
      const originalSectPr = finalSectPr(textOf(original, 'word/document.xml'));
      expect(withoutReferences(resultSectPr)).toBe(withoutReferences(originalSectPr));
      for (const reference of originalSectPr.match(
        /<w:(?:headerReference|footerReference)[^>]*\/>/g,
      ) ?? []) {
        expect(resultSectPr).toContain(reference);
      }
      const again = await importStyled(result.buffer);
      expect(normalizeHtml(again.html)).toBe(normalizeHtml(imported.html));
      expect(again.layout).toEqual(imported.layout);
    });
  }

  it('13 et 11 : le corps régénéré est identique à l’octet à celui du gabarit', async () => {
    for (const name of ['13-styles-nommes.docx', '11-styles-inline.docx']) {
      const template = await fixture(name);
      const imported = await importStyled(template);
      const result = await exportInTemplate(imported.html, template);
      expect(differingParts(await partsOf(template), result.parts)).toEqual([]);
    }
  });
});

describe('greffe avec modification locale', () => {
  it('un mot changé : seul ce bloc diffère dans document.xml (fixture 13)', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const imported = await importStyled(template);
    const edited = imported.html.replace(
      'Retour au paragraphe Normal',
      'Retour au paragraphe Final',
    );
    expect(edited).not.toBe(imported.html);
    const result = await exportInTemplate(edited, template);
    const before = blocksOf(textOf(await partsOf(template), 'word/document.xml'));
    const after = blocksOf(textOf(result.parts, 'word/document.xml'));
    expect(after.length).toBe(before.length);
    const changed = after.filter((block, index) => block !== before[index]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('Retour au paragraphe Final');
    expect(changed[0]).toBe(before[before.length - 1]?.replace('Normal', 'Final'));
  });

  it('un mot changé : seul ce bloc diffère dans document.xml (fixture 11, styles inline)', async () => {
    const template = await fixture('11-styles-inline.docx');
    const imported = await importStyled(template);
    const edited = imported.html.replace('Tout cumulé', 'Tout accumulé');
    expect(edited).not.toBe(imported.html);
    const result = await exportInTemplate(edited, template);
    expect(result.warnings).toEqual([]);
    expect(differingParts(await partsOf(template), result.parts)).toEqual(['word/document.xml']);
    const before = blocksOf(textOf(await partsOf(template), 'word/document.xml'));
    const after = blocksOf(textOf(result.parts, 'word/document.xml'));
    expect(after.length).toBe(before.length);
    const changed = after.filter((block, index) => block !== before[index]);
    expect(changed).toHaveLength(1);
    expect(changed[0]).toContain('Tout accumulé');
    const index = after.indexOf(changed[0] ?? '');
    expect(changed[0]).toBe(before[index]?.replace('Tout cumulé', 'Tout accumulé'));
  });

  it('un mot changé dans un tableau : les autres parties restent intactes (fixture 14)', async () => {
    const template = await fixture('14-tableaux-riches.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(
      imported.html.replace('Cellule C2', 'Cellule C2 modifiée'),
      template,
    );
    expect(differingParts(await partsOf(template), result.parts)).toEqual(['word/document.xml']);
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('Cellule C2 modifiée');
  });
});

describe('listes', () => {
  it('réutilise les numId du gabarit (fixture 15) sans toucher numbering.xml', async () => {
    const template = await fixture('15-listes-numerotation.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template);
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).toEqual(['word/document.xml']);
    const templateIds = new Set(
      Array.from(textOf(original, 'word/numbering.xml').matchAll(/<w:num w:numId="(\d+)"/g)).map(
        (match) => match[1],
      ),
    );
    const used = Array.from(
      textOf(result.parts, 'word/document.xml').matchAll(/<w:numId w:val="(\d+)"\/>/g),
    ).map((match) => match[1]);
    expect(used.length).toBeGreaterThan(10);
    for (const id of used) expect(templateIds.has(id)).toBe(true);
    // Les niveaux imbriqués gardent leur `ilvl` et leur numId commun.
    expect(textOf(result.parts, 'word/document.xml')).toContain(
      '<w:numPr><w:ilvl w:val="2"/><w:numId w:val="7"/></w:numPr>',
    );
  });

  it('ajoute une liste neuve dans le gabarit sous un numId libre, sans avertissement', async () => {
    const template = await fixture('15-listes-numerotation.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(
      `${imported.html}<ul><li><p>Nouvelle puce</p></li></ul><ol start="4"><li><p>Quatre</p></li></ol>`,
      template,
    );
    expect(result.warnings).toEqual([]);
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).toEqual([
      'word/document.xml',
      'word/numbering.xml',
    ]);
    const numbering = textOf(result.parts, 'word/numbering.xml');
    const originalNumbering = textOf(original, 'word/numbering.xml');
    // Les définitions du gabarit sont conservées telles quelles, les nouvelles ajoutées après.
    const abstractCount = (xml: string): number => xml.split('<w:abstractNum ').length - 1;
    const numCount = (xml: string): number => xml.split('<w:num w:numId').length - 1;
    expect(abstractCount(numbering)).toBe(abstractCount(originalNumbering) + 2);
    expect(numCount(numbering)).toBe(numCount(originalNumbering) + 2);
    expect(numbering).toContain('<w:startOverride w:val="4"/>');
    const document = textOf(result.parts, 'word/document.xml');
    const bullet = /<w:t xml:space="preserve">Nouvelle puce<\/w:t>/.exec(document);
    expect(bullet).not.toBeNull();
    const paragraph = document.slice(document.lastIndexOf('<w:p>', bullet?.index), bullet?.index);
    const numId = /<w:numId w:val="(\d+)"\/>/.exec(paragraph)?.[1] ?? '';
    expect(Number(numId)).toBeGreaterThan(8);
    expect(numbering).toContain(`<w:num w:numId="${numId}">`);
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('Nouvelle puce');
    expect(again.html).toMatch(/<ol data-docx-num-id="\d+" start="4"><li><p[^>]*>Quatre<\/p>/);
  });

  it('retrouve le niveau d’une liste Word relue à plat d’après sa puce (fixture 15)', async () => {
    const template = await fixture('15-listes-numerotation.docx');
    const result = await exportInTemplate(
      '<ul data-bullet="–" data-docx-num-id="5"><li><p data-docx-style="ListParagraph">Niveau 2 sans parent</p></li></ul>' +
        '<ol type="I" data-docx-num-id="4"><li><p data-docx-style="ListParagraph">Romain</p></li></ol>',
      template,
    );
    const document = textOf(result.parts, 'word/document.xml');
    expect(document).toContain('<w:numPr><w:ilvl w:val="1"/><w:numId w:val="5"/></w:numPr>');
    expect(document).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="4"/></w:numPr>');
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('<ul data-bullet="–" data-docx-num-id="5">');
  });

  it('replie en numérotation neuve avec avertissement si le gabarit n’a pas de numbering.xml', async () => {
    const source = await fixture('15-listes-numerotation.docx');
    const imported = await importStyled(source);
    const template = await alterTemplate(source, { remove: ['word/numbering.xml'] });
    expect((await partsOf(template)).has('word/numbering.xml')).toBe(false);
    const result = await exportInTemplate(imported.html, template);
    expect(result.warnings.map((warning) => warning.code)).toContain('template-numbering-fallback');
    expect(result.parts.has('word/numbering.xml')).toBe(true);
    expect(textOf(result.parts, '[Content_Types].xml')).toContain('PartName="/word/numbering.xml"');
    expect(textOf(result.parts, 'word/_rels/document.xml.rels')).toContain(
      'Target="numbering.xml"',
    );
    const again = await importStyled(result.buffer);
    expect(again.html).toMatch(/<ol data-docx-num-id="\d+"><li><p[^>]*>Liste décimale : premier/);
    expect(again.html).toContain('type="a"');
  });
});

describe('styles', () => {
  it('réutilise Citation sans propriétés directes redondantes, surcharge conservée (fixture 13)', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate(
      '<p style="line-height: 1.15; margin-bottom: 8pt; margin-left: 28.35pt; border-left: 1.5pt solid #808080" data-docx-style="Citation"><em>Citation</em></p>' +
        '<p style="line-height: 1.15; margin-bottom: 8pt; margin-left: 28.35pt; border-left: 1.5pt solid #808080" data-docx-style="Citation"><em><span style="color: #00b050">Verte</span></em></p>' +
        '<p style="line-height: 1.15; margin-bottom: 8pt; margin-left: 28.35pt; border-left: 1.5pt solid #808080" data-docx-style="Important"><strong><em><span style="color: #c00000">Important</span></em></strong></p>' +
        '<p data-docx-style="Important">Sans rien</p>',
      template,
    );
    const body = normalizeXml(bodyOf(textOf(result.parts, 'word/document.xml')));
    expect(body).toContain(
      '<w:p><w:pPr><w:pStyle w:val="Citation"/></w:pPr><w:r><w:t xml:space="preserve">Citation</w:t></w:r></w:p>',
    );
    expect(body).toContain(
      '<w:p><w:pPr><w:pStyle w:val="Citation"/></w:pPr><w:r><w:rPr><w:color w:val="00B050"/></w:rPr><w:t xml:space="preserve">Verte</w:t></w:r></w:p>',
    );
    expect(body).toContain(
      '<w:p><w:pPr><w:pStyle w:val="Important"/></w:pPr><w:r><w:t xml:space="preserve">Important</w:t></w:r></w:p>',
    );
    // Sans mise en page ni marques dans le HTML : le style est annulé propriété par propriété
    // (le lecteur n'écrit que ce qui diffère des docDefaults, un HTML nu signifie docDefaults),
    // sauf l'interligne et l'espacement après : un HTML nu y signifie le `Normal` du
    // document (1,15 / 8 pt), qu'`Important` hérite déjà — rien à réécrire (R53-01).
    expect(body).toContain(
      '<w:p><w:pPr><w:pStyle w:val="Important"/><w:pBdr><w:left w:val="nil"/></w:pBdr><w:ind w:left="0"/></w:pPr>' +
        '<w:r><w:rPr><w:b w:val="0"/><w:bCs w:val="0"/><w:i w:val="0"/><w:iCs w:val="0"/><w:color w:val="auto"/></w:rPr><w:t xml:space="preserve">Sans rien</w:t></w:r></w:p>',
    );
    expect(result.warnings).toEqual([]);
  });

  it('numérotation portée par un style : annulée quand le paragraphe n’est pas dans une liste', async () => {
    const source = await fixture('15-listes-numerotation.docx');
    const styles = textOf(await partsOf(source), 'word/styles.xml');
    const template = await alterTemplate(source, {
      replace: {
        'word/styles.xml': styles.replace(
          '</w:styles>',
          '<w:style w:type="paragraph" w:styleId="Puce"><w:name w:val="Puce"/><w:basedOn w:val="Normal"/><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr></w:style></w:styles>',
        ),
      },
    });
    const result = await exportInTemplate(
      '<p data-docx-style="Puce">Sans puce</p><ul data-docx-num-id="5"><li><p data-docx-style="Puce">Avec puce</p></li></ul>',
      template,
    );
    const body = normalizeXml(bodyOf(textOf(result.parts, 'word/document.xml')));
    expect(body).toContain(
      '<w:pPr><w:pStyle w:val="Puce"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="0"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">Sans puce</w:t>',
    );
    expect(body).toContain(
      '<w:pPr><w:pStyle w:val="Puce"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="5"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">Avec puce</w:t>',
    );
    const again = await importStyled(result.buffer);
    expect(again.html).toMatch(/<p data-docx-style="Puce">Sans puce<\/p><ul /);
  });

  it('style absent partout : propriétés directes seules et avertissement template-style-missing', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate(
      '<p data-docx-style="Inconnu" style="margin-left: 20pt"><span data-docx-run-style="Nulle">x</span></p>',
      template,
    );
    const codes = result.warnings.map((warning) => warning.code);
    expect(codes.filter((code) => code === 'template-style-missing')).toHaveLength(2);
    const body = textOf(result.parts, 'word/document.xml');
    expect(body).not.toContain('Inconnu');
    expect(body).not.toContain('Nulle');
    expect(body).toContain('<w:ind w:left="400"/>');
  });

  it('ajoute à styles.xml les styles de l’export absents du gabarit (Quote, Code)', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate(
      '<blockquote><p>Citation éditeur</p></blockquote><p><code>code</code></p><pre>bloc</pre>',
      template,
    );
    const original = await partsOf(template);
    expect(textOf(original, 'word/styles.xml')).not.toContain('w:styleId="Quote"');
    expect(differingParts(original, result.parts)).toEqual([
      'word/document.xml',
      'word/styles.xml',
    ]);
    const styles = textOf(result.parts, 'word/styles.xml');
    expect(styles).toContain('w:styleId="Quote"');
    expect(styles).toContain('w:styleId="Code"');
    expect(styles).toContain('w:styleId="HTMLPreformatted"');
    // Les styles du gabarit sont intacts, les ajouts viennent après.
    expect(styles.startsWith(textOf(original, 'word/styles.xml').replace('</w:styles>', ''))).toBe(
      true,
    );
    expect(textOf(result.parts, 'word/document.xml')).toContain('<w:pStyle w:val="Quote"/>');
    expect(result.warnings).toEqual([]);
  });
});

describe('images', () => {
  it('ajoute une image dans un gabarit qui en a déjà, sans collision, types de contenu à jour', async () => {
    const template = await fixture('03-images.docx');
    const imported = await importStyled(template);
    const originalParts = await partsOf(template);
    const originalMedia = Array.from(originalParts.keys()).filter((path) =>
      path.startsWith('word/media/'),
    );
    expect(originalMedia.length).toBeGreaterThan(0);
    const result = await exportInTemplate(
      `${imported.html}<p><img src="${GIF_DATA_URL}" alt="gif"></p>`,
      template,
    );
    expect(result.warnings).toEqual([]);
    const media = Array.from(result.parts.keys()).filter((path) => path.startsWith('word/media/'));
    for (const path of originalMedia) expect(media).toContain(path);
    expect(media.length).toBe(originalMedia.length + 1);
    expect(media.some((path) => path.endsWith('.gif'))).toBe(true);
    expect(textOf(result.parts, '[Content_Types].xml')).toContain('Extension="gif"');
    const rels = textOf(result.parts, 'word/_rels/document.xml.rels');
    const ids = Array.from(rels.matchAll(/Id="([^"]+)"/g)).map((match) => match[1]);
    expect(new Set(ids).size).toBe(ids.length);
    const document = textOf(result.parts, 'word/document.xml');
    for (const embed of Array.from(document.matchAll(/r:embed="([^"]+)"/g)).map((m) => m[1])) {
      expect(rels).toContain(`Id="${embed}"`);
    }
    const again = await importStyled(result.buffer);
    expect((again.html.match(/<img /g) ?? []).length).toBe(
      (imported.html.match(/<img /g) ?? []).length + 1,
    );
  });

  it('réutilise une image dont les octets sont déjà dans le gabarit', async () => {
    const template = await fixture('03-images.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template);
    const original = await partsOf(template);
    const diff = differingParts(original, result.parts);
    expect(diff.some((path) => path.startsWith('word/media/'))).toBe(false);
    expect(diff).not.toContain('[Content_Types].xml');
  });

  it('une image neuve dans un gabarit sans média', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate(
      `<p><img src="${RED_PNG_DATA_URL}" alt="rouge"></p>`,
      template,
    );
    expect(
      Array.from(result.parts.keys()).some((path) => /^word\/media\/.*\.png$/.test(path)),
    ).toBe(true);
    expect(textOf(result.parts, 'word/_rels/document.xml.rels')).toContain('relationships/image');
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('<img ');
  });
});

describe('notes de bas de page', () => {
  const NOTE_HTML =
    '<p>Texte<sup data-footnote-ref="1">1</sup></p><ol data-footnotes=""><li data-footnote="footnote-1"><p>La note</p></li></ol>';

  it('corps avec notes dans un gabarit sans footnotes.xml : partie créée, relation et type ajoutés', async () => {
    const template = await alterTemplate(await fixture('12-paragraphes.docx'), {
      remove: ['word/footnotes.xml'],
    });
    expect((await partsOf(template)).has('word/footnotes.xml')).toBe(false);
    const result = await exportInTemplate(NOTE_HTML, template);
    expect(result.warnings).toEqual([]);
    expect(result.parts.has('word/footnotes.xml')).toBe(true);
    const footnotes = textOf(result.parts, 'word/footnotes.xml');
    expect(footnotes).toContain('w:type="separator"');
    expect(footnotes).toContain('La note');
    expect(textOf(result.parts, 'word/_rels/document.xml.rels')).toContain(
      'relationships/footnotes',
    );
    expect(textOf(result.parts, '[Content_Types].xml')).toContain('PartName="/word/footnotes.xml"');
    const again = await importStyled(result.buffer);
    expect(again.html).toContain('data-footnote-ref="1"');
    expect(again.html).toContain('La note');
  });

  it('corps avec notes dans un gabarit qui en a : notes ajoutées après celles du gabarit', async () => {
    const template = await fixture('12-paragraphes.docx');
    const original = textOf(await partsOf(template), 'word/footnotes.xml');
    const result = await exportInTemplate(NOTE_HTML, template);
    const footnotes = textOf(result.parts, 'word/footnotes.xml');
    expect(footnotes.startsWith(original.replace('</w:footnotes>', ''))).toBe(true);
    const id = /<w:footnoteReference w:id="(\d+)"\/>/.exec(
      textOf(result.parts, 'word/document.xml'),
    )?.[1];
    expect(id).toBeDefined();
    expect(footnotes).toContain(`<w:footnote w:id="${id ?? ''}">`);
  });

  it('corps sans note dans un gabarit avec notes : footnotes.xml intact', async () => {
    const template = await fixture('12-paragraphes.docx');
    const result = await exportInTemplate('<p>Sans note</p>', template);
    expect(differingParts(await partsOf(template), result.parts)).toEqual(['word/document.xml']);
  });
});

describe('variables dans le gabarit', () => {
  it('mode fields (fixture 09 ré-exportée) : champs présents, aller-retour conserve noms et valeurs', async () => {
    const template = await fixture('09-variables-mergefields.docx');
    const imported = await importStyled(template);
    const values = Object.fromEntries(
      imported.variables.map((variable) => [variable.name, variable.value ?? `[${variable.name}]`]),
    );
    const result = await exportInTemplate(imported.html, template, {
      variables: { mode: 'fields', values },
    });
    const document = textOf(result.parts, 'word/document.xml');
    expect((document.match(/MERGEFIELD/g) ?? []).length).toBeGreaterThanOrEqual(
      imported.variables.length,
    );
    const again = await importStyled(result.buffer);
    expect(again.variables.map((variable) => variable.name)).toEqual(
      imported.variables.map((variable) => variable.name),
    );
    for (const variable of again.variables) {
      expect(variable.value).toBe(values[variable.name]);
    }
  });

  it('gabarit illisible : avertissement template-invalid et export neuf valide', async () => {
    const result = await exportInTemplate('<p>Corps</p>', new ArrayBuffer(16));
    expect(result.warnings.map((warning) => warning.code)).toEqual(['template-invalid']);
    expect(result.parts.has('word/document.xml')).toBe(true);
    const again = await importDocx(result.buffer);
    expect(again.html).toContain('Corps');
  });
});

describe('en-têtes et pieds du gabarit', () => {
  it('fixture 16 : les deux sections ressortent avec leur w:sectPr du gabarit, en-têtes relus identiques', async () => {
    const template = await fixture('16-sections.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template);
    const document = textOf(result.parts, 'word/document.xml');
    expect(allSectPrsOf(document)).toEqual(
      allSectPrsOf(textOf(await partsOf(template), 'word/document.xml')),
    );
    const sectPr = finalSectPr(document);
    expect(sectPr).toContain('<w:headerReference w:type="default" r:id="rId10"/>');
    expect(sectPr).toContain('<w:cols w:space="720" w:num="2" w:equalWidth="true"/>');
    const again = await importStyled(result.buffer);
    expect(again.layout.headers).toEqual(imported.layout.headers);
    expect(again.layout.footers).toEqual(imported.layout.footers);
    expect(again.layout.sections).toEqual(imported.layout.sections);
  });

  it('corps sans saut de section dans un gabarit à deux sections : le sectPr final hérite des références de la section 1 abandonnée', async () => {
    const template = await fixture('16-sections.docx');
    const result = await exportInTemplate('<p>Une seule section</p>', template);
    const document = textOf(result.parts, 'word/document.xml');
    expect(allSectPrsOf(document)).toHaveLength(1);
    const sectPr = finalSectPr(document);
    expect(sectPr).toContain('<w:headerReference w:type="first" r:id="rId7"/>');
    expect(sectPr).toContain('<w:footerReference w:type="first" r:id="rId9"/>');
    expect(sectPr).toContain('<w:headerReference w:type="default" r:id="rId10"/>');
    // `w:titlePg` de la section 1 abandonnée n'est pas hérité : Word ne le fait pas (R43-06).
    expect(sectPr).not.toContain('<w:titlePg/>');
    expect(sectPr).toContain('<w:cols w:space="720" w:num="2" w:equalWidth="true"/>');
  });

  it('mode resolve : {{client}} de l’en-tête (fixture 16) résolu, autres parties intactes', async () => {
    const template = await fixture('16-sections.docx');
    const original = await partsOf(template);
    expect(textOf(original, 'word/header1.xml')).toContain('{{client}}');
    const result = await exportInTemplate('<p>Corps</p>', template, {
      variables: { mode: 'resolve', values: { client: 'ACME & Fils' } },
    });
    expect(differingParts(original, result.parts)).toEqual([
      'word/document.xml',
      'word/header1.xml',
    ]);
    const header = textOf(result.parts, 'word/header1.xml');
    expect(header).toContain('Rapport — ACME &amp; Fils');
    expect(header).not.toContain('{{client}}');
    expect(result.warnings).toEqual([]);
  });

  it('style de l’export renommé vers le style de même nom du gabarit (Hyperlink localisé)', async () => {
    const source = await fixture('13-styles-nommes.docx');
    const styles = textOf(await partsOf(source), 'word/styles.xml');
    const template = await alterTemplate(source, {
      replace: {
        'word/styles.xml': styles.replace('w:styleId="Hyperlink"', 'w:styleId="Lienhypertexte"'),
      },
    });
    const result = await exportInTemplate(
      '<p><a href="https://example.com">lien</a></p>',
      template,
    );
    expect(differingParts(await partsOf(template), result.parts)).toEqual([
      'word/_rels/document.xml.rels',
      'word/document.xml',
    ]);
    expect(textOf(result.parts, 'word/document.xml')).toContain(
      '<w:rStyle w:val="Lienhypertexte"/>',
    );
    expect(result.warnings).toEqual([]);
  });

  it('mode resolve sans valeur : {{nom}} laissé avec variable-unresolved ; modes fields et placeholders : rien ne change', async () => {
    const template = await fixture('16-sections.docx');
    const original = await partsOf(template);
    const unresolved = await exportInTemplate('<p>Corps</p>', template, {
      variables: { mode: 'resolve', values: {} },
    });
    expect(unresolved.warnings.map((warning) => warning.code)).toEqual(['variable-unresolved']);
    expect(differingParts(original, unresolved.parts)).toEqual(['word/document.xml']);
    for (const mode of ['fields', 'placeholders'] as const) {
      const result = await exportInTemplate('<p>Corps</p>', template, {
        variables: { mode, values: { client: 'ACME' } },
      });
      expect(differingParts(original, result.parts)).toEqual(['word/document.xml']);
    }
  });

  it('mode resolve : champs de fusion simple et complexe d’un pied de page remplacés par leur valeur', async () => {
    const source = await fixture('16-sections.docx');
    const footer = textOf(await partsOf(source), 'word/footer1.xml');
    const fields =
      '<w:p><w:r><w:t xml:space="preserve">Dossier </w:t></w:r>' +
      '<w:fldSimple w:instr=" MERGEFIELD dossier "><w:r><w:rPr><w:b/></w:rPr><w:t>«dossier»</w:t></w:r></w:fldSimple>' +
      '<w:r><w:t xml:space="preserve"> pour </w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> MERGEFIELD client </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>«client»</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    const template = await alterTemplate(source, {
      replace: { 'word/footer1.xml': footer.replace(/<w:p>.*<\/w:p>/, fields) },
    });
    const result = await exportInTemplate('<p>Corps</p>', template, {
      variables: { mode: 'resolve', values: { dossier: 'D-42', client: 'ACME' } },
    });
    const resolved = textOf(result.parts, 'word/footer1.xml');
    expect(resolved).not.toContain('MERGEFIELD');
    expect(resolved).not.toContain('fldChar');
    expect(resolved).toContain('<w:b/>');
    expect(resolved.replace(/<[^>]+>/g, '')).toContain('Dossier D-42 pour ACME');
    const kept = await exportInTemplate('<p>Corps</p>', template, {
      variables: { mode: 'fields', values: { dossier: 'D-42' } },
    });
    expect(textOf(kept.parts, 'word/footer1.xml')).toContain('MERGEFIELD');
  });

  it('layout.headers différent du gabarit : en-tête régénéré, ancien intact, sectPr mis à jour', async () => {
    const template = await fixture('16-sections.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate('<p>Corps</p>', template, {
      layout: {
        ...imported.layout,
        headers: {
          ...imported.layout.headers,
          default: { html: '<p>Nouvel en-tête <strong>gras</strong></p>' },
        },
      },
    });
    expect(result.warnings).toEqual([]);
    const original = await partsOf(template);
    const diff = differingParts(original, result.parts);
    expect(diff).toContain('word/document.xml');
    expect(diff).toContain('word/_rels/document.xml.rels');
    expect(diff).toContain('[Content_Types].xml');
    const created = diff.find((path) => /^word\/header\d+\.xml$/.test(path) && !original.has(path));
    expect(created).toBeDefined();
    expect(diff.filter((path) => original.has(path) && /header|footer/.test(path))).toEqual([]);
    expect(textOf(result.parts, created ?? '')).toContain('Nouvel en-tête');
    const again = await importStyled(result.buffer);
    expect(again.layout.headers?.default?.html).toContain('Nouvel en-tête <strong>gras</strong>');
    expect(again.layout.headers?.first).toEqual(imported.layout.headers?.first);
    expect(again.layout.footers).toEqual(imported.layout.footers);
  });

  it('layout.headers identique au gabarit : aucune partie d’en-tête réécrite', async () => {
    const template = await fixture('16-sections.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate('<p>Corps</p>', template, { layout: imported.layout });
    expect(differingParts(await partsOf(template), result.parts)).toEqual(['word/document.xml']);
  });

  it('layout.footers sur un gabarit sans pied : pied ajouté', async () => {
    const template = await fixture('13-styles-nommes.docx');
    const result = await exportInTemplate('<p>Corps</p>', template, {
      layout: { footers: { default: { html: '<p style="text-align: center">Pied ajouté</p>' } } },
    });
    expect(result.warnings).toEqual([]);
    expect(result.parts.has('word/footer1.xml')).toBe(true);
    expect(finalSectPr(textOf(result.parts, 'word/document.xml'))).toMatch(
      /<w:footerReference w:type="default" r:id="rId\d+"\/>/,
    );
    const again = await importStyled(result.buffer);
    expect(again.layout.footers?.default?.html).toContain('Pied ajouté');
  });
});

const CLIENT = fixturePath('client/Modele_Demo_DER.docx');

describe.skipIf(!existsSync(CLIENT))('document client Modele_Demo_DER', () => {
  it('aller-retour dans le gabarit : parties annexes intactes, pied conservé, corps relu identique', async () => {
    const template = await fixture('client/Modele_Demo_DER.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template, {
      variables: { mode: 'resolve', values: {} },
    });
    const original = await partsOf(template);
    const diff = differingParts(original, result.parts);
    // Un lien `HYPERLINK` en champ complexe du corps devient une relation : ajout toléré.
    expect(diff).toEqual(['word/_rels/document.xml.rels', 'word/document.xml']);
    const originalRels = textOf(original, 'word/_rels/document.xml.rels');
    const rels = textOf(result.parts, 'word/_rels/document.xml.rels');
    for (const relationship of originalRels.match(/<Relationship [^>]*\/>/g) ?? []) {
      expect(rels).toContain(relationship);
    }
    // Styles localisés du gabarit réutilisés : rien n'est ajouté à styles.xml.
    const document = textOf(result.parts, 'word/document.xml');
    expect(document).toContain('<w:rStyle w:val="Lienhypertexte"/>');
    expect(document).not.toContain('"Hyperlink"');
    // Les trois sections du client ressortent avec leur `w:sectPr` identique à l'octet : le
    // pied n'est référencé que par la première, Word le fait hériter aux suivantes.
    const sectPrs = allSectPrsOf(document);
    expect(sectPrs).toEqual(allSectPrsOf(textOf(original, 'word/document.xml')));
    expect(sectPrs).toHaveLength(3);
    expect(sectPrs[0]).toContain('<w:footerReference w:type="default" r:id="rId13"/>');
    const codes = new Set(result.warnings.map((warning) => warning.code));
    expect(codes).toEqual(new Set(['variable-unresolved']));
    const again = await importStyled(result.buffer);
    // Limites connues : une bordure `nil` sur un bord extérieur de cellule n'est pas
    // représentable (les bords extérieurs sont portés par `<table>`), elle réapparaît ;
    // un lien `HYPERLINK` en champ complexe (sans style de caractère) reçoit le style
    // « Hyperlink » du gabarit à l'export.
    const withoutCellStyles = (html: string): string =>
      normalizeHtml(html)
        .replace(/<(td|th)([^>]*?) style="[^"]*"/g, '<$1$2')
        .replace(/<a href="([^"]*)">[\s\S]*?<\/a>/g, '<a href="$1"></a>');
    expect(withoutCellStyles(again.html)).toBe(withoutCellStyles(imported.html));
    expect(again.variables.map((variable) => variable.name)).toEqual(
      imported.variables.map((variable) => variable.name),
    );
    expect(again.layout.footers).toEqual(imported.layout.footers);
    expect((document.match(/<w:tbl>/g) ?? []).length).toBe(8);
  });

  it('mode fields : les champs de fusion sont réécrits dans le corps, le pied reste intact', async () => {
    const template = await fixture('client/Modele_Demo_DER.docx');
    const imported = await importStyled(template);
    const result = await exportInTemplate(imported.html, template, {
      variables: { mode: 'fields', values: { SalespersonFullName: 'Jean Dupont' } },
    });
    const original = await partsOf(template);
    expect(differingParts(original, result.parts)).not.toContain('word/footer1.xml');
    const document = textOf(result.parts, 'word/document.xml');
    expect(document).toContain('MERGEFIELD SalespersonFullName');
    expect(document).toContain('>Jean Dupont<');
    const again = await importStyled(result.buffer);
    expect(again.variables.find((variable) => variable.name === 'SalespersonFullName')?.value).toBe(
      'Jean Dupont',
    );
  });
});
