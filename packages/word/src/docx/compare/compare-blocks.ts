import type { ResolvedParagraphProps, ResolvedRunProps } from '../reader/types';
import { alignSequences } from './align';
import { MISSING, recordIfAny, type CompareContext } from './compare-context';
import { compareTable } from './compare-tables';
import type { BlockModel, HeaderFooterModel, ParagraphModel, RunModel } from './model';
import { ABSENT, fmt } from './values';

/**
 * Comparaison des blocs alignés : texte (avec l'équivalence `{{nom}}` / champ de fusion),
 * champs de fusion, style et format de paragraphe (saut de page après compris), runs
 * (alignés par texte après fusion des voisins identiques), listes, tableaux
 * (`compare-tables.ts`, cellules récursivement), images et notes. Une propriété n'est
 * comptée que si l'un des deux côtés la pose : une valeur ajoutée par le résultat compte
 * comme perdue, une valeur absente des deux côtés ne gonfle pas le score. Un bloc sans
 * vis-à-vis perd toutes ses propriétés.
 */

export { MISSING, type CompareContext } from './compare-context';

type ParagraphFormatKey = Exclude<
  keyof ResolvedParagraphProps,
  'styleId' | 'headingLevel' | 'numbering' | 'runDefaults'
>;

const PARAGRAPH_FORMAT_KEYS: readonly ParagraphFormatKey[] = [
  'align',
  'lineHeight',
  'lineHeightPt',
  'spacingBeforePt',
  'spacingAfterPt',
  'indentLeftPt',
  'indentRightPt',
  'indentFirstLinePt',
  'borders',
  'shading',
  'keepWithNext',
  'pageBreakBefore',
];

const RUN_KEYS: readonly (keyof ResolvedRunProps)[] = [
  'fontFamily',
  'fontSizePt',
  'bold',
  'italic',
  'underline',
  'strike',
  'color',
  'highlight',
  'superscript',
  'subscript',
  'letterSpacingPt',
  'caps',
  'runStyle',
  'lang',
];

const IMAGE_TOLERANCE_PX = 1;

