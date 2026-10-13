/**
 * Génère des .docx de test réalistes dans `fixtures/docx/`, en complément des trois
 * fixtures de base de `generate-fixtures.ts` :
 *
 * - `04-rapport-client.docx` : rapport français complet (titre, sommaire de titres, listes
 *   mixtes sur 3 niveaux, table avec en-tête et fusion, image, note de bas de page, lien,
 *   surlignage, barré, exposant, citation, saut de page, en-tête et pied de page).
 * - `05-tableaux-complexes.docx` : fusions horizontales et verticales, cellules vides,
 *   liste et image dans des cellules, table imbriquée.
 * - `06-styles-francais.docx` : styles nommés à la française (« Titre 1 », « Citation »,
 *   « Code ») comme les émet un Word en français, pour vérifier la style map.
 * - `07-long.docx` : 300 paragraphes et 15 tables pour tester la charge à l'import.
 *
 * Exécuté par Node 24 (type stripping natif) : `node scripts/generate-fixtures-extra.ts`.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  VerticalMergeType,
  WidthType,
} from 'docx';

const OUT_DIR = fileURLToPath(new URL('../fixtures/docx/', import.meta.url));

/** PNG 4x4 bleu, assez petit pour rester lisible dans un diff. */
const BLUE_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFklEQVR4nGNgYPjPwMDwn4GBAQIYGAAoMwP9eUkJrgAAAABJRU5ErkJggg==',
  'base64',
);

