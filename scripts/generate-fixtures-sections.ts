/**
 * Génère les fixtures .docx de sections, tabulations et bordures (session 4) dans
 * `fixtures/docx/` :
 *
 * - `18-sections-triple.docx` : trois sections. (1) A4 portrait marges 20 mm, en-tête
 *   `default` et `first` (`w:titlePg`), pied `PAGE` ; (2) Letter paysage marges 12,7 mm,
 *   2 colonnes, saut `nextPage`, en-têtes `default` et `even`, un tableau ; (3) A4 portrait
 *   marges 25,4 mm, saut **`continuous`**, sans en-tête propre (Word hérite de la section 2)
 *   et pied propre « Pied 3 ». Chaque section a un titre et 4 paragraphes libellés.
 * - `19-tabulations-bordures.docx` : taquets `left` / `center` / `right` / `decimal` avec deux
 *   `w:tab` par paragraphe, tabulation sans taquet, bordures de paragraphe avec `w:space`
 *   1 / 4 / 8 pt, tableau centré à bordures grises `#BFBFBF` avec cellules à bordure `nil`
 *   sur un côté précis et une cellule bleue `#2F5496`, tableau aligné à droite, tableau à
 *   style conditionnel (`w:tblLook` + `w:tblStylePr` `firstRow` / `band1Horz` injectés
 *   dans `styles.xml` par patch XML, la lib ne produit pas de style de tableau).
 *
 * Reproductible : `node scripts/generate-fixtures-sections.ts` (Node 24, type stripping).
 * Unités de la lib `docx` : tailles en demi-points, espacements et retraits en twips
 * (1 pt = 20 twips, 1 cm = 567 twips), bordures en huitièmes de point, `space` des
 * bordures en points.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import type {
  IBorderOptions,
  ISectionOptions,
  ITableCellOptions,
  Paragraph as ParagraphType,
  TabStopDefinition,
} from 'docx';
import JSZip from 'jszip';

const OUT_DIR = fileURLToPath(new URL('../fixtures/docx/', import.meta.url));

/** 1 pt en twips. */
const PT = 20;
/** 1 cm en twips. */
const CM = 567;
/** 1 mm en twips (arrondi Word). */
const MM = 56.7;

/** A4 et Letter en twips (largeur, hauteur en portrait). */
const A4 = { width: 11906, height: 16838 };
const LETTER = { width: 12240, height: 15840 };

/** Gris clair et bleu Word (« Bleu, Accentuation 1, plus sombre 25 % »). */
const GREY = 'BFBFBF';
const BLUE = '2F5496';
/** Identifiant du style de tableau conditionnel injecté dans `styles.xml`. */
const CONDITIONAL_STYLE_ID = 'AsterConditional';

function title(n: number, text: string): Paragraph {
  return new Paragraph({ text: `Fixture ${n} — ${text}`, heading: HeadingLevel.HEADING_1 });
}

function cell(text: string, options: Omit<ITableCellOptions, 'children'> = {}): TableCell {
  return new TableCell({ children: [new Paragraph(text)], ...options });
}

function header(text: string): Header {
  return new Header({ children: [new Paragraph(text)] });
}

function footer(text: string): Footer {
  return new Footer({ children: [new Paragraph(text)] });
}

// ---------------------------------------------------------------------------------------------
// 18 — sections triple
// ---------------------------------------------------------------------------------------------

/** Titre « Section N » puis 4 paragraphes « Section N, paragraphe M ». */
function sectionBody(n: number): ParagraphType[] {
  return [
    new Paragraph({ text: `Section ${String(n)}`, heading: HeadingLevel.HEADING_2 }),
    ...Array.from(
      { length: 4 },
      (_, i) =>
        new Paragraph(
          `Section ${String(n)}, paragraphe ${String(i + 1)} : texte de remplissage assez long pour que la mise en page de la section soit visible sur plusieurs lignes.`,
        ),
    ),
  ];
}

/** Pied « Page N » avec un champ `PAGE`. */
function pageFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] })],
      }),
    ],
  });
}

/**
 * Fixture 18 : trois sections aux formats, sauts et en-têtes différents. La section 3 n'a
 * aucun `headerReference` : Word y réutilise les en-têtes de la section 2, le lecteur doit
 * faire pareil. `evenAndOddHeaderAndFooters` active l'en-tête `even` de la section 2.
 */
