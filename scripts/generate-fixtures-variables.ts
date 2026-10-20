/**
 * Génère les fixtures .docx à variables dans `fixtures/docx/` :
 *
 * - `08-variables-braces.docx` : syntaxe `{{nom}}` dans des paragraphes, un titre, une table,
 *   une liste, avec des marques autour et un `{{` cassé sur deux runs.
 * - `09-variables-mergefields.docx` : champs de fusion Word, forme simple (`w:fldSimple`,
 *   produite par la lib `docx`) et forme complexe (`w:fldChar begin … end`, injectée par
 *   patch XML car la lib ne la produit pas).
 * - `10-variables-content-controls.docx` : contrôles de contenu `w:sdt` avec `w:tag` et
 *   `w:alias`, injectés par patch XML.
 *
 * Reproductible : `node scripts/generate-fixtures-variables.ts` (Node 24, type stripping).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  AlignmentType,
  Document,
  HeadingLevel,
  LevelFormat,
  Packer,
  Paragraph,
  SimpleMailMergeField,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import JSZip from 'jszip';

const OUT_DIR = fileURLToPath(new URL('../fixtures/docx/', import.meta.url));

const NUMBERING = {
  config: [
    {
      reference: 'puces',
      levels: [
        {
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        },
      ],
    },
  ],
};

function cell(children: Paragraph[]): TableCell {
  return new TableCell({ children });
}

/** Document avec la syntaxe canonique `{{nom}}`. */
function braces(): Document {
  return new Document({
    numbering: NUMBERING,
    sections: [
      {
        children: [
          new Paragraph({
            text: 'Contrat de prestation — {{client.nom}}',
            heading: HeadingLevel.HEADING_1,
          }),
          new Paragraph({
            children: [
              new TextRun('Entre la société '),
              new TextRun({ text: '{{prestataire}}', bold: true }),
              new TextRun(' et '),
              new TextRun('{{client.nom}}'),
              new TextRun(', représentée par {{client.representant}}, ci-après « le Client ».'),
            ],
          }),
          new Paragraph({
            // Un `{{` coupé sur deux runs, comme Word le fait après une correction.
            children: [
              new TextRun('Date de signature : {'),
              new TextRun('{date_signature}}'),
              new TextRun('.'),
            ],
          }),
          new Paragraph({ text: 'Prestations', heading: HeadingLevel.HEADING_2 }),
          new Paragraph({
            text: 'Prestation principale : {{prestation}}',
            numbering: { reference: 'puces', level: 0 },
          }),
          new Paragraph({
            text: 'Durée : {{duree_jours}} jours',
            numbering: { reference: 'puces', level: 0 },
          }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                tableHeader: true,
                children: [
                  cell([new Paragraph({ children: [new TextRun({ text: 'Poste', bold: true })] })]),
                  cell([
                    new Paragraph({ children: [new TextRun({ text: 'Montant HT', bold: true })] }),
                  ]),
                ],
              }),
              new TableRow({
                children: [
                  cell([new Paragraph('Forfait')]),
                  cell([new Paragraph('{{montant_ht}} €')]),
                ],
              }),
              new TableRow({
                children: [cell([new Paragraph('TVA')]), cell([new Paragraph('{{tva}} %')])],
              }),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Fait à {{lieu}}, le {{date_signature}}.', italics: true }),
            ],
          }),
          new Paragraph(
            'Texte sans variable mais avec des accolades { seules } et un {{ incomplet.',
          ),
        ],
      },
    ],
  });
}

/** Document avec des champs de fusion simples, un complexe étant injecté ensuite par patch XML. */
function mergeFields(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Courrier de relance', heading: HeadingLevel.HEADING_1 }),
          new Paragraph({
            children: [
              new TextRun('Madame, Monsieur '),
              new SimpleMailMergeField('Nom'),
              new TextRun(', votre facture n° '),
              new SimpleMailMergeField('NumeroFacture'),
              new TextRun(" d'un montant de "),
              new SimpleMailMergeField('Montant'),
              new TextRun(' € reste impayée.'),
            ],
          }),
          // Marqueur remplacé par un champ complexe (fldChar begin/instrText/separate/end).
          new Paragraph('Échéance : [[COMPLEX:DateEcheance|12/03/2026]].'),
          new Paragraph({
            children: [
              new TextRun({ text: 'Cordialement, ', italics: true }),
              new SimpleMailMergeField('Signataire'),
            ],
          }),
        ],
      },
    ],
  });
}

/** Document dont les variables sont des contrôles de contenu `w:sdt`, injectés par patch XML. */
function contentControls(): Document {
  return new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: 'Attestation', heading: HeadingLevel.HEADING_1 }),
          new Paragraph(
            'Je soussigné [[SDT:nom_complet|Nom complet|Jean Dupont]], atteste que [[SDT:objet|Objet|le présent document]] est exact.',
          ),
          new Paragraph('Fait le [[SDT:date|Date|]].'),
        ],
      },
    ],
  });
}

/** Champ complexe Word : `[[COMPLEX:nom|resultat]]` → fldChar begin, instrText, separate, résultat, end. */
function complexField(name: string, result: string): string {
  return (
    `</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> MERGEFIELD ${name} \\* MERGEFORMAT </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="separate"/></w:r>` +
    `<w:r><w:t>«${result}»</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `<w:r><w:t xml:space="preserve">`
  );
}

/** Contrôle de contenu : `[[SDT:tag|alias|texte]]` → `w:sdt` avec `w:tag`, `w:alias` et contenu. */
function contentControl(tag: string, alias: string, text: string): string {
  const content = text.length > 0 ? text : `Cliquez ici pour saisir ${alias.toLowerCase()}.`;
  return (
    `</w:t></w:r>` +
    `<w:sdt><w:sdtPr><w:alias w:val="${alias}"/><w:tag w:val="${tag}"/><w:id w:val="${String(1000 + tag.length)}"/>` +
    (text.length > 0 ? '' : '<w:showingPlcHdr/>') +
    `</w:sdtPr><w:sdtContent><w:r><w:t xml:space="preserve">${content}</w:t></w:r></w:sdtContent></w:sdt>` +
    `<w:r><w:t xml:space="preserve">`
  );
}

/** Remplace les marqueurs `[[…]]` du document.xml par le XML Word correspondant. */
async function patchXml(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const path = 'word/document.xml';
  let xml = await zip.file(path)!.async('string');
  xml = xml.replace(/\[\[COMPLEX:([^|\]]+)\|([^\]]*)\]\]/g, (_m, name: string, result: string) =>
    complexField(name, result),
  );
  xml = xml.replace(
    /\[\[SDT:([^|\]]+)\|([^|\]]*)\|([^\]]*)\]\]/g,
    (_m, tag: string, alias: string, text: string) => contentControl(tag, alias, text),
  );
  zip.file(path, xml);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const docs: Array<[string, Document, boolean]> = [
    ['08-variables-braces.docx', braces(), false],
    ['09-variables-mergefields.docx', mergeFields(), true],
    ['10-variables-content-controls.docx', contentControls(), true],
  ];
  for (const [name, doc, patched] of docs) {
    let buffer = await Packer.toBuffer(doc);
    if (patched) buffer = await patchXml(buffer);
    await writeFile(join(OUT_DIR, name), buffer);
    console.log(`✓ ${name} (${buffer.length} octets)`);
  }
}

await main();
