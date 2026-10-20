import { importDocx } from '../import-docx';
import { createNumberingResolver } from '../reader/lists';
import { defaultXmlParse, openPackage, relsPathOf } from '../reader/package';
import { createStyleResolver } from '../reader/styles';
import type { DocxPackage, NumberingResolver, StyleResolver } from '../reader/types';
import type { DocxInput, DocxLostObject } from '../types';
import { compareBlocks, headerFooterSummary, type CompareContext } from './compare-blocks';
import { readDocumentModel, type DocumentModel, type HeaderFooterType } from './model';
import { compareParts, listParts } from './parts';
import { computeScore, Tally } from './tally';
import type { CompareDocx, CompareDocxOptions, FidelityReport } from './types';
import { ABSENT, fmt } from './values';

/**
 * `compareDocx(original, result, options)` : ouvre les deux paquets, compare les parties
 * annexes à l'octet, aligne les blocs des deux corps et compare leurs propriétés résolues
 * (styles, docDefaults et thème de chaque document), puis les sections avec leurs en-têtes
 * et pieds. Le score est la moyenne pondérée par groupe (`tally.ts`). Les objets non
 * représentables sont ceux que `importDocx` (chemin stylé) signale pour chaque document.
 */

const HEADER_FOOTER_TYPES: readonly HeaderFooterType[] = ['default', 'first', 'even'];

const NOTES: readonly string[] = [
  'Une propriété est comptée quand au moins un des deux documents la pose ; une valeur ajoutée par le résultat compte comme perdue, une valeur absente des deux côtés ne compte pas. Les défauts de Word (alignement à gauche, espacement ou retrait nul, interligne simple, orientation portrait, une seule colonne) valent « absent ».',
  'Les propriétés de paragraphe et de run sont résolues (docDefaults, thème, styles) dans chacun des deux documents, sans le style de tableau : les styles conditionnels de tableau (première ligne, bandes) ne sont pas comparés.',
  'Images : nombre et dimensions (±1 px) seulement ; habillage, position des images ancrées et octets des médias (couverts par les parties du paquet) ne sont pas comparés.',
  'Tableaux : bordures effectives telles que Word les rend (style de tableau, puis `w:tblBorders` selon la position de la cellule dans la grille, puis `w:tcBorders`, `nil` efface) ; côté tableau seules les bordures extérieures sont comparées. Largeur de cellule effective (`w:tcW`, sinon les colonnes de grille couvertes) ; largeurs de colonnes et de cellules à ±0,5 pt.',
  'Saut de page explicite (`w:br w:type="page"`) : frontière de bloc, pas un caractère ; le paragraphe qui le précède porte `paragraph.pageBreakAfter`, un paragraphe réduit au saut se replie sur le précédent.',
  'Champs de fusion (`MERGEFIELD` simple ou complexe) : modélisés par leur nom et leur résultat ; le texte du paragraphe inclut le résultat affiché par Word, `field.mergeField` compare la liste ordonnée des noms, et un `{{nom}}` en clair vaut un champ de même nom. Autres champs (page, date…) : seul le texte de résultat est comparé. Tabulations comparées comme caractère, taquets ignorés.',
  'Révisions : le texte inséré est lu, le texte supprimé ignoré ; commentaires, signets, `w:proofErr` et `w:lastRenderedPageBreak` ne sont jamais comparés.',
];

/** Détection d’`ArrayBuffer` robuste aux realms (jsdom vs Node). */
function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === '[object ArrayBuffer]';
}

async function toArrayBuffer(input: DocxInput, label: string): Promise<ArrayBuffer> {
  if (isArrayBuffer(input)) return input;
  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  }
  if (input && typeof (input as { arrayBuffer?: unknown }).arrayBuffer === 'function') {
    return input.arrayBuffer();
  }
  throw new Error(`compareDocx : ${label} doit être un File, un ArrayBuffer ou une vue typée`);
}

interface OpenedDocument {
  readonly buffer: ArrayBuffer;
  readonly pkg: DocxPackage;
  readonly styles: StyleResolver;
  readonly numbering: NumberingResolver;
  readonly model: DocumentModel;
}

async function open(buffer: ArrayBuffer): Promise<OpenedDocument> {
  const pkg = await openPackage(buffer, defaultXmlParse());
  const [styles, numbering] = await Promise.all([
    createStyleResolver(pkg),
    createNumberingResolver(pkg),
  ]);
  const model = await readDocumentModel(pkg, styles, numbering);
  return { buffer, pkg, styles, numbering, model };
}