function sectionsTriple(): Document {
  const margin20mm = { top: 20 * MM, bottom: 20 * MM, left: 20 * MM, right: 20 * MM };
  const margin127mm = { top: 720, bottom: 720, left: 720, right: 720 };
  const margin254mm = { top: 1440, bottom: 1440, left: 1440, right: 1440 };
  const section1: ISectionOptions = {
    properties: { page: { size: A4, margin: margin20mm }, titlePage: true },
    headers: { default: header('Section 1'), first: header('Première page') },
    footers: { default: pageFooter() },
    children: [title(18, 'Sections triple'), ...sectionBody(1)],
  };
  const section2: ISectionOptions = {
    properties: {
      type: SectionType.NEXT_PAGE,
      page: {
        size: { ...LETTER, orientation: PageOrientation.LANDSCAPE },
        margin: margin127mm,
      },
      column: { count: 2, space: 720, equalWidth: true },
    },
    headers: { default: header('Section 2'), even: header('Section 2 paire') },
    children: [
      ...sectionBody(2),
      new Paragraph('Tableau de la section 2 :'),
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [cell('Section 2, cellule A1'), cell('Section 2, cellule B1')],
          }),
          new TableRow({
            children: [cell('Section 2, cellule A2'), cell('Section 2, cellule B2')],
          }),
        ],
      }),
    ],
  };
  const section3: ISectionOptions = {
    properties: { type: SectionType.CONTINUOUS, page: { size: A4, margin: margin254mm } },
    footers: { default: footer('Pied 3') },
    children: sectionBody(3),
  };
  return new Document({
    evenAndOddHeaderAndFooters: true,
    sections: [section1, section2, section3],
  });
}

// ---------------------------------------------------------------------------------------------
// 19 — tabulations et bordures
// ---------------------------------------------------------------------------------------------

/** Un taquet par paragraphe : type, position en cm, textes après chaque `w:tab`. */
const TAB_CASES: ReadonlyArray<readonly [TabStopDefinition['type'], number, string, string]> = [
  [TabStopType.LEFT, 2, 'gauche', 'suite gauche'],
  [TabStopType.CENTER, 8, 'centré', 'suite centrée'],
  [TabStopType.RIGHT, 14, 'droite', 'suite droite'],
  [TabStopType.DECIMAL, 10, '12,50', '3,75'],
];

/** Paragraphe « Taquet X à N cm » suivi de deux `w:tab` séparant deux textes. */
function tabParagraph(
  type: TabStopDefinition['type'],
  cm: number,
  first: string,
  second: string,
): Paragraph {
  return new Paragraph({
    tabStops: [{ type, position: cm * CM }],
    children: [
      new TextRun(`Taquet ${type} à ${String(cm)} cm`),
      new TextRun({ children: [new Tab(), first, new Tab(), second] }),
    ],
  });
}

/** Bordure simple 0,5 pt sur les 4 côtés, avec l'écart `space` demandé (en points). */
function paragraphBorders(space: number): Paragraph {
  const side: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: '000000', space };
  return new Paragraph({
    text: `Bordure w:space ${String(space)} pt`,
    border: { top: side, bottom: side, left: side, right: side },
  });
}

/** Fixture 19 : taquets, bordures de paragraphe, bordures de cellule, alignement et style de tableau. */
function tabsAndBorders(): Document {
  const grey: IBorderOptions = { style: BorderStyle.SINGLE, size: 4, color: GREY };
  const blue: IBorderOptions = { style: BorderStyle.SINGLE, size: 8, color: BLUE };
  const nil: IBorderOptions = { style: BorderStyle.NIL, size: 0, color: 'auto' };
  const greyBorders = {
    top: grey,
    bottom: grey,
    left: grey,
    right: grey,
    insideHorizontal: grey,
    insideVertical: grey,
  };
  const centered = new Table({
    width: { size: 300 * PT, type: WidthType.DXA },
    columnWidths: [150 * PT, 150 * PT],
    alignment: AlignmentType.CENTER,
    borders: greyBorders,
    rows: [
      new TableRow({
        children: [
          cell('Tableau centré, bordures grises #BFBFBF'),
          cell('Cellule bleue #2F5496', {
            borders: { top: blue, bottom: blue, left: blue, right: blue },
          }),
        ],
      }),
      new TableRow({
        children: [
          cell('nil gauche', { borders: { left: nil } }),
          cell('nil bas', { borders: { bottom: nil } }),
        ],
      }),
    ],
  });
  const right = new Table({
    width: { size: 240 * PT, type: WidthType.DXA },
    columnWidths: [120 * PT, 120 * PT],
    alignment: AlignmentType.RIGHT,
    borders: {
      top: blue,
      bottom: blue,
      left: blue,
      right: blue,
      insideHorizontal: blue,
      insideVertical: blue,
    },
    rows: [
      new TableRow({
        children: [cell('Tableau aligné à droite'), cell('Bordures bleues #2F5496')],
      }),
    ],
  });
  const conditional = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    style: CONDITIONAL_STYLE_ID,
    tableLook: {
      firstRow: true,
      lastRow: false,
      firstColumn: false,
      lastColumn: false,
      noHBand: false,
      noVBand: true,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [cell('Style conditionnel : firstRow A'), cell('firstRow B')],
      }),
      new TableRow({ children: [cell('band1Horz ligne 1, A'), cell('band1Horz ligne 1, B')] }),
      new TableRow({ children: [cell('band2Horz ligne 2, A'), cell('band2Horz ligne 2, B')] }),
      new TableRow({ children: [cell('band1Horz ligne 3, A'), cell('band1Horz ligne 3, B')] }),
      new TableRow({ children: [cell('band2Horz ligne 4, A'), cell('band2Horz ligne 4, B')] }),
    ],
  });
  return new Document({
    sections: [
      {
        children: [
          title(19, 'Tabulations et bordures'),
          new Paragraph('Taquets de tabulation :'),
          ...TAB_CASES.map(([type, cm, first, second]) => tabParagraph(type, cm, first, second)),
          new Paragraph({
            children: [
              new TextRun('Tabulation sans taquet défini'),
              new TextRun({ children: [new Tab(), 'texte après la tabulation par défaut'] }),
            ],
          }),
          new Paragraph('Bordures de paragraphe avec écart w:space :'),
          paragraphBorders(1),
          paragraphBorders(4),
          paragraphBorders(8),
          new Paragraph('Tableau centré (w:jc center), bordures grises, cellules nil et bleue :'),
          centered,
          new Paragraph('Tableau aligné à droite (w:jc right), bordures bleues :'),
          right,
          new Paragraph(
            `Tableau à style conditionnel ${CONDITIONAL_STYLE_ID} (w:tblLook firstRow, bandes horizontales) :`,
          ),
          conditional,
          new Paragraph('Fin des tabulations et bordures'),
        ],
      },
    ],
  });
}

