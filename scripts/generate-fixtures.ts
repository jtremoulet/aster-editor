/**
 * Génère les fixtures .docx synthétiques dans `fixtures/docx/` avec la lib `docx`.
 * Reproductible : relancer `npm run fixtures` réécrit les mêmes fichiers.
 *
 * Exécuté directement par Node 24 (type stripping natif), donc pas d'enum ni de namespace ici.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  FootnoteReferenceRun,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const OUT_DIR = fileURLToPath(new URL('../fixtures/docx/', import.meta.url));

/** PNG 2x2 rouge, le plus petit PNG valide qu'on puisse embarquer sans dépendance. */
const RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAEb+B/0lmPkNAAAAAElFTkSuQmCC',
  'base64',
);

const NUMBERING = {
  config: [
    {
      reference: 'bullets',
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: ['•', '◦', '▪'][level] ?? '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    },
    {
      reference: 'numbers',
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
        {
          level: 1,
          format: LevelFormat.LOWER_LETTER,
          text: '%2)',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1440, hanging: 360 } } },
        },
        {
          level: 2,
          format: LevelFormat.LOWER_ROMAN,
          text: '%3.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 2160, hanging: 360 } } },
        },
      ],
    },
  ],
};

function bullet(text: string, level: number): Paragraph {
  return new Paragraph({ text, numbering: { reference: 'bullets', level } });
}

function number(text: string, level: number): Paragraph {
  return new Paragraph({ text, numbering: { reference: 'numbers', level } });
}

function cell(text: string, options: { bold?: boolean; columnSpan?: number } = {}): TableCell {
  return new TableCell({
    columnSpan: options.columnSpan,
    children: [new Paragraph({ children: [new TextRun({ text, bold: options.bold })] })],
  });
}

function headingsAndLists(): Document {
  return new Document({
    numbering: NUMBERING,
    sections: [
      {
        children: [
          new Paragraph({ text: 'Titre principal', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Un paragraphe avec du '),
              new TextRun({ text: 'gras', bold: true }),
              new TextRun(', de l’'),
              new TextRun({ text: 'italique', italics: true }),
              new TextRun(' et du '),
              new TextRun({ text: 'souligné', underline: {} }),
              new TextRun('.'),
            ],
          }),
          new Paragraph({ text: 'Sous-titre', heading: HeadingLevel.HEADING_2 }),
          bullet('Premier point', 0),
          bullet('Sous-point A', 1),
          bullet('Sous-sous-point', 2),
          bullet('Sous-point B', 1),
          bullet('Deuxième point', 0),
          new Paragraph({ text: 'Étapes', heading: HeadingLevel.HEADING_3 }),
          number('Étape un', 0),
          number('Détail a', 1),
          number('Détail b', 1),
          number('Étape deux', 0),
          new Paragraph({
            children: [
              new TextRun('Voir '),
              new ExternalHyperlink({
                link: 'https://example.com',
                children: [new TextRun({ text: 'le site', style: 'Hyperlink' })],
              }),
              new TextRun('.'),
            ],
          }),
        ],
      },
    ],
  });
}

function tables(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Tableaux', heading: HeadingLevel.HEADING_1 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  cell('Nom', { bold: true }),
                  cell('Rôle', { bold: true }),
                  cell('Ville', { bold: true }),
                ],
              }),
              new TableRow({ children: [cell('Alice'), cell('Dev'), cell('Montpellier')] }),
              new TableRow({ children: [cell('Bob'), cell('Design'), cell('Lyon')] }),
            ],
          }),
          new Paragraph({ text: 'Cellules fusionnées', heading: HeadingLevel.HEADING_2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: [cell('Fusion sur deux colonnes', { columnSpan: 2 }), cell('C')],
              }),
              new TableRow({ children: [cell('A'), cell('B'), cell('C')] }),
            ],
          }),
        ],
      },
    ],
  });
}

function images(): Document {
  return new Document({
    footnotes: {
      1: { children: [new Paragraph('Une note de bas de page.')] },
    },
    sections: [
      {
        children: [
          new Paragraph({ text: 'Images', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Une image inline : '),
              new ImageRun({
                type: 'png',
                data: RED_PNG,
                transformation: { width: 40, height: 40 },
                altText: { title: 'Carré rouge', description: 'Un carré rouge', name: 'rouge' },
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun('Texte avec note'),
              new FootnoteReferenceRun(1),
              new TextRun('.'),
            ],
          }),
        ],
      },
    ],
  });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const docs: Array<[string, Document]> = [
    ['01-headings-lists.docx', headingsAndLists()],
    ['02-tables.docx', tables()],
    ['03-images.docx', images()],
  ];
  for (const [name, doc] of docs) {
    const buffer = await Packer.toBuffer(doc);
    await writeFile(join(OUT_DIR, name), buffer);
    console.log(`✓ ${name} (${buffer.length} octets)`);
  }
}

await main();
