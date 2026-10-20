import { allNamed, childNamed, wordAttribute } from '../preprocess/xml-utils';
import { mergeFieldName } from '../preprocess/fields';
import { toVariableName } from '../preprocess/names';
import type { ResolvedRunProps } from '../reader/types';
import { emuToPx } from '../reader/units';
import type { ImageModel, ModelContext, NoteModel, ParagraphModel, RunModel } from './model';

/**
 * Lecture d'un `w:p` en paragraphes comparables. Trois choix de modélisation, décidés en
 * L28c pour que le rapport mesure ce que Word rend et non la forme XML :
 *
 * - un `w:br w:type="page"` est une frontière de bloc, pas un caractère : « a<br>b » donne
 *   deux paragraphes « a » (avec `pageBreakAfter`) et « b », aux mêmes propriétés ;
 * - un champ `MERGEFIELD` (simple ou complexe) est modélisé par son nom et son résultat :
 *   le texte du paragraphe inclut le résultat tel que Word l'affiche (`«Nom»`), le texte
 *   canonique (`placeholderText`) et les runs portent `{{Nom}}`, de sorte qu'un `{{Nom}}`
 *   écrit en clair (représentation d'Aster en mode placeholders) vaille le champ ;
 * - les runs voisins de mêmes propriétés résolues sont fusionnés ; le run `{{nom}}` d'un
 *   champ prend les propriétés du premier run de son résultat et fusionne comme les autres.
 */

/** Champ complexe ouvert : instruction accumulée, phase résultat atteinte, champ de fusion capturé. */
interface OpenField {
  instruction: string;
  inResult: boolean;
  capturing: boolean;
}

/** Capture en cours du résultat d'un champ de fusion : bornes dans le segment courant. */
interface MergeCapture {
  readonly name: string;
  readonly runStart: number;
  readonly textStart: number;
  readonly props: ResolvedRunProps;
}

interface MutableRun {
  text: string;
  readonly props: ResolvedRunProps;
  readonly key: string;
}

/** Segment de paragraphe entre deux sauts de page. */
interface Segment {
  text: string;
  placeholderText: string;
  pageBreakAfter: boolean;
  readonly runs: MutableRun[];
  readonly images: ImageModel[];
  readonly notes: NoteModel[];
}

/** `{{nom}}`, blancs intérieurs tolérés, pour lister les champs du texte canonique. */
const PLACEHOLDER = /\{\{\s*([^{}]*?)\s*\}\}/g;

function newSegment(): Segment {
  return { text: '', placeholderText: '', pageBreakAfter: false, runs: [], images: [], notes: [] };
}

function readImage(element: Element): ImageModel | null {
  if (element.localName === 'pict') {
    return allNamed(element, 'imagedata').length > 0 ? { kind: 'pict' } : null;
  }
  if (allNamed(element, 'blip').length === 0) return null;
  const container = childNamed(element, 'anchor') ?? childNamed(element, 'inline') ?? element;
  const extent = childNamed(container, 'extent');
  const cx = Number(extent?.getAttribute('cx') ?? '');
  const cy = Number(extent?.getAttribute('cy') ?? '');
  return {
    kind: 'drawing',
    ...(cx > 0 ? { widthPx: emuToPx(cx) } : {}),
    ...(cy > 0 ? { heightPx: emuToPx(cy) } : {}),
  };
}

/** Clé de fusion de deux runs voisins : mêmes propriétés résolues. */
function runKey(props: ResolvedRunProps): string {
  return JSON.stringify(props, Object.keys(props).sort());
}

/**
 * Noms des champs de fusion d'un texte canonique, dans l'ordre (`{{a}} … {{b}}` → `[a, b]`),
 * normalisés comme les noms de variables de l'import (`Numero Facture` → `numero_facture`),
 * pour qu'un `MERGEFIELD` et le `{{nom}}` qu'Aster en écrit portent le même nom.
 */
