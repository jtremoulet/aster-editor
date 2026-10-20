/**
 * Génère les fixtures .docx de mise en page (session 3) dans `fixtures/docx/` :
 *
 * - `11-styles-inline.docx` : propriétés de run directes (police, taille, couleur, surlignage,
 *   soulignés, barrés, exposant, casse, espacement), style de caractère nommé, police du thème.
 * - `12-paragraphes.docx` : alignements, interlignes, espacements, retraits, bordures, fond,
 *   `keepNext`, `pageBreakBefore`, tabulation, saut de ligne, saut de page.
 * - `13-styles-nommes.docx` : docDefaults, `Normal` modifié, titres, styles perso chaînés par
 *   `basedOn`, propriété directe qui surcharge le style.
 * - `14-tableaux-riches.docx` : largeurs, bordures par côté, fonds, fusions, alignement vertical,
 *   marges de cellule, tableau imbriqué, tableau centré à largeur fixe, style `TableGrid`
 *   (injecté dans `styles.xml` par patch XML, la lib ne produit pas de style de tableau).
 * - `15-listes-numerotation.docx` : formats décimal, lettres, romain, puces personnalisées sur
 *   3 niveaux, redémarrage, imbrication, item multi-paragraphes, liste dans une cellule.
 * - `16-sections.docx` : A4 portrait puis Letter paysage 2 colonnes, marges, en-têtes
 *   `default` / `first` / `even`, pied `PAGE` / `NUMPAGES`, `w:lang` et police par défaut.
 * - `17-objets-perdus.docx` : objets que l'éditeur ne représente pas. Équation, commentaire,
 *   révisions et champ `DATE` viennent de la lib ; zone de texte, forme et objet incorporé sont
 *   injectés par patch XML (`document.xml`, relations, content types).
 *
 * Reproductible : `node scripts/generate-fixtures-layout.ts` (Node 24, type stripping).
 * Unités de la lib `docx` : tailles en demi-points, espacements et retraits en twips
 * (1 pt = 20 twips, 1 cm = 567 twips), bordures en huitièmes de point.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  CommentRangeEnd,
  CommentRangeStart,
  CommentReference,
  DeletedTextRun,
  Document,
  Footer,
  Header,
  HeadingLevel,
  HighlightColor,
  InsertedTextRun,
  LevelFormat,
  LineRuleType,
  Math as DocxMath,
  MathRun,
  MathSuperScript,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  SectionType,
  ShadingType,
  SimpleField,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  UnderlineType,
  VerticalAlignTable,
  WidthType,
} from 'docx';
import type { IRunOptions, ITableCellOptions, Paragraph as ParagraphType } from 'docx';
import JSZip from 'jszip';

const OUT_DIR = fileURLToPath(new URL('../fixtures/docx/', import.meta.url));

/** 1 pt en twips. */
const PT = 20;
/** 1 cm en twips. */
const CM = 567;
/** 1 mm en twips (arrondi Word). */
const MM = 56.7;
/** Date fixe pour les commentaires et révisions : la fixture doit être identique à chaque run. */
const FIXED_DATE = '2026-10-20T08:00:00Z';

function title(n: number, text: string): Paragraph {
  return new Paragraph({ text: `Fixture ${n} — ${text}`, heading: HeadingLevel.HEADING_1 });
}

function run(text: string, options: IRunOptions = {}): Paragraph {
  return new Paragraph({ children: [new TextRun({ text, ...options })] });
}

function cell(text: string, options: Omit<ITableCellOptions, 'children'> = {}): TableCell {
  return new TableCell({ children: [new Paragraph(text)], ...options });
}

// ---------------------------------------------------------------------------------------------
// 11 — styles inline
// ---------------------------------------------------------------------------------------------