const NUMBERING = {
  config: [
    {
      reference: 'puces',
      levels: [0, 1, 2].map((level) => ({
        level,
        format: LevelFormat.BULLET,
        text: ['•', '◦', '▪'][level] ?? '•',
        alignment: AlignmentType.LEFT,
        style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
      })),
    },
    {
      reference: 'numeros',
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
    {
      reference: 'numeros-2',
      levels: [
        {
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
  ],
};

const bullet = (text: string, level = 0): Paragraph =>
  new Paragraph({ text, numbering: { reference: 'puces', level } });
const num = (text: string, level = 0, reference = 'numeros'): Paragraph =>
  new Paragraph({ text, numbering: { reference, level } });

function cell(
  content: string | Paragraph[],
  opts: {
    bold?: boolean;
    columnSpan?: number;
    verticalMerge?: 'restart' | 'continue';
    shade?: boolean;
  } = {},
): TableCell {
  const children =
    typeof content === 'string'
      ? [new Paragraph({ children: [new TextRun({ text: content, bold: opts.bold })] })]
      : content;
  return new TableCell({
    columnSpan: opts.columnSpan,
    verticalMerge:
      opts.verticalMerge === 'restart'
        ? VerticalMergeType.RESTART
        : opts.verticalMerge === 'continue'
          ? VerticalMergeType.CONTINUE
          : undefined,
    shading: opts.shade ? { type: ShadingType.CLEAR, fill: 'E7E6E6' } : undefined,
    children,
  });
}

function fullWidth(rows: TableRow[]): Table {
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function rapportClient(): Document {
  return new Document({
    creator: 'Nebula',
    title: 'Rapport d’audit — fixture',
    numbering: NUMBERING,
    footnotes: {
      1: { children: [new Paragraph('Mesuré sur 30 jours glissants, hors week-ends.')] },
      2: { children: [new Paragraph('Voir l’annexe technique pour le détail des endpoints.')] },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({ text: 'Nebula — Confidentiel', alignment: AlignmentType.RIGHT }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun('Page '), new TextRun({ children: [PageNumber.CURRENT] })],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ text: 'Rapport d’audit technique', heading: HeadingLevel.TITLE }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Application de gestion des adhérents — version 2.4',
                italics: true,
              }),
            ],
          }),
          new Paragraph({ text: '1. Contexte', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Ce document présente les résultats de l’audit réalisé du '),
              new TextRun({ text: '3 au 14 mars 2026', bold: true }),
              new TextRun('. Il couvre le code, l’infrastructure et les pratiques de l’équipe'),
              new FootnoteReferenceRun(1),
              new TextRun('. Les références sont disponibles sur '),
              new ExternalHyperlink({
                link: 'https://example.com/audit/2026',
                children: [new TextRun({ text: 'l’espace projet', style: 'Hyperlink' })],
              }),
              new TextRun('.'),
            ],
          }),
          new Paragraph({ text: '1.1 Périmètre', heading: HeadingLevel.HEADING_2 }),
          bullet('Front Angular 19, 42 composants'),
          bullet('Formulaires réactifs', 1),
          bullet('Validation côté client uniquement', 2),
          bullet('Internationalisation partielle', 1),
          bullet('API NestJS, 18 modules'),
          bullet('Base PostgreSQL 16'),
          new Paragraph({ text: '1.2 Méthode', heading: HeadingLevel.HEADING_2 }),
          num('Revue de code statique'),
          num('Analyse des dépendances', 1),
          num('Recherche de vulnérabilités connues', 2),
          num('Vérification des licences', 2),
          num('Lecture des modules critiques', 1),
          num('Tests de charge'),
          num('Entretiens avec l’équipe'),
          new Paragraph({ text: '2. Constats', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Le niveau général est '),
              new TextRun({ text: 'satisfaisant', highlight: 'yellow' }),
              new TextRun(', avec trois points '),
              new TextRun({ text: 'bloquants', bold: true, color: 'C00000' }),
              new TextRun(' et une dette '),
              new TextRun({ text: 'modérée', strike: true }),
              new TextRun({ text: ' importante', underline: {} }),
              new TextRun(' sur les tests. Taux de couverture : 41 %'),
              new TextRun({ text: '2', superScript: true }),
              new TextRun('.'),
            ],
          }),
          new Paragraph({ text: '2.1 Synthèse par domaine', heading: HeadingLevel.HEADING_2 }),
          fullWidth([
            new TableRow({
              tableHeader: true,
              children: [
                cell('Domaine', { bold: true, shade: true }),
                cell('Note', { bold: true, shade: true }),
                cell('Priorité', { bold: true, shade: true }),
                cell('Commentaire', { bold: true, shade: true }),
              ],
            }),
            new TableRow({
              children: [
                cell('Sécurité'),
                cell('C'),
                cell('Haute'),
                cell('Secrets en clair dans deux fichiers de configuration.'),
              ],
            }),
            new TableRow({
              children: [
                cell('Performance'),
                cell('B'),
                cell('Moyenne'),
                cell('Requêtes N+1 sur la liste des adhérents.'),
              ],
            }),
            new TableRow({
              children: [
                cell('Qualité'),
                cell('B'),
                cell('Moyenne'),
                cell('Pas de lint en CI, tests inégaux.'),
              ],
            }),
            new TableRow({
              children: [
                cell('Total', { bold: true, columnSpan: 3 }),
                cell('3 bloquants, 12 majeurs, 27 mineurs', { bold: true }),
              ],
            }),
          ]),
          new Paragraph({ text: '2.2 Illustration', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                type: 'png',
                data: BLUE_PNG,
                transformation: { width: 120, height: 120 },
                altText: {
                  title: 'Schéma',
                  description: 'Schéma d’architecture simplifié',
                  name: 'schema',
                },
              }),
            ],
          }),
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({
                text: 'Figure 1 — Schéma d’architecture simplifié',
                italics: true,
                size: 18,
              }),
            ],
          }),
          new Paragraph({
            text: '2.3 Citation du responsable technique',
            heading: HeadingLevel.HEADING_2,
          }),
          new Paragraph({
            indent: { left: 720 },
            children: [
              new TextRun({
                text: '« On sait que la dette est là, on n’a jamais eu le temps de la rembourser. »',
                italics: true,
              }),
            ],
          }),
          new Paragraph({ children: [new PageBreak()] }),
          new Paragraph({ text: '3. Recommandations', heading: HeadingLevel.HEADING_1 }),
          num('Sortir les secrets dans un coffre', 0, 'numeros-2'),
          num('Ajouter un lint bloquant en CI', 0, 'numeros-2'),
          num('Couvrir les modules critiques à 80 %', 0, 'numeros-2'),
          new Paragraph({ text: '3.1 Planning proposé', heading: HeadingLevel.HEADING_2 }),
          fullWidth([
            new TableRow({
              tableHeader: true,
              children: [
                cell('Semaine', { bold: true }),
                cell('Action', { bold: true }),
                cell('Responsable', { bold: true }),
              ],
            }),
            new TableRow({ children: [cell('S1'), cell('Coffre de secrets'), cell('Ops')] }),
            new TableRow({ children: [cell('S2–S3'), cell('Lint + tests'), cell('Dev')] }),
            new TableRow({ children: [cell('S4'), cell('Recette'), cell('PO')] }),
          ]),
          new Paragraph({ text: 'Annexe A — Glossaire', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun({ text: 'N+1', bold: true }),
              new TextRun(' : une requête par ligne au lieu d’une requête groupée. Formule : O(n)'),
              new TextRun({ text: '2', superScript: true }),
              new TextRun(' dans le pire cas, H'),
              new TextRun({ text: '2', subScript: true }),
              new TextRun('O pour l’exemple d’indice.'),
            ],
          }),
        ],
      },
    ],
  });
}

