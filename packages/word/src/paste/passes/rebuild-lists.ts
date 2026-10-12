import { getStyleProperty, isBlank, selectAll, unwrap } from '../dom-utils';
import type { ListLevelFormat, PastePass, ResolvedPasteOptions } from '../types';

/** Déclaration `@list l0:level1 { mso-level-number-format:bullet; … }` dans le `<style>`. */
const LIST_DECLARATION = /@list\s+(l\d+):level(\d+)\s*\{([^}]*)\}/gi;

/** Valeur de `mso-list:l0 level1 lfo1` sur un paragraphe de liste. */
const MSO_LIST_VALUE = /\b(l\d+)\s+level(\d+)(?:\s+lfo(\d+))?/i;

/** Marqueur numéroté : `1.`, `a)`, `(b)`, `iv.`, `A.`. Tout le reste est une puce. */
const NUMBERED_MARKER = /^\(?([0-9]+|[a-z]+|[A-Z]+)[.)]$/;

/** Attribut `type` HTML équivalent à chaque format Word non décimal. */
const OL_TYPE: Readonly<Partial<Record<ListLevelFormat, string>>> = {
  'alpha-lower': 'a',
  'alpha-upper': 'A',
  'roman-lower': 'i',
  'roman-upper': 'I',
};

interface ListParagraphInfo {
  readonly listId: string;
  readonly level: number;
  /** Instance de liste (`lfoN`). Deux instances d'une même définition sont deux listes. */
  readonly instanceId: string;
  readonly marker: string;
}

interface OpenList {
  readonly element: Element;
  readonly level: number;
  readonly tag: 'ul' | 'ol';
}

/**
 * Extrait les formats de numérotation déclarés dans le `<style>` Word. On lit le texte
 * brut, car le `<style>` est dans le `<head>` et disparaît quand on ne garde que le
 * fragment. L'absence de `mso-level-number-format` dans une déclaration signifie
 * « décimal » : c'est la valeur par défaut que Word omet.
 */
export function parseListFormats(html: string): Map<string, ListLevelFormat> {
  const formats = new Map<string, ListLevelFormat>();
  for (const match of html.matchAll(LIST_DECLARATION)) {
    const [, listId = '', level = '', body = ''] = match;
    const format = /mso-level-number-format\s*:\s*([a-z-]+)/i.exec(body)?.[1]?.toLowerCase();
    formats.set(`${listId.toLowerCase()}:level${level}`, toListLevelFormat(format));
  }
  return formats;
}

function toListLevelFormat(format: string | undefined): ListLevelFormat {
  switch (format) {
    case 'bullet':
    case 'image':
      return 'bullet';
    case 'alpha-lower':
    case 'alpha-upper':
    case 'roman-lower':
    case 'roman-upper':
      return format;
    default:
      return 'decimal';
  }
}

/** Lit `mso-list:lX levelN lfoM` sur un paragraphe, `undefined` s'il n'est pas un item de liste. */
function readListParagraph(element: Element): Omit<ListParagraphInfo, 'marker'> | undefined {
  const value = getStyleProperty(element, 'mso-list');
  if (!value || /^ignore$/i.test(value)) {
    return undefined;
  }
  const match = MSO_LIST_VALUE.exec(value);
  if (!match) {
    return undefined;
  }
  const listId = (match[1] ?? '').toLowerCase();
  const level = Math.max(1, Number.parseInt(match[2] ?? '1', 10));
  const instanceId = match[3] ? `lfo${match[3]}` : listId;
  return { listId, level, instanceId };
}

/**
 * Retire le marqueur `<span style="mso-list:Ignore">·  </span>` et renvoie son texte.
 * Les spans parents devenus vides (police Symbol, etc.) sont retirés avec lui.
 */
function extractMarker(paragraph: Element): string {
  const ignore = selectAll(paragraph, 'span[style]').find((span) =>
    /^ignore$/i.test(getStyleProperty(span, 'mso-list') ?? ''),
  );
  if (!ignore) {
    return '';
  }
  const marker = (ignore.textContent ?? '').replace(/[\s\u00a0]+/g, ' ').trim();
  let parent = ignore.parentElement;
  ignore.parentNode?.removeChild(ignore);
  while (
    parent &&
    parent !== paragraph &&
    parent.localName === 'span' &&
    isBlank(parent.textContent)
  ) {
    const next = parent.parentElement;
    unwrap(parent);
    parent = next;
  }
  return marker;
}

/** Détermine puce vs numéro depuis la feuille de style, sinon depuis le texte du marqueur. */
function resolveFormat(info: ListParagraphInfo, options: ResolvedPasteOptions): ListLevelFormat {
  const declared = options.listFormats.get(`${info.listId}:level${info.level}`);
  if (declared) {
    return declared;
  }
  const match = NUMBERED_MARKER.exec(info.marker);
  if (!match) {
    return 'bullet';
  }
  const token = match[1] ?? '';
  if (/^[0-9]+$/.test(token)) {
    return 'decimal';
  }
  if (/^[ivxlcdm]+$/.test(token)) {
    return 'roman-lower';
  }
  if (/^[IVXLCDM]+$/.test(token)) {
    return 'roman-upper';
  }
  return /^[a-z]+$/.test(token) ? 'alpha-lower' : 'alpha-upper';
}