/** Insère `fragment` juste avant la balise fermante `closing` d'une partie XML. */
function insertBefore(xml: string, closing: string, fragment: string): string {
  const index = xml.lastIndexOf(closing);
  if (index < 0) throw new Error(`Balise ${closing} introuvable`);
  return xml.slice(0, index) + fragment + xml.slice(index);
}

/**
 * Fixture 19 : ajoute le style de tableau conditionnel que la lib ne produit pas
 * (`w:tblStylePr` `firstRow` gras sur fond `#D9E2F3`, `band1Horz` fond `#F2F2F2`, bordures
 * grises dans le `w:tblPr` du style), et retire les bordures directes que la lib pose par
 * défaut sur le tableau qui l'utilise, pour que sa mise en forme vienne du style seul.
 */
async function patchConditionalStyle(zip: JSZip): Promise<void> {
  const stylesPath = 'word/styles.xml';
  const border = (name: string): string =>
    `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="${GREY}"/>`;
  const shading = (fill: string): string =>
    `<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${fill}"/></w:tcPr>`;
  const style =
    `<w:style w:type="table" w:styleId="${CONDITIONAL_STYLE_ID}"><w:name w:val="Aster Conditional"/>` +
    `<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="59"/>` +
    `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>` +
    `<w:tblStylePr w:type="firstRow"><w:rPr><w:b/><w:bCs/></w:rPr>${shading('D9E2F3')}</w:tblStylePr>` +
    `<w:tblStylePr w:type="band1Horz">${shading('F2F2F2')}</w:tblStylePr>` +
    `</w:style>`;
  zip.file(
    stylesPath,
    insertBefore(await zip.file(stylesPath)!.async('string'), '</w:styles>', style),
  );

  const docPath = 'word/document.xml';
  const xml = await zip.file(docPath)!.async('string');
  const pattern = new RegExp(
    `(<w:tblPr><w:tblStyle w:val="${CONDITIONAL_STYLE_ID}"/>[\\s\\S]*?)<w:tblBorders>[\\s\\S]*?</w:tblBorders>`,
  );
  if (!pattern.test(xml)) throw new Error(`Tableau ${CONDITIONAL_STYLE_ID} introuvable`);
  zip.file(docPath, xml.replace(pattern, '$1'));
}

type Patch = (zip: JSZip) => Promise<void>;

async function patchZip(buffer: Buffer, patch: Patch): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  await patch(zip);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const docs: Array<[string, Document, Patch?]> = [
    ['18-sections-triple.docx', sectionsTriple()],
    ['19-tabulations-bordures.docx', tabsAndBorders(), patchConditionalStyle],
  ];
  for (const [name, doc, patch] of docs) {
    let buffer = await Packer.toBuffer(doc);
    if (patch) buffer = await patchZip(buffer, patch);
    await writeFile(join(OUT_DIR, name), buffer);
    console.log(`✓ ${name} (${String(buffer.length)} octets)`);
  }
}

await main();
