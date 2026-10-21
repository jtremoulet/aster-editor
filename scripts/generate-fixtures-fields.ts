/**
 * Génère la fixture .docx des champs Word en en-tête (session 5, retour POC n° 1) dans
 * `fixtures/docx/` :
 *
 * - `20-champs-en-tete.docx` : un en-tête `default` et un corps qui portent les **mêmes**
 *   champs, chacun dans un paragraphe libellé : `TITLE` sans résultat (`w:fldSimple` vide),
 *   `DOCPROPERTY Title`, `DOCPROPERTY Company`, `AUTHOR`, `DATE` avec leur résultat en
 *   cache, `PAGE` (champ complexe de la lib, sans résultat), un contrôle de contenu
 *   « Propriété du document » tel que Word le produit (`w:sdt` texte brut, `w:alias="Titre"`,
 *   `w:tag=""`, `w:dataBinding` vers `dc:title`, espace réservé `[Titre]` affiché, injecté
 *   par patch XML), un `MERGEFIELD Nom` (`w:fldSimple`) et un `{{Societe}}` tapé, puis un
 *   champ complexe `TITLE` **sans** `w:fldChar separate` (patch XML). Attendu figé par
 *   `import-docx.fields.spec.ts` : seuls `MERGEFIELD` et `{{nom}}` deviennent des
 *   variables, les autres champs rendent leur résultat (vide → rien), le contrôle lié rend
 *   son espace réservé en texte ordinaire.
 *
 * Reproductible : `node scripts/generate-fixtures-fields.ts` (Node 24, type stripping).
 * Le titre du document (`docProps/core.xml`) est posé pour que `TITLE` et `DOCPROPERTY
 * Title` aient une source réelle dans Word.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document,
  Header,
  HeadingLevel,
  Packer,
  PageNumber,
  Paragraph,
  SimpleField,
  SimpleMailMergeField,
  TextRun,
} from 'docx';
import type { ParagraphChild } from 'docx';
import JSZip from 'jszip';

const OUT_DIR = fileURLToPath(new URL('../fixtures/docx/', import.meta.url));

/** Titre du document, source des champs `TITLE` et `DOCPROPERTY Title`. */
const DOCUMENT_TITLE = 'Fixture 20 — Champs en en-tête';

/** Marqueur remplacé par le contrôle de contenu lié (propriété du document « Titre »). */
const BOUND_SDT_MARKER = '[[SDT-TITRE]]';

/** Marqueur remplacé par un champ complexe `TITLE` sans `separate`. */
const COMPLEX_TITLE_MARKER = '[[COMPLEX-TITLE]]';

/** Espace de noms Dublin Core et core-properties, ceux que Word écrit dans `w:dataBinding`. */
const DC_NS = 'http://purl.org/dc/elements/1.1/';
const CORE_NS = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';

/**
 * Les mêmes paragraphes pour l'en-tête et le corps : chaque champ est libellé en clair
 * pour que les tests cherchent le libellé puis ce qui le suit.
 */
function fieldParagraphs(): Paragraph[] {
  const text = (value: string): TextRun => new TextRun(value);
  const line = (children: ParagraphChild[]): Paragraph => new Paragraph({ children });
  return [
    // Pas d'espace avant le `|` : le champ `TITLE` vide ne laisse aucun caractère, et deux
    // espaces consécutifs seraient réduits à un seul par l'éditeur (HTML).
    line([
      text('Champ TITLE : '),
      new SimpleField('TITLE'),
      text('| DOCPROPERTY Title : '),
      new SimpleField('DOCPROPERTY Title \\* MERGEFORMAT', 'Titre du document'),
    ]),
    line([
      text('DOCPROPERTY Company : '),
      new SimpleField('DOCPROPERTY Company \\* MERGEFORMAT', 'Aster Editor'),
      text(' | AUTHOR : '),
      new SimpleField('AUTHOR', 'Auteur démo'),
      text(' | DATE : '),
      new SimpleField('DATE \\@ "dd/MM/yyyy"', '21/10/2026'),
      text(' | PAGE : '),
      new TextRun({ children: [PageNumber.CURRENT] }),
    ]),
    line([text('Propriété du document liée : '), text(BOUND_SDT_MARKER)]),
    line([
      text('Fusion : '),
      new SimpleMailMergeField('Nom'),
      text(' | Société tapée : {{Societe}}'),
    ]),
    line([text('Champ complexe TITLE sans separate : '), text(COMPLEX_TITLE_MARKER)]),
  ];
}