/** Une propriété de run par paragraphe, le libellé annonce la propriété appliquée. */
const RUN_CASES: ReadonlyArray<readonly [string, IRunOptions]> = [
  ['Police Georgia 14 pt', { font: 'Georgia', size: 28 }],
  ['Rouge #C00000', { color: 'C00000' }],
  ['Surligné jaune', { highlight: HighlightColor.YELLOW }],
  ['Souligné simple', { underline: { type: UnderlineType.SINGLE } }],
  ['Souligné double', { underline: { type: UnderlineType.DOUBLE } }],
  ['Souligné pointillé', { underline: { type: UnderlineType.DOTTED } }],
  ['Souligné tirets', { underline: { type: UnderlineType.DASH } }],
  ['Souligné ondulé', { underline: { type: UnderlineType.WAVE } }],
  ['Barré', { strike: true }],
  ['Barré double', { doubleStrike: true }],
  ['Exposant', { superScript: true }],
  ['Indice', { subScript: true }],
  ['Petites capitales', { smallCaps: true }],
  ['Majuscules', { allCaps: true }],
  ['Espacement 2 pt', { characterSpacing: 2 * PT }],
  ['Gras', { bold: true }],
  ['Italique', { italics: true }],
];

/** Fixture 11 : propriétés de run directes, style de caractère, police du thème. */
function stylesInline(): Document {
  return new Document({
    styles: {
      // Pas de police nommée dans les défauts : le run « police du thème » résout `minorHAnsi`.
      default: { document: { run: { font: { theme: 'body' }, size: 22 } } },
      characterStyles: [
        {
          id: 'Code',
          name: 'Code',
          run: {
            font: 'Consolas',
            size: 20,
            color: '1F4E79',
            shading: { type: ShadingType.CLEAR, fill: 'F2F2F2', color: 'auto' },
          },
        },
      ],
    },
    sections: [
      {
        children: [
          title(11, 'Styles inline'),
          ...RUN_CASES.map(([label, options]) => run(label, options)),
          run(
            'Tout cumulé : Georgia 14 pt rouge surligné souligné double barré exposant petites capitales espacé gras italique',
            {
              font: 'Georgia',
              size: 28,
              color: 'C00000',
              highlight: HighlightColor.YELLOW,
              underline: { type: UnderlineType.DOUBLE },
              strike: true,
              superScript: true,
              smallCaps: true,
              characterSpacing: 2 * PT,
              bold: true,
              italics: true,
            },
          ),
          new Paragraph({
            children: [
              new TextRun('Style de caractère nommé : '),
              new TextRun({ text: 'Code', style: 'Code' }),
              new TextRun(' (identifiant Code, Consolas 10 pt).'),
            ],
          }),
          run('Police du thème (sans police explicite)'),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// 12 — paragraphes
// ---------------------------------------------------------------------------------------------

/** Fixture 12 : une propriété de paragraphe par paragraphe. */
function paragraphs(): Document {
  const black = { style: BorderStyle.SINGLE, size: 8, color: '000000', space: 1 };
  return new Document({
    sections: [
      {
        children: [
          title(12, 'Paragraphes'),
          new Paragraph({ text: 'Aligné à gauche', alignment: AlignmentType.LEFT }),
          new Paragraph({ text: 'Centré', alignment: AlignmentType.CENTER }),
          new Paragraph({ text: 'Aligné à droite', alignment: AlignmentType.RIGHT }),
          new Paragraph({
            text: 'Justifié : ce paragraphe est assez long pour occuper plusieurs lignes et montrer que les espaces sont étirés afin d’aligner le texte sur les deux marges du document.',
            alignment: AlignmentType.JUSTIFIED,
          }),
          new Paragraph({
            text: 'Interligne multiple 1,5 : ce paragraphe est assez long pour occuper plusieurs lignes et rendre l’interligne visible.',
            spacing: { line: 360, lineRule: LineRuleType.AUTO },
          }),
          new Paragraph({
            text: 'Interligne exact 18 pt : ce paragraphe est assez long pour occuper plusieurs lignes et rendre l’interligne visible.',
            spacing: { line: 18 * PT, lineRule: LineRuleType.EXACT },
          }),
          new Paragraph({
            text: 'Espacement avant 12 pt / après 6 pt',
            spacing: { before: 12 * PT, after: 6 * PT },
          }),
          new Paragraph({ text: 'Retrait gauche 1 cm', indent: { left: CM } }),
          new Paragraph({
            text: 'Retrait droite 1 cm : ce paragraphe est assez long pour occuper plusieurs lignes et montrer la marge droite réduite.',
            indent: { right: CM },
          }),
          new Paragraph({
            text: 'Première ligne 0,5 cm : ce paragraphe est assez long pour occuper plusieurs lignes et montrer le retrait de première ligne.',
            indent: { firstLine: CM / 2 },
          }),
          new Paragraph({
            text: 'Suspendu 0,5 cm : ce paragraphe est assez long pour occuper plusieurs lignes et montrer le retrait suspendu des lignes suivantes.',
            indent: { left: CM / 2, hanging: CM / 2 },
          }),
          new Paragraph({ text: 'Bordure bas 1 pt noire', border: { bottom: black } }),
          new Paragraph({
            text: 'Bordures 4 côtés',
            border: { top: black, bottom: black, left: black, right: black },
          }),
          new Paragraph({
            text: 'Fond #EEEEEE',
            shading: { type: ShadingType.CLEAR, fill: 'EEEEEE', color: 'auto' },
          }),
          new Paragraph({ text: 'Garder avec le suivant (keepNext)', keepNext: true }),
          new Paragraph({ text: 'Paragraphe suivant, gardé avec le précédent' }),
          new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 4 * CM }],
            children: [
              new TextRun('Tabulation dans un paragraphe'),
              new TextRun({ children: [new Tab(), 'texte après la tabulation'] }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun('Saut de ligne (w:br) : première ligne'),
              new TextRun({ text: 'seconde ligne après le saut', break: 1 }),
            ],
          }),
          new Paragraph({ text: 'Saut de page avant (pageBreakBefore)', pageBreakBefore: true }),
          new Paragraph({
            children: [new TextRun('Saut de page explicite (w:br type page)'), new PageBreak()],
          }),
          new Paragraph('Après le saut de page explicite'),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// 13 — styles nommés
// ---------------------------------------------------------------------------------------------

/**
 * Fixture 13 : chaîne de résolution docDefaults → Normal → Citation → Important, titres
 * modifiés. `Heading1` / `Heading2` passent par `default.heading1/2` : la lib les émet déjà
 * dans `styles.xml`, les redéclarer dans `paragraphStyles` produirait un doublon de `styleId`.
 */
function namedStyles(): Document {
  return new Document({
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22 } },
        heading1: {
          run: { size: 32, bold: true, color: '2F5496' },
          paragraph: { keepNext: true, spacing: { before: 12 * PT, after: 4 * PT } },
        },
        heading2: {
          run: { size: 26, bold: true, color: '2F5496' },
          paragraph: { keepNext: true, spacing: { before: 8 * PT, after: 2 * PT } },
        },
      },
      paragraphStyles: [
        {
          id: 'Normal',
          name: 'Normal',
          quickFormat: true,
          paragraph: { spacing: { line: 276, lineRule: LineRuleType.AUTO, after: 8 * PT } },
        },
        {
          id: 'Citation',
          name: 'Citation',
          basedOn: 'Normal',
          next: 'Normal',
          quickFormat: true,
          run: { italics: true },
          paragraph: {
            indent: { left: CM },
            border: { left: { style: BorderStyle.SINGLE, size: 12, color: '808080', space: 4 } },
          },
        },
        {
          id: 'Important',
          name: 'Important',
          basedOn: 'Citation',
          next: 'Normal',
          quickFormat: true,
          run: { bold: true, color: 'C00000' },
        },
      ],
    },
    sections: [
      {
        children: [
          title(13, 'Styles nommés'),
          new Paragraph('Paragraphe Normal (Calibri 11, interligne 1,15, après 8 pt)'),
          new Paragraph({ text: 'Titre 1 (Heading1)', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({ text: 'Titre 2 (Heading2)', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            text: 'Paragraphe Citation (basé sur Normal : retrait, italique, bordure gauche)',
            style: 'Citation',
          }),
          new Paragraph({
            text: 'Paragraphe Important (basé sur Citation : gras, rouge)',
            style: 'Important',
          }),
          new Paragraph({
            style: 'Citation',
            children: [
              new TextRun({
                text: 'Citation avec couleur directe verte (surcharge du style)',
                color: '00B050',
              }),
            ],
          }),
          new Paragraph('Retour au paragraphe Normal'),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// 14 — tableaux riches
// ---------------------------------------------------------------------------------------------

/** Fixture 14 : tableau principal avec tout dedans, puis tableau centré à largeur fixe. */
function richTables(): Document {
  const thin = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
  const header = (text: string): TableCell =>
    new TableCell({
      shading: { type: ShadingType.CLEAR, fill: 'D9E2F3', color: 'auto' },
      children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
    });
  const nested = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('Imbriqué A1'), cell('Imbriqué B1')] }),
      new TableRow({ children: [cell('Imbriqué A2'), cell('Imbriqué B2')] }),
    ],
  });
  const main = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    // Largeurs fixes : 120 pt, 240 pt, 120 pt.
    columnWidths: [120 * PT, 240 * PT, 120 * PT],
    margins: { top: 4 * PT, bottom: 4 * PT, left: 4 * PT, right: 4 * PT },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 24, color: '000000' },
      bottom: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      left: { style: BorderStyle.SINGLE, size: 8, color: '000000' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: thin,
      insideVertical: thin,
    },
    rows: [
      new TableRow({
        tableHeader: true,
        children: [header('En-tête A'), header('En-tête B'), header('En-tête C')],
      }),
      new TableRow({
        children: [
          cell('Fusion horizontale (columnSpan 2)', { columnSpan: 2 }),
          cell('Cellule C2'),
        ],
      }),
      new TableRow({
        children: [
          cell('Fusion verticale (rowSpan 2)', { rowSpan: 2 }),
          new TableCell({
            children: [
              new Paragraph('Cellule haute, ligne 1'),
              new Paragraph('Cellule haute, ligne 2'),
              new Paragraph('Cellule haute, ligne 3'),
            ],
          }),
          cell('Alignement vertical centré', { verticalAlign: VerticalAlignTable.CENTER }),
        ],
      }),
      new TableRow({
        children: [
          cell('Marges de cellule 4 pt', {
            margins: { top: 4 * PT, bottom: 4 * PT, left: 4 * PT, right: 4 * PT },
          }),
          cell('Cellule C4'),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({ children: [new Paragraph('Tableau imbriqué :'), nested] }),
          cell('Cellule B5'),
          cell('Cellule C5'),
        ],
      }),
    ],
  });
  const centered = new Table({
    width: { size: 300 * PT, type: WidthType.DXA },
    columnWidths: [150 * PT, 150 * PT],
    alignment: AlignmentType.CENTER,
    style: 'TableGrid',
    rows: [
      new TableRow({ children: [cell('Tableau 300 pt centré'), cell('Style TableGrid')] }),
      new TableRow({ children: [cell('Ligne 2, A'), cell('Ligne 2, B')] }),
    ],
  });
  return new Document({
    sections: [
      {
        children: [
          title(14, 'Tableaux riches'),
          new Paragraph('Tableau 100 % avec en-tête, bordures par côté, fusions et imbrication :'),
          main,
          new Paragraph('Tableau à largeur fixe 300 pt, centré, style TableGrid :'),
          centered,
          new Paragraph('Fin des tableaux'),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// 15 — listes et numérotation
// ---------------------------------------------------------------------------------------------

const LIST_INDENT = (level: number): { left: number; hanging: number } => ({
  left: 720 * (level + 1),
  hanging: 360,
});

/** Fixture 15 : formats de numérotation, puces, niveaux, redémarrage, item multi-paragraphes. */
function lists(): Document {
  const numbered = (text: string, reference: string, level = 0, instance?: number): Paragraph =>
    new Paragraph({ text, numbering: { reference, level, instance } });
  return new Document({
    numbering: {
      config: [
        {
          reference: 'decimale',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              start: 1,
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: LIST_INDENT(0) } },
            },
          ],
        },
        {
          reference: 'lettres',
          levels: [
            {
              level: 0,
              format: LevelFormat.LOWER_LETTER,
              text: '%1)',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: LIST_INDENT(0) } },
            },
          ],
        },
        {
          reference: 'romain',
          levels: [
            {
              level: 0,
              format: LevelFormat.UPPER_ROMAN,
              text: '%1.',
              alignment: AlignmentType.LEFT,
              style: { paragraph: { indent: LIST_INDENT(0) } },
            },
          ],
        },
        {
          reference: 'puces',
          levels: ['•', '–', '▪'].map((text, level) => ({
            level,
            format: LevelFormat.BULLET,
            text,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: LIST_INDENT(level) } },
          })),
        },
        {
          reference: 'imbriquee',
          levels: ['%1.', '%1.%2.', '%1.%2.%3.'].map((text, level) => ({
            level,
            format: LevelFormat.DECIMAL,
            text,
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: LIST_INDENT(level) } },
          })),
        },
      ],
    },
    sections: [
      {
        children: [
          title(15, 'Listes et numérotation'),
          new Paragraph('Liste décimale :'),
          numbered('Liste décimale : premier', 'decimale'),
          numbered('Liste décimale : deuxième', 'decimale'),
          new Paragraph('Liste lettres minuscules :'),
          numbered('Liste lettres : premier', 'lettres'),
          numbered('Liste lettres : deuxième', 'lettres'),
          new Paragraph('Liste romaine majuscule :'),
          numbered('Liste romaine : premier', 'romain'),
          numbered('Liste romaine : deuxième', 'romain'),
          new Paragraph('Puces personnalisées sur 3 niveaux :'),
          numbered('Puce niveau 1', 'puces', 0),
          numbered('Puce niveau 2', 'puces', 1),
          numbered('Puce niveau 3', 'puces', 2),
          numbered('Puce niveau 1 bis', 'puces', 0),
          new Paragraph('Paragraphe normal entre deux listes'),
          // Nouvelle instance de `decimale` : la lib crée un `w:num` avec `w:startOverride`.
          numbered('Liste redémarrée : premier (à nouveau 1)', 'decimale', 0, 1),
          numbered('Liste redémarrée : deuxième', 'decimale', 0, 1),
          new Paragraph('Liste à 3 niveaux imbriqués :'),
          numbered('Niveau 1 imbriqué', 'imbriquee', 0),
          numbered('Niveau 2 imbriqué', 'imbriquee', 1),
          numbered('Niveau 3 imbriqué', 'imbriquee', 2),
          numbered('Niveau 2 imbriqué bis', 'imbriquee', 1),
          numbered('Niveau 1 imbriqué bis', 'imbriquee', 0),
          new Paragraph('Item contenant deux paragraphes :'),
          numbered('Item avec deux paragraphes : premier paragraphe', 'lettres', 0, 1),
          new Paragraph({
            text: 'Second paragraphe du même item (sans numéro, même retrait)',
            style: 'ListParagraph',
            indent: { left: 720 },
          }),
          numbered('Item suivant après le paragraphe double', 'lettres', 0, 1),
          new Paragraph('Liste dans une cellule de tableau :'),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      numbered('Liste dans une cellule : premier', 'puces', 0),
                      numbered('Liste dans une cellule : deuxième', 'puces', 0),
                    ],
                  }),
                  cell('Cellule voisine sans liste'),
                ],
              }),
            ],
          }),
          new Paragraph('Fin des listes'),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// 16 — sections