export function placeholderNames(placeholderText: string): string[] {
  const names: string[] = [];
  for (const match of placeholderText.matchAll(PLACEHOLDER)) {
    const raw = match[1] ?? '';
    if (raw === '') continue;
    names.push(toVariableName(raw) ?? raw);
  }
  return names;
}

/** Vrai pour un segment sans contenu visible (texte, image, note). */
function isEmpty(segment: Segment): boolean {
  return segment.text === '' && segment.images.length === 0 && segment.notes.length === 0;
}

/**
 * Lit un `w:p` : un paragraphe par segment séparé par un saut de page explicite. Le dernier
 * segment, vide, est omis (« a<br page> » : Word ne rend rien après le saut) ; un paragraphe
 * réduit à un saut donne un segment vide marqué `pageBreakAfter`, que `readBlocks` replie
 * sur le paragraphe précédent.
 */
export function readParagraphs(p: Element, ctx: ModelContext): ParagraphModel[] {
  const pPr = childNamed(p, 'pPr');
  const props = ctx.styles.paragraph(pPr);
  const segments: Segment[] = [];
  let current = newSegment();
  const openFields: OpenField[] = [];
  let capture: MergeCapture | undefined;
  /** Vrai quand le prochain texte ne doit pas fusionner avec le run précédent (borne de champ). */
  let breakRun = false;
  const inInstruction = (): boolean => openFields.some((field) => !field.inResult);

  const pushText = (runProps: ResolvedRunProps, text: string): void => {
    if (text === '' || inInstruction()) return;
    current.text += text;
    if (!capture) current.placeholderText += text;
    const key = runKey(runProps);
    const last = current.runs[current.runs.length - 1];
    if (last && last.key === key && !breakRun) last.text += text;
    else current.runs.push({ text, props: runProps, key });
    breakRun = false;
  };

  const startCapture = (name: string, runProps: ResolvedRunProps): void => {
    capture = {
      name,
      runStart: current.runs.length,
      textStart: current.text.length,
      props: runProps,
    };
    breakRun = true;
  };

  /**
   * Clôt la capture : les runs du résultat deviennent un run `{{nom}}` aux propriétés du
   * premier, fusionné avec ses voisins comme n'importe quel texte, pour que le `{{nom}}`
   * écrit en clair par Aster donne les mêmes runs.
   */
  const endCapture = (): void => {
    if (!capture) return;
    const first = current.runs[capture.runStart];
    const runProps = first?.props ?? capture.props;
    current.runs.splice(capture.runStart);
    const placeholder = `{{${capture.name}}}`;
    const key = runKey(runProps);
    const last = current.runs[current.runs.length - 1];
    if (last && last.key === key) last.text += placeholder;
    else current.runs.push({ text: placeholder, props: runProps, key });
    current.placeholderText += placeholder;
    capture = undefined;
    breakRun = false;
  };

  const pageBreak = (): void => {
    current.pageBreakAfter = true;
    segments.push(current);
    current = newSegment();
    breakRun = false;
  };

  const readFieldChar = (child: Element, runProps: ResolvedRunProps): void => {
    const type = wordAttribute(child, 'fldCharType');
    const top = openFields[openFields.length - 1];
    if (type === 'begin') {
      openFields.push({ instruction: '', inResult: false, capturing: false });
    } else if (type === 'separate' && top) {
      top.inResult = true;
      const name = mergeFieldName(top.instruction);
      if (name !== null && !capture) {
        top.capturing = true;
        startCapture(name, runProps);
      }
    } else if (type === 'end' && top) {
      openFields.pop();
      if (top.capturing) {
        endCapture();
      } else if (!top.inResult) {
        // Champ sans `separate` (jamais mis à jour) : Word n'affiche rien, le nom compte.
        const name = mergeFieldName(top.instruction);
        if (name !== null && !capture) {
          startCapture(name, runProps);
          endCapture();
        }
      }
    }
  };

  const readRun = (run: Element): void => {
    const resolved = ctx.styles.run(childNamed(run, 'rPr'), props);
    for (const child of Array.from(run.children)) {
      switch (child.localName) {
        case 't':
          pushText(resolved, child.textContent ?? '');
          break;
        case 'instrText': {
          const top = openFields[openFields.length - 1];
          if (top && !top.inResult) top.instruction += child.textContent ?? '';
          break;
        }
        case 'tab':
        case 'ptab':
          pushText(resolved, '\t');
          break;
        case 'br':
          if (wordAttribute(child, 'type') === 'page' && !capture && !inInstruction()) pageBreak();
          else pushText(resolved, '\n');
          break;
        case 'cr':
          pushText(resolved, '\n');
          break;
        case 'noBreakHyphen':
          pushText(resolved, String.fromCharCode(0x2011));
          break;
        case 'softHyphen':
          pushText(resolved, String.fromCharCode(0xad));
          break;
        case 'sym': {
          const code = Number.parseInt(wordAttribute(child, 'char'), 16);
          if (Number.isFinite(code)) pushText(resolved, String.fromCodePoint(code));
          break;
        }
        case 'fldChar':
          readFieldChar(child, resolved);
          break;
        case 'drawing':
        case 'pict': {
          const image = inInstruction() ? null : readImage(child);
          if (image) current.images.push(image);
          break;
        }
        case 'footnoteReference':
        case 'endnoteReference': {
          const kind = child.localName === 'footnoteReference' ? 'footnote' : 'endnote';
          const id = wordAttribute(child, 'id');
          if (id && !inInstruction()) {
            current.notes.push({ kind, text: ctx.notes.get(`${kind}:${id}`) ?? '' });
          }
          break;
        }
        default:
          break;
      }
    }
  };

  const walk = (parent: Element): void => {
    for (const child of Array.from(parent.children)) {
      switch (child.localName) {
        case 'r':
          readRun(child);
          break;
        case 'del':
        case 'moveFrom':
        case 'pPr':
        case 'bookmarkStart':
        case 'bookmarkEnd':
        case 'proofErr':
        case 'commentRangeStart':
        case 'commentRangeEnd':
          break;
        case 'sdt': {
          const content = childNamed(child, 'sdtContent');
          if (content) walk(content);
          break;
        }
        case 'fldSimple': {
          const name = mergeFieldName(wordAttribute(child, 'instr'));
          if (name !== null && !capture && !inInstruction()) {
            startCapture(name, ctx.styles.run(null, props));
            walk(child);
            endCapture();
          } else {
            walk(child);
          }
          break;
        }
        default:
          // `w:hyperlink`, `w:ins`, `w:smartTag`… : conteneurs traversés.
          walk(child);
      }
    }
  };
  walk(p);
  segments.push(current);
  if (segments.length > 1 && !current.pageBreakAfter && isEmpty(current)) segments.pop();

  const numbering = props.numbering;
  const level = numbering
    ? ctx.numbering.definition(numbering.numId)?.levels.find((l) => l.level === numbering.level)
    : undefined;
  const revisionIds = Array.from(p.attributes)
    .filter((attr) => attr.localName.startsWith('rsid'))
    .map((attr) => `${attr.localName}=${attr.value}`)
    .sort()
    .join(' ');

  return segments.map((segment) => ({
    kind: 'paragraph',
    text: segment.text,
    placeholderText: segment.placeholderText,
    fields: placeholderNames(segment.placeholderText),
    props,
    ...(level ? { listFormat: `${level.format}|${level.text}|${String(level.start)}` } : {}),
    ...(segment.pageBreakAfter ? { pageBreakAfter: true as const } : {}),
    runs: segment.runs.map(({ text, props: runProps }): RunModel => ({ text, props: runProps })),
    images: segment.images,
    notes: segment.notes,
    revisionIds,
  }));
}

/** Vrai pour un paragraphe sans contenu visible : seul un saut de page le justifie. */
export function isBlankParagraph(paragraph: ParagraphModel): boolean {
  return (
    paragraph.text === '' &&
    paragraph.images.length === 0 &&
    paragraph.notes.length === 0 &&
    paragraph.fields.length === 0
  );
}