/** Fixture 20 : en-tête et corps aux mêmes champs. */
function headerFields(): Document {
  return new Document({
    title: DOCUMENT_TITLE,
    creator: 'Auteur démo',
    sections: [
      {
        headers: { default: new Header({ children: fieldParagraphs() }) },
        children: [
          new Paragraph({ text: DOCUMENT_TITLE, heading: HeadingLevel.HEADING_1 }),
          new Paragraph("Les mêmes champs que l'en-tête, dans le corps :"),
          ...fieldParagraphs(),
          new Paragraph('Fin des champs'),
        ],
      },
    ],
  });
}

/**
 * Contrôle de contenu « Propriété du document » de Word (Insertion → QuickPart →
 * Propriété du document → Titre, Word en français) : texte brut (`w:text`), `w:alias`
 * localisé « Titre », `w:tag` vide, liaison `w:dataBinding` vers `dc:title` des propriétés
 * du paquet, espace réservé affiché (`w:showingPlcHdr`) avec le texte `[Titre]`. Le
 * `w:storeItemID` ne désigne aucune partie `customXml` ici : Word affiche alors l'espace
 * réservé, ce que le lecteur doit rendre en texte ordinaire.
 */
function boundTitleControl(): string {
  return (
    `</w:t></w:r>` +
    `<w:sdt><w:sdtPr><w:alias w:val="Titre"/><w:tag w:val=""/><w:id w:val="2020"/>` +
    `<w:dataBinding w:prefixMappings="xmlns:ns0='${DC_NS}' xmlns:ns1='${CORE_NS}' " ` +
    `w:xpath="/ns1:coreProperties[1]/ns0:title[1]" w:storeItemID="{6C3C8BC8-F283-45AE-878A-BAB7291924A1}"/>` +
    `<w:text/><w:showingPlcHdr/></w:sdtPr>` +
    `<w:sdtContent><w:r><w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr><w:t>[Titre]</w:t></w:r></w:sdtContent></w:sdt>` +
    `<w:r><w:t xml:space="preserve">`
  );
}

/** Champ complexe `TITLE` sans `separate` ni résultat : `begin`, `instrText`, `end`. */
function complexTitleField(): string {
  return (
    `</w:t></w:r>` +
    `<w:r><w:fldChar w:fldCharType="begin"/></w:r>` +
    `<w:r><w:instrText xml:space="preserve"> TITLE </w:instrText></w:r>` +
    `<w:r><w:fldChar w:fldCharType="end"/></w:r>` +
    `<w:r><w:t xml:space="preserve">`
  );
}

/** Remplace les marqueurs dans le corps et dans chaque partie d'en-tête du paquet. */
async function patchMarkers(buffer: Buffer): Promise<Buffer> {
  const zip = await JSZip.loadAsync(buffer);
  const parts = zip.file(/^word\/(?:document|header\d*)\.xml$/).map((file) => file.name);
  for (const path of parts) {
    const xml = await zip.file(path)!.async('string');
    const patched = xml
      .split(BOUND_SDT_MARKER)
      .join(boundTitleControl())
      .split(COMPLEX_TITLE_MARKER)
      .join(complexTitleField());
    if (patched !== xml) zip.file(path, patched);
  }
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  const name = '20-champs-en-tete.docx';
  const buffer = await patchMarkers(await Packer.toBuffer(headerFields()));
  if (buffer.includes(BOUND_SDT_MARKER) || buffer.includes(COMPLEX_TITLE_MARKER)) {
    throw new Error('marqueur non remplacé');
  }
  await writeFile(join(OUT_DIR, name), buffer);
  console.log(`✓ ${name} (${String(buffer.length)} octets)`);
}

await main();