// ---------------------------------------------------------------------------------------------

/** Fixture 16 : deux sections aux formats différents, en-têtes et pieds variés. */
function sections(): Document {
  const margin20mm = { top: 20 * MM, bottom: 20 * MM, left: 20 * MM, right: 20 * MM };
  const margin127mm = { top: 720, bottom: 720, left: 720, right: 720 };
  const filler = (prefix: string): ParagraphType[] =>
    Array.from(
      { length: 6 },
      (_, i) =>
        new Paragraph(
          `${prefix}, paragraphe ${i + 1} : texte de remplissage suffisamment long pour que la mise en page soit visible sur plusieurs lignes.`,
        ),
    );
  return new Document({
    evenAndOddHeaderAndFooters: true,
    styles: {
      default: { document: { run: { font: 'Arial', size: 20, language: { value: 'fr-FR' } } } },
    },
    sections: [
      {
        properties: {
          page: { size: { width: 11906, height: 16838 }, margin: margin20mm },
          titlePage: true,
        },
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Rapport — {{client}}', bold: true })],
              }),
            ],
          }),
          first: new Header({
            children: [new Paragraph('Première page — en-tête first différent')],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun('Page '),
                  new TextRun({ children: [PageNumber.CURRENT] }),
                  new TextRun(' / '),
                  new TextRun({ children: [PageNumber.TOTAL_PAGES] }),
                ],
              }),
            ],
          }),
          first: new Footer({ children: [new Paragraph('Pied de première page')] }),
        },
        children: [
          title(16, 'Sections'),
          new Paragraph('Section 1 : A4 portrait, marges 20 mm, première page différente'),
          ...filler('Section 1'),
        ],
      },
      {
        properties: {
          type: SectionType.NEXT_PAGE,
          page: {
            size: { width: 12240, height: 15840, orientation: PageOrientation.LANDSCAPE },
            margin: margin127mm,
          },
          column: { count: 2, space: 720, equalWidth: true },
        },
        headers: {
          default: new Header({ children: [new Paragraph('Section 2 — en-tête par défaut')] }),
          even: new Header({ children: [new Paragraph('Section 2 — en-tête page paire')] }),
        },
        footers: {
          default: new Footer({ children: [new Paragraph('Section 2 — pied par défaut')] }),
        },
        children: [
          new Paragraph('Section 2 : Letter paysage, marges 12,7 mm, 2 colonnes'),
          ...filler('Section 2'),
        ],
      },
    ],
  });
}

