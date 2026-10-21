import { inflateRawSync } from 'node:zlib';
import { importDocx } from '../../docx/import-docx.js';
import type { DocxImportResult } from '../../docx/types.js';
import { loadDocx } from '../docx-module.js';
import { exportDocx } from '../export-docx.js';
import { buildDocx } from '../html-to-docx.js';
import type { DocxExportOptions, DocxExportWarning } from '../types.js';

/** PNG 2x2 rouge, le plus petit PNG valide, en base64 (même image que les fixtures). */
export const RED_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP4z8DwHwyBNAMDAEb+B/0lmPkNAAAAAElFTkSuQmCC';

/** Data URL du PNG rouge. */
export const RED_PNG_DATA_URL = `data:image/png;base64,${RED_PNG_BASE64}`;

/**
 * Document complet couvrant tout le mapping : titres, marques, lien, listes imbriquées
 * à trois niveaux, liste lettrée, citation, bloc de code, filet, image et table avec
 * en-tête, fusion horizontale et verticale. Sert à l'aller-retour export → import.
 */
export const SAMPLE_HTML = `
<h1>Titre principal</h1>
<p>Un paragraphe avec du <strong>gras</strong>, de l'<em>italique</em>, du <u>souligné</u>,
du <s>barré</s>, du <code>code</code>, du <mark>surligné</mark>, H<sub>2</sub>O et x<sup>2</sup>.</p>
<p style="text-align: center">Centré avec <span style="color: #ff0000">rouge</span> et
<span style="font-family: Arial; font-size: 18px">Arial 18px</span>.</p>
<h2>Sous-titre</h2>
<p>Voir <a href="https://example.com">le site</a>.</p>
<ul>
  <li><p>Premier point</p>
    <ul>
      <li><p>Sous-point A</p>
        <ul><li><p>Sous-sous-point</p></li></ul>
      </li>
      <li><p>Sous-point B</p></li>
    </ul>
  </li>
  <li><p>Deuxième point</p></li>
</ul>
<h3>Étapes</h3>
<ol>
  <li><p>Étape un</p>
    <ol type="a"><li><p>Détail a</p></li><li><p>Détail b</p></li></ol>
  </li>
  <li><p>Étape deux</p></li>
</ol>
<blockquote><p>Une citation sur une ligne.</p></blockquote>
<pre><code>const a = 1;
const b = 2;</code></pre>
<hr>
<p>Une image : <img src="${RED_PNG_DATA_URL}" alt="Carré rouge" width="40" height="40"></p>
<table>
  <thead><tr><th>Nom</th><th>Rôle</th><th>Ville</th></tr></thead>
  <tbody>
    <tr><td>Alice</td><td>Dev</td><td rowspan="2">Montpellier</td></tr>
    <tr><td>Bob</td><td>Design</td></tr>
    <tr><td colspan="3">Fusion sur trois colonnes</td></tr>
  </tbody>
</table>
<p>Ligne 1<br>Ligne 2</p>
`;

/**
 * Exporte puis réimporte : le résultat d'`importDocx` sur le .docx produit. Relecture en
 * `fidelity: 'semantic'` (mammoth) : les tests de l'export assertent le HTML sémantique
 * sans attributs de style, et plusieurs documentent des limites propres à mammoth
 * (M-1, M-2, X-3). Le chemin stylé, défaut depuis la 0.6, est couvert par `layout.spec.ts`.
 */
export async function roundTrip(
  html: string,
  options: DocxExportOptions = {},
): Promise<DocxImportResult> {
  const blob = await exportDocx(html, options);
  return importDocx(await blob.arrayBuffer(), { fidelity: 'semantic' });
}

/** Parse un fragment HTML dans un `Document` jsdom isolé. */
export function parseFragment(html: string): Document {
  return new DOMParser().parseFromString(
    `<!doctype html><html><body>${html}</body></html>`,
    'text/html',
  );
}

/** Résultat de `toDocumentXml` : le XML principal et les avertissements de conversion. */
export interface DocumentXml {
  readonly xml: string;
  readonly warnings: readonly DocxExportWarning[];
}

/** Entier little-endian sur 16 ou 32 bits. */
function readLE(bytes: Uint8Array, offset: number, size: 2 | 4): number {
  let value = 0;
  for (let i = size - 1; i >= 0; i -= 1) value = value * 256 + (bytes[offset + i] ?? 0);
  return value;
}

/**
 * Parcourt le répertoire central d'une archive zip et rend, pour chaque entrée, son
 * nom et un lecteur paresseux de son contenu décodé : lecteur minimal pour les tests,
 * sans dépendre de JSZip (dépendance interne de `docx`). Méthodes 0 (stocké) et
 * 8 (deflate) uniquement, ce que JSZip produit.
 */
function walkZip(archive: Uint8Array): Array<{ name: string; read: () => string }> {
  let eocd = archive.length - 22;
  while (eocd >= 0 && readLE(archive, eocd, 4) !== 0x06054b50) eocd -= 1;
  if (eocd < 0) throw new Error('zip: répertoire central introuvable');
  const entries = readLE(archive, eocd + 10, 2);
  let offset = readLE(archive, eocd + 16, 4);
  const decoder = new TextDecoder();
  const result: Array<{ name: string; read: () => string }> = [];
  for (let i = 0; i < entries; i += 1) {
    const method = readLE(archive, offset + 10, 2);
    const compressedSize = readLE(archive, offset + 20, 4);
    const nameLength = readLE(archive, offset + 28, 2);
    const extraLength = readLE(archive, offset + 30, 2);
    const commentLength = readLE(archive, offset + 32, 2);
    const localOffset = readLE(archive, offset + 42, 4);
    const name = decoder.decode(archive.subarray(offset + 46, offset + 46 + nameLength));
    result.push({
      name,
      read: () => {
        const dataStart =
          localOffset +
          30 +
          readLE(archive, localOffset + 26, 2) +
          readLE(archive, localOffset + 28, 2);
        const data = archive.subarray(dataStart, dataStart + compressedSize);
        return decoder.decode(method === 8 ? inflateRawSync(data) : data);
      },
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return result;
}

/** Extrait une entrée d'une archive zip par son nom (`word/document.xml`…). */
export function readZipEntry(archive: Uint8Array, name: string): string {
  const entry = walkZip(archive).find((candidate) => candidate.name === name);
  if (!entry) throw new Error(`zip: entrée ${name} absente`);
  return entry.read();
}

/**
 * Toutes les entrées textuelles d'un .docx (`word/document.xml`, `word/numbering.xml`,
 * `word/_rels/document.xml.rels`, `docProps/core.xml`…) indexées par nom. Les médias
 * (`word/media/*`) sont laissés de côté : ce sont des octets, pas du XML.
 */
export async function toZipEntries(blob: Blob): Promise<ReadonlyMap<string, string>> {
  const archive = new Uint8Array(await blob.arrayBuffer());
  const entries = new Map<string, string>();
  for (const entry of walkZip(archive)) {
    if (!entry.name.startsWith('word/media/')) entries.set(entry.name, entry.read());
  }
  return entries;
}

/**
 * Construit le document, l'empaquette et rend le XML de `word/document.xml`, pour
 * vérifier le mapping fin (alignement, couleurs, numérotation…).
 */
export async function toDocumentXml(
  html: string,
  options: DocxExportOptions = {},
): Promise<DocumentXml> {
  const docx = await loadDocx();
  const { document, warnings } = await buildDocx(parseFragment(html), docx, options);
  const archive = new Uint8Array(await docx.Packer.toArrayBuffer(document));
  return { xml: readZipEntry(archive, 'word/document.xml'), warnings };
}