function compareSections(a: DocumentModel, b: DocumentModel, ctx: CompareContext): void {
  const { tally } = ctx;
  if (a.lang !== undefined || b.lang !== undefined) {
    tally.record('section', 'section.lang', 'document', fmt(a.lang), fmt(b.lang));
  }
  tally.record(
    'section',
    'section.count',
    'document',
    String(a.sections.length),
    String(b.sections.length),
  );
  a.sections.forEach((section, index) => {
    const other = b.sections[index];
    const where = `section ${String(index + 1)}`;
    const record = (name: string, expected: unknown, actual: unknown): void => {
      if (expected === undefined && actual === undefined) return;
      tally.record('section', name, where, fmt(expected), other ? fmt(actual) : ABSENT);
    };
    record('section.type', section.type, other?.type);
    record('section.pgSz', section.pageSize, other?.pageSize);
    record('section.pgMar', section.margins, other?.margins);
    record('section.cols', section.columns, other?.columns);
    tally.record(
      'section',
      'section.titlePg',
      where,
      String(section.titlePage),
      other ? String(other.titlePage) : ABSENT,
    );
    for (const kind of ['header', 'footer'] as const) {
      const mine = kind === 'header' ? section.headers : section.footers;
      const theirs = kind === 'header' ? other?.headers : other?.footers;
      for (const type of HEADER_FOOTER_TYPES) {
        const part = mine[type];
        const otherPart = theirs?.[type];
        if (!part && !otherPart) continue;
        const partWhere = `${where} ${kind === 'header' ? 'en-tête' : 'pied'} ${type}`;
        const expected = part ? headerFooterSummary(part) : undefined;
        const actual = otherPart ? headerFooterSummary(otherPart) : undefined;
        // Même tolérance que pour le corps : `{{nom}}` en clair vaut un champ de fusion.
        const sameText =
          expected !== undefined &&
          actual !== undefined &&
          expected.placeholderText === actual.placeholderText;
        tally.record(
          'header-footer',
          `${kind}.${type}.text`,
          partWhere,
          expected?.text ?? ABSENT,
          sameText ? expected.text : (actual?.text ?? ABSENT),
        );
        tally.record(
          'header-footer',
          `${kind}.${type}.format`,
          partWhere,
          expected?.format ?? ABSENT,
          actual?.format ?? ABSENT,
        );
      }
    }
  });
}

function sameLost(a: DocxLostObject, b: DocxLostObject): boolean {
  return a.kind === b.kind && a.where === b.where && a.detail === b.detail && a.text === b.text;
}

/** Objets non représentables des deux documents, dédoublonnés ; un import qui échoue n'en ajoute aucun. */
async function collectLost(buffers: readonly ArrayBuffer[]): Promise<DocxLostObject[]> {
  const lost: DocxLostObject[] = [];
  for (const buffer of buffers) {
    let found: readonly DocxLostObject[];
    try {
      found = (await importDocx(buffer, { fidelity: 'styled' })).lost;
    } catch {
      found = [];
    }
    for (const item of found) if (!lost.some((known) => sameLost(known, item))) lost.push(item);
  }
  return lost;
}

/** Compare un `.docx` d'origine et un résultat, propriété par propriété. Signature figée (`CompareDocx`). */
export const compareDocx: CompareDocx = async (
  original: DocxInput,
  result: DocxInput,
  options: CompareDocxOptions = {},
): Promise<FidelityReport> => {
  const ignoreRevisionIds = options.ignoreRevisionIds !== false;
  const [a, b] = await Promise.all([
    toArrayBuffer(original, "l'original").then(open),
    toArrayBuffer(result, 'le résultat').then(open),
  ]);

  const tally = new Tally();
  const ctx: CompareContext = { tally, ignoreRevisionIds };

  const excluded = new Set<string>([
    a.pkg.mainPart,
    relsPathOf(a.pkg.mainPart),
    'docProps/core.xml',
    'docProps/app.xml',
  ]);
  const parts = compareParts(await listParts(a.buffer), await listParts(b.buffer), {
    prefixes: options.binaryParts,
    excluded,
    ignoreRevisionIds,
    parseXml: defaultXmlParse(),
  });
  for (const { path, kept, summary } of parts.compared) {
    tally.record('package-part', `part:${path}`, path, 'identique', kept ? 'identique' : summary);
  }

  compareBlocks(a.model.blocks, b.model.blocks, '', ctx);
  compareSections(a.model, b.model, ctx);

  const properties = tally.properties();
  const notes = [...NOTES];
  if (a.model.sections.length !== b.model.sections.length) {
    notes.push(
      `Nombre de sections différent (${String(a.model.sections.length)} → ${String(b.model.sections.length)}) : les sections sont alignées par position.`,
    );
  }
  return {
    score: computeScore(properties),
    properties,
    identicalParts: parts.identical,
    changedParts: parts.changed,
    lost: await collectLost([a.buffer, b.buffer]),
    notes,
  };
};