// ---------------------------------------------------------------------------------------------
// 17 — objets perdus
// ---------------------------------------------------------------------------------------------

/**
 * Fixture 17 : chaque objet est entouré de paragraphes normaux. Les marqueurs `[[TEXTBOX]]`,
 * `[[SHAPE]]` et `[[OBJECT]]` sont remplacés par du XML Word dans `patchLostObjects`.
 */
function lostObjects(): Document {
  const author = { author: 'Aster', date: FIXED_DATE };
  return new Document({
    comments: {
      children: [
        {
          id: 0,
          author: 'Aster',
          initials: 'AE',
          date: new Date(FIXED_DATE),
          children: [new Paragraph('Ceci est un commentaire.')],
        },
      ],
    },
    sections: [
      {
        children: [
          title(17, 'Objets perdus'),
          new Paragraph('Avant la zone de texte'),
          new Paragraph('Zone de texte (w:drawing + wps:txbx) : [[TEXTBOX]]'),
          new Paragraph('Après la zone de texte'),
          new Paragraph('Avant la forme'),
          new Paragraph('Forme (wps:wsp sans texte) : [[SHAPE]]'),
          new Paragraph('Après la forme'),
          new Paragraph('Avant l’équation'),
          new Paragraph({
            children: [
              new TextRun('Équation (m:oMath) : '),
              new DocxMath({
                children: [
                  new MathSuperScript({
                    children: [new MathRun('x')],
                    superScript: [new MathRun('2')],
                  }),
                  new MathRun('+1=0'),
                ],
              }),
            ],
          }),
          new Paragraph('Après l’équation'),
          new Paragraph('Avant le commentaire'),
          new Paragraph({
            children: [
              new TextRun('Commentaire (w:commentRangeStart) : '),
              new CommentRangeStart(0),
              new TextRun('texte commenté'),
              new CommentRangeEnd(0),
              new CommentReference(0),
            ],
          }),
          new Paragraph('Après le commentaire'),
          new Paragraph('Avant les révisions'),
          new Paragraph({
            children: [
              new TextRun('Révision insérée (w:ins) : '),
              new InsertedTextRun({ id: 1, ...author, text: 'texte inséré' }),
              new TextRun(' ; révision supprimée (w:del) : '),
              new DeletedTextRun({ id: 2, ...author, text: 'texte supprimé' }),
            ],
          }),
          new Paragraph('Après les révisions'),
          new Paragraph('Avant le champ DATE'),
          new Paragraph({
            children: [
              new TextRun('Champ DATE (w:fldSimple) : '),
              new SimpleField('DATE \\@ "dd/MM/yyyy"', '20/10/2026'),
            ],
          }),
          new Paragraph('Après le champ DATE'),
          new Paragraph('Avant l’objet incorporé'),
          new Paragraph('Objet incorporé (w:object) : [[OBJECT]]'),
          new Paragraph('Après l’objet incorporé'),
        ],
      },
    ],
  });
}

