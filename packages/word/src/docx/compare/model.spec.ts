import { describe, expect, it } from 'vitest';
import { buildDocx, run } from '../preprocess/minimal-docx';
import { createNumberingResolver } from '../reader/lists';
import { defaultXmlParse, openPackage } from '../reader/package';
import { createStyleResolver } from '../reader/styles';
import { stylesXml } from '../reader/test-support';
import {
  readDocumentModel,
  type DocumentModel,
  type ParagraphModel,
  type TableModel,
} from './model';
import { placeholderFields } from './model-paragraph';

/** Modèle comparable d'un corps `document.xml` (fragments XML Word), styles facultatifs. */
async function modelOf(body: string, styles?: string): Promise<DocumentModel> {
  const buffer = await buildDocx(body, styles ? { 'word/styles.xml': styles } : {});
  const pkg = await openPackage(buffer, defaultXmlParse());
  const [styleResolver, numbering] = await Promise.all([
    createStyleResolver(pkg),
    createNumberingResolver(pkg),
  ]);
  return readDocumentModel(pkg, styleResolver, numbering);
}

function paragraphs(model: DocumentModel): ParagraphModel[] {
  return model.blocks.filter((block): block is ParagraphModel => block.kind === 'paragraph');
}

function table(model: DocumentModel, index = 0): TableModel {
  const found = model.blocks.filter((block): block is TableModel => block.kind === 'table')[index];
  if (!found) throw new Error(`tableau ${String(index + 1)} absent`);
  return found;
}

const PAGE_BREAK = '<w:r><w:br w:type="page"/></w:r>';

describe('model — saut de page explicite', () => {
  it('« a<br page>b » donne deux paragraphes, le premier marqué pageBreakAfter', async () => {
    const model = await modelOf(`<w:p>${run('a')}${PAGE_BREAK}${run('b')}</w:p>`);
    const [a, b] = paragraphs(model);
    expect(paragraphs(model)).toHaveLength(2);
    expect(a).toMatchObject({ text: 'a', pageBreakAfter: true });
    expect(b).toMatchObject({ text: 'b' });
    expect(b?.pageBreakAfter).toBeUndefined();
    expect(a?.text).not.toContain('\n');
  });

  it('un saut en fin de paragraphe ne crée pas de paragraphe vide', async () => {
    const model = await modelOf(`<w:p>${run('a')}${PAGE_BREAK}</w:p><w:p>${run('b')}</w:p>`);
    expect(paragraphs(model).map((p) => [p.text, p.pageBreakAfter ?? false])).toEqual([
      ['a', true],
      ['b', false],
    ]);
  });

  it('un paragraphe réduit au saut se replie sur le précédent : même modèle que « a<br page> »', async () => {
    const split = await modelOf(
      `<w:p>${run('a')}</w:p><w:p>${PAGE_BREAK}</w:p><w:p>${run('b')}</w:p>`,
    );
    const inline = await modelOf(`<w:p>${run('a')}${PAGE_BREAK}</w:p><w:p>${run('b')}</w:p>`);
    expect(split.blocks).toEqual(inline.blocks);
    expect(paragraphs(split).map((p) => p.text)).toEqual(['a', 'b']);
  });

  it('un saut en tête de document ou après un tableau reste un paragraphe vide marqué', async () => {
    const first = await modelOf(`<w:p>${PAGE_BREAK}</w:p><w:p>${run('b')}</w:p>`);
    expect(paragraphs(first).map((p) => [p.text, p.pageBreakAfter ?? false])).toEqual([
      ['', true],
      ['b', false],
    ]);
    const afterTable = await modelOf(
      `<w:tbl><w:tr><w:tc><w:p>${run('c')}</w:p></w:tc></w:tr></w:tbl><w:p>${PAGE_BREAK}</w:p>`,
    );
    expect(afterTable.blocks.map((block) => block.kind)).toEqual(['table', 'paragraph']);
  });

  it('un saut de ligne simple reste un caractère du texte', async () => {
    const model = await modelOf(`<w:p>${run('a')}<w:r><w:br/></w:r>${run('b')}</w:p>`);
    expect(paragraphs(model)).toHaveLength(1);
    expect(paragraphs(model)[0]?.text).toBe('a\nb');
  });
});