/** Numéro de départ lu dans un marqueur décimal (`3.` → 3), `undefined` sinon. */
function readStart(marker: string): number | undefined {
  const match = /^\(?([0-9]+)[.)]$/.exec(marker);
  const start = match ? Number.parseInt(match[1] ?? '', 10) : Number.NaN;
  return Number.isFinite(start) && start > 1 ? start : undefined;
}

function createList(doc: Document, format: ListLevelFormat, marker: string): OpenList['element'] {
  if (format === 'bullet') {
    return doc.createElement('ul');
  }
  const list = doc.createElement('ol');
  const type = OL_TYPE[format];
  if (type) {
    list.setAttribute('type', type);
  }
  const start = readStart(marker);
  if (start !== undefined) {
    list.setAttribute('start', String(start));
  }
  return list;
}

/**
 * Reconstruit les `<ul>`/`<ol>` d'un conteneur à partir de ses paragraphes `mso-list`.
 * Une pile de listes ouvertes suit le niveau courant :
 * - niveau plus profond → nouvelle liste dans le dernier `<li>` (les sauts de niveau
 *   n'inventent pas de niveau intermédiaire) ;
 * - niveau moins profond → on dépile ;
 * - autre instance (`lfo`) ou autre type au même niveau → nouvelle liste sœur ;
 * - paragraphe normal → la liste est close, la suivante repart de zéro.
 */
function rebuildListsIn(doc: Document, container: Element, options: ResolvedPasteOptions): void {
  let stack: OpenList[] = [];
  let currentInstance: string | undefined;

  for (const child of Array.from(container.children)) {
    const partial = child.localName === 'p' ? readListParagraph(child) : undefined;
    if (!partial) {
      stack = [];
      currentInstance = undefined;
      continue;
    }
    const info: ListParagraphInfo = { ...partial, marker: extractMarker(child) };
    const format = resolveFormat(info, options);
    const tag: 'ul' | 'ol' = format === 'bullet' ? 'ul' : 'ol';

    if (currentInstance !== info.instanceId) {
      stack = [];
      currentInstance = info.instanceId;
    }
    while ((stack.at(-1)?.level ?? 0) > info.level) {
      stack.pop();
    }
    const top = stack.at(-1);
    if (top && top.level === info.level && top.tag !== tag) {
      stack.pop();
    }

    let target = stack.at(-1);
    if (!target || target.level < info.level) {
      const list = createList(doc, format, info.marker);
      if (target) {
        const lastItem = target.element.lastElementChild ?? target.element;
        lastItem.appendChild(list);
      } else {
        container.insertBefore(list, child);
      }
      target = { element: list, level: info.level, tag };
      stack.push(target);
    }

    const item = doc.createElement('li');
    target.element.appendChild(item);
    item.appendChild(child);
    child.removeAttribute('class');
    stripListStyle(child);
  }
}

/** Retire `mso-list` et l'indentation du paragraphe devenu item, le reste part plus tard. */
function stripListStyle(paragraph: Element): void {
  const style = paragraph.getAttribute('style');
  if (!style) {
    return;
  }
  const kept = style
    .split(';')
    .filter((chunk) => !/^\s*(mso-list|text-indent|margin-left)\s*:/i.test(chunk))
    .join(';');
  if (kept.trim()) {
    paragraph.setAttribute('style', kept);
  } else {
    paragraph.removeAttribute('style');
  }
}

/**
 * Passe principale : transforme les paragraphes `mso-list` de Word en listes imbriquées.
 * Word ne colle jamais de `<ul>`, seulement des `<p class="MsoListParagraph">` plats
 * dont le niveau est codé dans `mso-list:lX levelN lfoM` et la puce dans un span
 * `mso-list:Ignore`. On traite chaque conteneur (corps, cellule) indépendamment.
 */
export const rebuildLists: PastePass = (doc, options) => {
  const containers = new Set<Element>();
  for (const paragraph of selectAll(doc.body, 'p[style*="mso-list"]')) {
    if (paragraph.parentElement && readListParagraph(paragraph)) {
      containers.add(paragraph.parentElement);
    }
  }
  for (const container of containers) {
    rebuildListsIn(doc, container, options);
  }
  // Marqueurs orphelins (listes déjà en <ul> par Word, ou paragraphes hors conteneur).
  for (const span of selectAll(doc.body, 'span[style*="mso-list"]')) {
    if (/^ignore$/i.test(getStyleProperty(span, 'mso-list') ?? '')) {
      span.parentNode?.removeChild(span);
    }
  }
};