const A_NS = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const WPS_URI = 'http://schemas.microsoft.com/office/word/2010/wordprocessingShape';

/** Forme DrawingML inline (`wps:wsp`), avec ou sans zone de texte. */
function drawing(id: number, name: string, geometry: string, textbox: string): string {
  return (
    `</w:t></w:r><w:r><w:drawing>` +
    `<wp:inline distT="0" distB="0" distL="0" distR="0">` +
    `<wp:extent cx="2286000" cy="914400"/><wp:docPr id="${String(id)}" name="${name}"/>` +
    `<a:graphic xmlns:a="${A_NS}"><a:graphicData uri="${WPS_URI}">` +
    `<wps:wsp><wps:cNvSpPr${textbox ? ' txBox="1"' : ''}/>` +
    `<wps:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="2286000" cy="914400"/></a:xfrm>` +
    `<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>` +
    `<a:solidFill><a:srgbClr val="DEEAF6"/></a:solidFill>` +
    `<a:ln><a:solidFill><a:srgbClr val="2F5496"/></a:solidFill></a:ln></wps:spPr>` +
    textbox +
    `<wps:bodyPr wrap="square" rtlCol="0"><a:noAutofit/></wps:bodyPr></wps:wsp>` +
    `</a:graphicData></a:graphic></wp:inline></w:drawing></w:r><w:r><w:t xml:space="preserve">`
  );
}