function tableauxComplexes(): Document {
  const inner = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ children: [cell('Table'), cell('imbriquée')] }),
      new TableRow({ children: [cell('1'), cell('2')] }),
    ],
  });
  return new Document({
    numbering: NUMBERING,
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Fusions horizontales et verticales',
            heading: HeadingLevel.HEADING_1,
          }),
          fullWidth([
            new TableRow({
              tableHeader: true,
              children: [
                cell('Trimestre', { bold: true }),
                cell('Produit', { bold: true }),
                cell('Ventes', { bold: true }),
                cell('Marge', { bold: true }),
              ],
            }),
            new TableRow({
              children: [
                cell('T1', { verticalMerge: 'restart' }),
                cell('Alpha'),
                cell('120'),
                cell('18 %'),
              ],
            }),
            new TableRow({
              children: [
                cell('', { verticalMerge: 'continue' }),
                cell('Beta'),
                cell('80'),
                cell('22 %'),
              ],
            }),
            new TableRow({
              children: [
                cell('T2', { verticalMerge: 'restart' }),
                cell('Alpha'),
                cell('140'),
                cell('19 %'),
              ],
            }),
            new TableRow({
              children: [
                cell('', { verticalMerge: 'continue' }),
                cell('Beta'),
                cell(''),
                cell('—'),
              ],
            }),
            new TableRow({
              children: [
                cell('Total semestre', { bold: true, columnSpan: 2 }),
                cell('340', { bold: true }),
                cell('19,5 %', { bold: true }),
              ],
            }),
          ]),
          new Paragraph({
            text: 'Contenu riche dans les cellules',
            heading: HeadingLevel.HEADING_1,
          }),
          fullWidth([
            new TableRow({
              children: [
                cell('Liste', { bold: true }),
                cell('Image', { bold: true }),
                cell('Imbriquée', { bold: true }),
              ],
            }),
            new TableRow({
              children: [
                cell([bullet('Un'), bullet('Deux'), bullet('Trois', 1)]),
                cell([
                  new Paragraph({
                    children: [
                      new ImageRun({
                        type: 'png',
                        data: BLUE_PNG,
                        transformation: { width: 40, height: 40 },
                        altText: { title: 'Carré', description: 'Carré bleu', name: 'bleu' },
                      }),
                    ],
                  }),
                ]),
                cell([new Paragraph('Avant'), inner, new Paragraph('Après')]),
              ],
            }),
          ]),
          new Paragraph({
            text: 'Table sans en-tête, sans bordures',
            heading: HeadingLevel.HEADING_1,
          }),
          new Table({
            width: { size: 60, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
              insideVertical: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
            },
            rows: [
              new TableRow({ children: [cell('Clé'), cell('Valeur')] }),
              new TableRow({ children: [cell('Version'), cell('2.4')] }),
            ],
          }),
        ],
      },
    ],
  });
}