describe('model — champs de fusion', () => {
  const simple =
    `<w:p>${run('Bonjour ')}<w:fldSimple w:instr=" MERGEFIELD Nom "><w:r><w:t>«Nom»</w:t></w:r></w:fldSimple>${run(', facture ')}` +
    `<w:fldSimple w:instr=" MERGEFIELD &quot;Numero Facture&quot; \\* MERGEFORMAT "><w:r><w:t>«Numero Facture»</w:t></w:r></w:fldSimple></w:p>`;

  it('fldSimple : texte affiché avec le résultat, texte canonique et noms en {{nom}}', async () => {
    const [p] = paragraphs(await modelOf(simple));
    expect(p?.text).toBe('Bonjour «Nom», facture «Numero Facture»');
    // Le nom composé est normalisé comme le fait l'import (`{{numero_facture}}`)…
    expect(p?.placeholderText).toBe('Bonjour {{Nom}}, facture {{numero_facture}}');
    // … mais le champ garde son nom brut (R30-04).
    expect(p?.fields).toEqual([
      { raw: 'Nom', name: 'Nom', literal: false },
      { raw: 'Numero Facture', name: 'numero_facture', literal: false },
    ]);
  });

  it('les runs d’un champ sont repliés en {{nom}} et fusionnent avec leurs voisins de mêmes propriétés', async () => {
    const [p] = paragraphs(await modelOf(simple));
    expect(p?.runs.map((r) => r.text)).toEqual(['Bonjour {{Nom}}, facture {{numero_facture}}']);
    const bold = simple.replace(
      '<w:r><w:t>«Nom»</w:t></w:r>',
      run('«Nom»', '<w:rPr><w:b/></w:rPr>'),
    );
    const [q] = paragraphs(await modelOf(bold));
    expect(q?.runs.map((r) => [r.text, r.props.bold ?? false])).toEqual([
      ['Bonjour ', false],
      ['{{Nom}}', true],
      [', facture {{numero_facture}}', false],
    ]);
  });

  it('champ complexe : instruction ignorée, résultat multi-runs replié avec les propriétés du premier run', async () => {
    const complex =
      `<w:p>${run('Échéance : ')}` +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD DateEcheance \\* MERGEFORMAT </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>«</w:t></w:r>' +
      '<w:r><w:rPr><w:sz w:val="16"/><w:highlight w:val="yellow"/></w:rPr><w:t>DateEcheance</w:t></w:r>' +
      '<w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t>»</w:t></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
      `${run('.')}</w:p>`;
    const [p] = paragraphs(await modelOf(complex));
    expect(p?.text).toBe('Échéance : «DateEcheance».');
    expect(p?.placeholderText).toBe('Échéance : {{DateEcheance}}.');
    expect(p?.fields).toEqual([{ raw: 'DateEcheance', name: 'DateEcheance', literal: false }]);
    expect(p?.runs.map((r) => r.text)).toEqual(['Échéance : ', '{{DateEcheance}}', '.']);
    expect(p?.runs[1]?.props).toMatchObject({ fontSizePt: 8 });
    expect(p?.runs[1]?.props.highlight).toBeUndefined();
  });

  it('champ complexe sans résultat (jamais mis à jour) : nom compté, texte vide', async () => {
    const body =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD Signataire </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    const [p] = paragraphs(await modelOf(body));
    expect(p?.text).toBe('');
    expect(p?.placeholderText).toBe('{{Signataire}}');
    expect(p?.fields).toEqual([{ raw: 'Signataire', name: 'Signataire', literal: false }]);
  });

  it('un {{nom}} en clair est un champ littéral de même nom normalisé ; les autres champs ne comptent pas', async () => {
    const body = `<w:p>${run('Page ')}<w:fldSimple w:instr=" PAGE "><w:r><w:t>3</w:t></w:r></w:fldSimple>${run(' pour {{ client }}')}</w:p>`;
    const [p] = paragraphs(await modelOf(body));
    expect(p?.text).toBe('Page 3 pour {{ client }}');
    expect(p?.fields).toEqual([{ raw: 'client', name: 'client', literal: true }]);
    expect(placeholderFields('{{a}} x {{ b }} {{}} {{Nom Client}}')).toEqual([
      { raw: 'a', name: 'a', literal: true },
      { raw: 'b', name: 'b', literal: true },
      { raw: 'Nom Client', name: 'nom_client', literal: true },
    ]);
  });

  it('R30-04 : trois MERGEFIELD aux noms bruts distincts restent distincts, même nom normalisé', async () => {
    const field = (name: string, result: string): string =>
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      `<w:r><w:instrText xml:space="preserve"> MERGEFIELD ${name} </w:instrText></w:r>` +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      `<w:r><w:t>${result}</w:t></w:r>` +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const raws: string[] = [];
    for (const [name, result] of [
      ['"Nom Client"', '«Nom Client»'],
      ['nom_client', '«nom_client»'],
      ['"NOM CLIENT"', '«NOM CLIENT»'],
    ] as const) {
      const [p] = paragraphs(await modelOf(`<w:p>${run('Bonjour ')}${field(name, result)}</w:p>`));
      expect(p?.placeholderText).toBe('Bonjour {{nom_client}}');
      expect(p?.fields.map((f) => [f.name, f.literal])).toEqual([['nom_client', false]]);
      raws.push(p?.fields[0]?.raw ?? '');
    }
    expect(raws).toEqual(['Nom Client', 'nom_client', 'NOM CLIENT']);
  });

  it('le texte d’un tableau porte aussi sa forme canonique', async () => {
    const body = `<w:tbl><w:tr><w:tc>${simple}</w:tc></w:tr></w:tbl>`;
    const tbl = table(await modelOf(body));
    expect(tbl.text).toContain('«Nom»');
    expect(tbl.placeholderText).toContain('{{Nom}}');
  });
});