const TEXTBOX =
  `<wps:txbx><w:txbxContent><w:p><w:r><w:t>Texte dans la zone de texte</w:t></w:r></w:p>` +
  `</w:txbxContent></wps:txbx>`;

/** Objet OLE incorporé : `w:object` avec `v:shape` et `o:OLEObject` liés à `embeddings/`. */
const OBJECT =
  `</w:t></w:r><w:r><w:object w:dxaOrig="1440" w:dyaOrig="1440">` +
  `<v:shape id="_x0000_i1025" type="#_x0000_t75" style="width:72pt;height:72pt" o:ole=""/>` +
  `<o:OLEObject Type="Embed" ProgID="Package" ShapeID="_x0000_i1025" DrawAspect="Content" ObjectID="_1" r:id="rIdOle1"/>` +
  `</w:object></w:r><w:r><w:t xml:space="preserve">`;

/** Insère `fragment` juste avant la balise fermante `closing` d'une partie XML. */
function insertBefore(xml: string, closing: string, fragment: string): string {
  const index = xml.lastIndexOf(closing);
  if (index < 0) throw new Error(`Balise ${closing} introuvable`);
  return xml.slice(0, index) + fragment + xml.slice(index);
}

/**
 * Fixture 14 : ajoute le style de tableau `TableGrid` que la lib ne produit pas, et retire les
 * bordures directes que la lib pose par défaut sur le tableau qui l'utilise, pour que ses
 * bordures viennent uniquement du style.
 */