/** Clé d'alignement : texte aux espaces repliés, pour qu'un espace final ne désaligne pas tout. */
function alignmentKey(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Liste vide ramenée à `undefined` : un paragraphe sans champ ne crée pas d'occurrence. */
function nonEmptyList(list: readonly string[] | undefined): readonly string[] | undefined {
  return list && list.length > 0 ? list : undefined;
}

/**
 * Valeur de format de paragraphe ramenée à `undefined` quand elle vaut le défaut de Word
 * (alignement à gauche, espacement ou retrait nul, interligne simple) : un document qui
 * écrit `w:jc w:val="left"` et un autre qui ne dit rien se rendent pareil.
 */
function effectiveParagraphValue(key: ParagraphFormatKey, value: unknown): unknown {
  if (key === 'align' && value === 'left') return undefined;
  if (key === 'lineHeight' && value === 1) return undefined;
  if (value === 0 && key !== 'lineHeight' && key !== 'lineHeightPt') return undefined;
  return value;
}

function compareRuns(
  original: readonly RunModel[],
  result: readonly RunModel[],
  where: string,
  ctx: CompareContext,
): void {
  const pairs = alignSequences(
    original.map((run) => alignmentKey(run.text)),
    result.map((run) => alignmentKey(run.text)),
  );
  for (const pair of pairs) {
    if (pair.a === undefined) continue;
    const a = original[pair.a];
    const b = pair.b === undefined ? undefined : result[pair.b];
    if (!a) continue;
    const runWhere = `${where} run « ${a.text.slice(0, 30)} »`;
    for (const key of RUN_KEYS) {
      recordIfAny(ctx, 'run-format', `run.${key}`, runWhere, a.props[key], b?.props[key], !!b);
    }
  }
}

function compareImages(
  a: ParagraphModel,
  b: ParagraphModel | undefined,
  where: string,
  ctx: CompareContext,
): void {
  const actual = b?.images ?? [];
  if (a.images.length === 0 && actual.length === 0) return;
  ctx.tally.record(
    'image',
    'image.count',
    where,
    String(a.images.length),
    b ? String(actual.length) : MISSING,
  );
  a.images.forEach((image, index) => {
    const other = actual[index];
    for (const key of ['widthPx', 'heightPx'] as const) {
      const expected = image[key];
      const found = other?.[key];
      if (expected === undefined && found === undefined) continue;
      const kept =
        expected !== undefined &&
        found !== undefined &&
        Math.abs(expected - found) <= IMAGE_TOLERANCE_PX;
      const name = key === 'widthPx' ? 'image.width' : 'image.height';
      const label = `${where} image ${String(index + 1)}`;
      const actualText = b ? fmt(found) : MISSING;
      ctx.tally.record('image', name, label, fmt(expected), kept ? fmt(expected) : actualText);
    }
  });
}

function compareNotes(
  a: ParagraphModel,
  b: ParagraphModel | undefined,
  where: string,
  ctx: CompareContext,
): void {
  const actual = b?.notes ?? [];
  if (a.notes.length === 0 && actual.length === 0) return;
  ctx.tally.record(
    'note',
    'note.count',
    where,
    String(a.notes.length),
    b ? String(actual.length) : MISSING,
  );
  a.notes.forEach((note, index) => {
    const other = actual[index];
    const label = `${where} note ${String(index + 1)}`;
    const missing = b ? ABSENT : MISSING;
    ctx.tally.record('note', 'note.kind', label, note.kind, other?.kind ?? missing);
    ctx.tally.record('note', 'note.text', label, note.text, other?.text ?? missing);
  });
}

/** Compare un paragraphe de l'original à son vis-à-vis (absent = tout perdu). */
export function compareParagraph(
  a: ParagraphModel,
  b: ParagraphModel | undefined,
  where: string,
  ctx: CompareContext,
): void {
  const present = b !== undefined;
  // Un `{{nom}}` en clair face au résultat d'un `MERGEFIELD` de même nom : texte conservé.
  const sameText =
    b !== undefined && (a.text === b.text || a.placeholderText === b.placeholderText);
  ctx.tally.record(
    'text',
    'paragraph.text',
    where,
    a.text,
    sameText ? a.text : (b?.text ?? MISSING),
  );
  recordIfAny(
    ctx,
    'text',
    'field.mergeField',
    where,
    nonEmptyList(a.fields),
    nonEmptyList(b?.fields),
    present,
  );
  ctx.tally.record(
    'paragraph-style',
    'paragraph.style',
    where,
    fmt(a.props.styleId),
    b ? fmt(b.props.styleId) : MISSING,
  );
  recordIfAny(
    ctx,
    'paragraph-style',
    'paragraph.headingLevel',
    where,
    a.props.headingLevel,
    b?.props.headingLevel,
    present,
  );
  for (const key of PARAGRAPH_FORMAT_KEYS) {
    recordIfAny(
      ctx,
      'paragraph-format',
      `paragraph.${key}`,
      where,
      effectiveParagraphValue(key, a.props[key]),
      b ? effectiveParagraphValue(key, b.props[key]) : undefined,
      present,
    );
  }
  recordIfAny(
    ctx,
    'paragraph-format',
    'paragraph.pageBreakAfter',
    where,
    a.pageBreakAfter,
    b?.pageBreakAfter,
    present,
  );
  if (!ctx.ignoreRevisionIds) {
    ctx.tally.record(
      'paragraph-format',
      'paragraph.revisionIds',
      where,
      a.revisionIds,
      b?.revisionIds ?? MISSING,
    );
  }
  const numbering = a.props.numbering;
  const other = b?.props.numbering;
  if (numbering || other) {
    recordIfAny(ctx, 'list', 'list.numId', where, numbering?.numId, other?.numId, present);
    recordIfAny(ctx, 'list', 'list.level', where, numbering?.level, other?.level, present);
    recordIfAny(ctx, 'list', 'list.format', where, a.listFormat, b?.listFormat, present);
  }
  compareRuns(a.runs, b?.runs ?? [], where, ctx);
  compareImages(a, b, where, ctx);
  compareNotes(a, b, where, ctx);
}

/** Clé d'alignement d'un bloc : son texte canonique (`{{nom}}` pour les champs de fusion). */
function blockKey(block: BlockModel): string {
  return `${block.kind}:${alignmentKey(block.placeholderText)}`;
}

/**
 * Aligne deux listes de blocs (position si même longueur, LCS sur le texte sinon) et
 * compare chaque paire ; un bloc du résultat sans vis-à-vis compte comme texte inséré.
 */
export function compareBlocks(
  original: readonly BlockModel[],
  result: readonly BlockModel[],
  prefix: string,
  ctx: CompareContext,
): void {
  const pairs = alignSequences(original.map(blockKey), result.map(blockKey));
  const labelsA = labels(original, prefix, '');
  const labelsB = labels(result, prefix, ' (résultat)');
  const inserted = (block: BlockModel, where: string): void => {
    const name = block.kind === 'paragraph' ? 'paragraph.text' : 'table.rows';
    const group = block.kind === 'paragraph' ? 'text' : 'table';
    const actual = block.kind === 'paragraph' ? block.text : String(block.rows.length);
    ctx.tally.record(group, name, where, ABSENT, actual);
  };
  for (const pair of pairs) {
    const a = pair.a === undefined ? undefined : original[pair.a];
    const b = pair.b === undefined ? undefined : result[pair.b];
    const whereB = pair.b === undefined ? '' : (labelsB[pair.b] ?? '');
    if (a) {
      const where = pair.a === undefined ? '' : (labelsA[pair.a] ?? '');
      if (a.kind === 'paragraph') {
        compareParagraph(a, b?.kind === 'paragraph' ? b : undefined, where, ctx);
      } else {
        compareTable(a, b?.kind === 'table' ? b : undefined, where, ctx, compareBlocks);
      }
      // Paragraphe face à un tableau (ou l'inverse) : le bloc du résultat est un ajout.
      if (b && b.kind !== a.kind) inserted(b, whereB);
    } else if (b) {
      inserted(b, whereB);
    }
  }
}

/** Libellés `paragraphe N` / `tableau N` de chaque bloc, numérotés par nature sur un même côté. */
function labels(blocks: readonly BlockModel[], prefix: string, suffix: string): string[] {
  const counters = { paragraph: 0, table: 0 };
  return blocks.map((block) => {
    const count = (counters[block.kind] += 1);
    const position = `${block.kind === 'paragraph' ? 'paragraphe' : 'tableau'} ${String(count)}`;
    return `${prefix ? `${prefix} ${position}` : position}${suffix}`;
  });
}

/** Texte affiché, texte canonique et format d'un en-tête ou d'un pied, en un seul bloc chacun. */
export function headerFooterSummary(part: HeaderFooterModel): {
  text: string;
  placeholderText: string;
  format: string;
} {
  const format = part.blocks.map((block) => {
    if (block.kind === 'table') {
      return { kind: 'table', rows: block.rows.length, width: block.width, borders: block.borders };
    }
    const { runDefaults: _ignored, ...paragraph } = block.props;
    return {
      kind: 'paragraph',
      ...paragraph,
      ...(block.pageBreakAfter ? { pageBreakAfter: true } : {}),
      runs: block.runs.map((run) => run.props),
    };
  });
  return {
    text: part.blocks.map((block) => block.text).join('\n'),
    placeholderText: part.blocks.map((block) => block.placeholderText).join('\n'),
    format: fmt(format),
  };
}