describe('model — bordures et largeurs effectives', () => {
  const single = (sz: number, color = '000000'): string =>
    `w:val="single" w:sz="${String(sz)}" w:color="${color}"`;
  const tblBorders =
    `<w:tblBorders><w:top ${single(24)}/><w:left ${single(8)}/><w:bottom ${single(8)}/>` +
    `<w:right w:val="none" w:sz="0" w:color="auto"/><w:insideH ${single(4)}/><w:insideV ${single(4)}/></w:tblBorders>`;
  const cell = (content: string, tcPr = ''): string =>
    `<w:tc>${tcPr ? `<w:tcPr>${tcPr}</w:tcPr>` : ''}<w:p>${run(content)}</w:p></w:tc>`;
  const grid = '<w:tblGrid><w:gridCol w:w="2400"/><w:gridCol w:w="4800"/></w:tblGrid>';

  it('tblBorders distribués par position : bords extérieurs sur le bord, inside ailleurs, none effacé', async () => {
    const body =
      `<w:tbl><w:tblPr>${tblBorders}</w:tblPr>${grid}` +
      `<w:tr>${cell('A')}${cell('B')}</w:tr><w:tr>${cell('C')}${cell('D')}</w:tr></w:tbl>`;
    const tbl = table(await modelOf(body));
    const widths = (r: number, c: number): Record<string, number | undefined> => {
      const borders = tbl.rows[r]?.[c]?.borders ?? {};
      return Object.fromEntries(
        Object.entries(borders).map(([side, border]) => [side, border.widthPt]),
      );
    };
    expect(widths(0, 0)).toEqual({ top: 3, left: 1, bottom: 0.5, right: 0.5 });
    expect(widths(0, 1)).toEqual({ top: 3, left: 0.5, bottom: 0.5 });
    expect(widths(1, 0)).toEqual({ top: 0.5, left: 1, bottom: 1, right: 0.5 });
    expect(widths(1, 1)).toEqual({ top: 0.5, left: 0.5, bottom: 1 });
    // Côté tableau : seules les bordures extérieures, sans `right` (none).
    expect(Object.keys(tbl.borders ?? {}).sort()).toEqual(['bottom', 'left', 'top']);
  });

  it('un export qui écrit les traits intérieurs sur chaque cellule donne le même modèle', async () => {
    const original = `<w:tbl><w:tblPr>${tblBorders}</w:tblPr>${grid}<w:tr>${cell('A')}${cell('B')}</w:tr></w:tbl>`;
    const distributed =
      `<w:tbl><w:tblPr><w:tblBorders><w:top ${single(24)}/><w:left ${single(8)}/><w:bottom ${single(8)}/>` +
      '<w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr>' +
      `${grid}<w:tr>${cell('A', `<w:tcBorders><w:right ${single(4)}/></w:tcBorders>`)}` +
      `${cell('B', `<w:tcBorders><w:left ${single(4)}/></w:tcBorders>`)}</w:tr></w:tbl>`;
    const a = table(await modelOf(original));
    const b = table(await modelOf(distributed));
    expect(b.rows).toEqual(a.rows);
    expect(b.borders).toEqual(a.borders);
  });

  it('tcBorders nil efface une bordure du tableau ; gridSpan détermine le bord droit', async () => {
    const body =
      `<w:tbl><w:tblPr>${tblBorders}</w:tblPr>${grid}` +
      `<w:tr>${cell('A', `<w:gridSpan w:val="2"/><w:tcBorders><w:top w:val="nil"/></w:tcBorders>`)}</w:tr></w:tbl>`;
    const tbl = table(await modelOf(body));
    const borders = tbl.rows[0]?.[0]?.borders ?? {};
    expect(Object.keys(borders).sort()).toEqual(['bottom', 'left']);
    expect(tbl.rows[0]?.[0]?.widthPt).toBe(360);
  });

  it('style de tableau : bordures extérieures et intérieures du style, recouvertes par la cellule', async () => {
    const styles = stylesXml(
      '<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>' +
        `<w:top ${single(12)}/><w:left ${single(12)}/><w:bottom ${single(12)}/><w:right ${single(12)}/>` +
        `<w:insideH ${single(4)}/><w:insideV ${single(4)}/></w:tblBorders></w:tblPr></w:style>`,
    );
    const body =
      '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr>' +
      `<w:tr>${cell('A')}${cell('B', `<w:tcBorders><w:bottom ${single(16, 'FF0000')}/></w:tcBorders>`)}</w:tr>` +
      `<w:tr>${cell('C')}${cell('D')}</w:tr></w:tbl>`;
    const tbl = table(await modelOf(body, styles));
    expect(tbl.borders?.top).toMatchObject({ widthPt: 1.5, side: 'top' });
    expect(tbl.rows[0]?.[0]?.borders).toMatchObject({
      top: { widthPt: 1.5 },
      left: { widthPt: 1.5 },
      bottom: { widthPt: 0.5 },
      right: { widthPt: 0.5 },
    });
    expect(tbl.rows[0]?.[1]?.borders?.bottom).toMatchObject({ widthPt: 2, color: '#ff0000' });
    expect(tbl.rows[0]?.[1]?.borders?.right).toMatchObject({ widthPt: 1.5 });
  });

  it('sans aucune bordure, ni le tableau ni les cellules ne posent la propriété', async () => {
    const tbl = table(await modelOf(`<w:tbl>${grid}<w:tr>${cell('A')}</w:tr></w:tbl>`));
    expect(tbl.borders).toBeUndefined();
    expect(tbl.rows[0]?.[0]?.borders).toBeUndefined();
  });

  it('largeur de cellule : tcW, sinon la somme des colonnes de grille couvertes', async () => {
    const body =
      `<w:tbl>${grid}<w:tr>${cell('A', '<w:tcW w:w="2000" w:type="dxa"/>')}${cell('B')}</w:tr>` +
      `<w:tr>${cell('C', '<w:gridSpan w:val="2"/><w:tcW w:w="0" w:type="auto"/>')}</w:tr>` +
      `<w:tr>${cell('D', '<w:tcW w:w="2500" w:type="pct"/>')}${cell('E')}</w:tr></w:tbl>`;
    const tbl = table(await modelOf(body));
    expect(tbl.rows[0]?.map((c) => c.widthPt)).toEqual([100, 240]);
    expect(tbl.rows[1]?.map((c) => c.widthPt)).toEqual([360]);
    expect(tbl.rows[2]?.map((c) => c.widthPt)).toEqual([undefined, 240]);
    expect(tbl.columnWidthsPt).toEqual([120, 240]);
  });
});