async function patchTableGrid(zip: JSZip): Promise<void> {
  const stylesPath = 'word/styles.xml';
  const border = (name: string): string =>
    `<w:${name} w:val="single" w:sz="4" w:space="0" w:color="auto"/>`;
  const style =
    `<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/>` +
    `<w:basedOn w:val="TableNormal"/><w:uiPriority w:val="39"/>` +
    `<w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr>` +
    `<w:tblPr><w:tblBorders>${['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(border).join('')}</w:tblBorders></w:tblPr>` +
    `</w:style>`;
  zip.file(
    stylesPath,
    insertBefore(await zip.file(stylesPath)!.async('string'), '</w:styles>', style),
  );

  const docPath = 'word/document.xml';
  const xml = await zip.file(docPath)!.async('string');
  zip.file(
    docPath,
    xml.replace(
      /(<w:tblPr><w:tblStyle w:val="TableGrid"\/>[\s\S]*?)<w:tblBorders>[\s\S]*?<\/w:tblBorders>/,
      '$1',
    ),
  );
}

/** Fixture 17 : zone de texte, forme et objet incorporé, plus relation et content type OLE. */
async function patchLostObjects(zip: JSZip): Promise<void> {
  const docPath = 'word/document.xml';
  let xml = await zip.file(docPath)!.async('string');
  xml = xml.replace('[[TEXTBOX]]', drawing(101, 'Zone de texte 1', 'rect', TEXTBOX));
  xml = xml.replace('[[SHAPE]]', drawing(102, 'Ellipse 2', 'ellipse', ''));
  xml = xml.replace('[[OBJECT]]', OBJECT);
  zip.file(docPath, xml);

  const relsPath = 'word/_rels/document.xml.rels';
  const relation = `<Relationship Id="rIdOle1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject" Target="embeddings/oleObject1.bin"/>`;
  zip.file(
    relsPath,
    insertBefore(await zip.file(relsPath)!.async('string'), '</Relationships>', relation),
  );

  const typesPath = '[Content_Types].xml';
  const contentType = `<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/>`;
  zip.file(
    typesPath,
    insertBefore(await zip.file(typesPath)!.async('string'), '</Types>', contentType),
  );
  zip.file('word/embeddings/oleObject1.bin', Buffer.from('ASTER-FIXTURE-OLE', 'utf8'));
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
    ['11-styles-inline.docx', stylesInline()],
    ['12-paragraphes.docx', paragraphs()],
    ['13-styles-nommes.docx', namedStyles()],
    ['14-tableaux-riches.docx', richTables(), patchTableGrid],
    ['15-listes-numerotation.docx', lists()],
    ['16-sections.docx', sections()],
    ['17-objets-perdus.docx', lostObjects(), patchLostObjects],
  ];
  for (const [name, doc, patch] of docs) {
    let buffer = await Packer.toBuffer(doc);
    if (patch) buffer = await patchZip(buffer, patch);
    await writeFile(join(OUT_DIR, name), buffer);
    console.log(`✓ ${name} (${buffer.length} octets)`);
  }
}

await main();