function stylesFrancais(): Document {
  return new Document({
    styles: {
      paragraphStyles: [
        {
          id: 'Titre1',
          name: 'Titre 1',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 32, bold: true, color: '2F5496' },
          paragraph: { spacing: { before: 240 } },
        },
        {
          id: 'Titre2',
          name: 'Titre 2',
          basedOn: 'Normal',
          next: 'Normal',
          run: { size: 26, bold: true, color: '2F5496' },
        },
        {
          id: 'Citation',
          name: 'Citation',
          basedOn: 'Normal',
          run: { italics: true, color: '404040' },
          paragraph: { indent: { left: 720, right: 720 } },
        },
        {
          id: 'CitationIntense',
          name: 'Citation intense',
          basedOn: 'Normal',
          run: { italics: true, bold: true, color: '2F5496' },
          paragraph: { indent: { left: 720, right: 720 } },
        },
        { id: 'Code', name: 'Code', basedOn: 'Normal', run: { font: 'Consolas', size: 20 } },
        {
          id: 'Prformat',
          name: 'Préformaté HTML',
          basedOn: 'Normal',
          run: { font: 'Courier New', size: 20 },
        },
      ],
      characterStyles: [
        { id: 'Fort', name: 'Fort', run: { bold: true } },
        { id: 'Accentuation', name: 'Accentuation', run: { italics: true } },
      ],
    },
    sections: [
      {
        children: [
          new Paragraph({ text: 'Titre de niveau 1 (style « Titre 1 »)', style: 'Titre1' }),
          new Paragraph({ text: 'Titre de niveau 2 (style « Titre 2 »)', style: 'Titre2' }),
          new Paragraph({
            children: [
              new TextRun('Paragraphe normal avec un mot en style '),
              new TextRun({ text: 'Fort', style: 'Fort' }),
              new TextRun(' et un autre en '),
              new TextRun({ text: 'Accentuation', style: 'Accentuation' }),
              new TextRun('.'),
            ],
          }),
          new Paragraph({
            text: 'Une citation posée avec le style « Citation ».',
            style: 'Citation',
          }),
          new Paragraph({ text: 'Une citation intense.', style: 'CitationIntense' }),
          new Paragraph({ text: 'const x = 42; // style Code', style: 'Code' }),
          new Paragraph({ text: 'if (x) {\n  return x;\n}', style: 'Prformat' }),
        ],
      },
    ],
  });
}

function long(): Document {
  const children: Array<Paragraph | Table> = [
    new Paragraph({ text: 'Document long', heading: HeadingLevel.HEADING_1 }),
  ];
  for (let i = 1; i <= 300; i += 1) {
    if (i % 25 === 0)
      children.push(
        new Paragraph({ text: `Section ${String(i / 25)}`, heading: HeadingLevel.HEADING_2 }),
      );
    children.push(
      new Paragraph({
        children: [
          new TextRun(`Paragraphe ${String(i)} : `),
          new TextRun({ text: 'lorem ipsum', bold: i % 3 === 0 }),
          new TextRun({ text: ' dolor sit amet', italics: i % 5 === 0 }),
          new TextRun(
            ', consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
          ),
        ],
      }),
    );
    if (i % 20 === 0) {
      children.push(
        fullWidth([
          new TableRow({
            tableHeader: true,
            children: [
              cell('Id', { bold: true }),
              cell('Nom', { bold: true }),
              cell('Valeur', { bold: true }),
              cell('Statut', { bold: true }),
            ],
          }),
          ...[1, 2, 3, 4, 5].map(
            (r) =>
              new TableRow({
                children: [
                  cell(String(i + r)),
                  cell(`Ligne ${String(r)}`),
                  cell(String(r * 10)),
                  cell(r % 2 ? 'OK' : 'KO'),
                ],
              }),
          ),
        ]),
      );
    }
  }
  return new Document({ sections: [{ children }] });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const docs: Array<[string, Document]> = [
    ['04-rapport-client.docx', rapportClient()],
    ['05-tableaux-complexes.docx', tableauxComplexes()],
    ['06-styles-francais.docx', stylesFrancais()],
    ['07-long.docx', long()],
  ];
  for (const [name, doc] of docs) {
    const buffer = await Packer.toBuffer(doc);
    await writeFile(join(OUT_DIR, name), buffer);
    console.log(`✓ ${name} (${buffer.length} octets)`);
  }
}

await main();