describe('model — tableaux sous contrôle de contenu et tableaux énormes', () => {
  const cell = (content: string, rPr = ''): string =>
    `<w:tc><w:p><w:r>${rPr}<w:t>${content}</w:t></w:r></w:p></w:tc>`;
  const grid = '<w:tblGrid><w:gridCol w:w="100"/></w:tblGrid>';

  it('R30-08 : une ligne sous w:sdt et une cellule sous w:sdt sont lues comme les autres', async () => {
    const sdtRow =
      `<w:tbl>${grid}<w:tr>${cell('un')}</w:tr>` +
      `<w:sdt><w:sdtPr><w:tag w:val="repeat"/></w:sdtPr><w:sdtContent><w:tr>${cell('deux', '<w:rPr><w:b/></w:rPr>')}</w:tr></w:sdtContent></w:sdt></w:tbl>`;
    const rows = table(await modelOf(sdtRow));
    expect(rows.rows).toHaveLength(2);
    expect(rows.text).toBe('un\ndeux');
    const second = rows.rows[1]?.[0]?.blocks[0];
    expect(second?.kind === 'paragraph' && second.runs[0]?.props.bold).toBe(true);

    const sdtCell =
      `<w:tbl>${grid}<w:tr>${cell('un')}` +
      `<w:sdt><w:sdtContent>${cell('deux')}</w:sdtContent></w:sdt>` +
      `<w:customXml w:element="x">${cell('trois')}</w:customXml></w:tr></w:tbl>`;
    const cells = table(await modelOf(sdtCell));
    expect(cells.rows[0]).toHaveLength(3);
    expect(cells.text).toBe('un\tdeux\ttrois');
  });

  it('R30-07 : 130 000 lignes ne font pas déborder la pile (Math.max sans spread)', async () => {
    const rows = '<w:tr><w:tc><w:p/></w:tc></w:tr>'.repeat(130_000);
    const started = performance.now();
    const tbl = table(await modelOf(`<w:tbl>${rows}</w:tbl>`));
    expect(tbl.rows).toHaveLength(130_000);
    expect(performance.now() - started).toBeLessThan(15_000);
  }, 30_000);
});
