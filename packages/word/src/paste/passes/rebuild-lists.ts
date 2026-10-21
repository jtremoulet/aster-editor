import { getStyleProperty, isBlank, selectAll, unwrap } from '../dom-utils.js';
import type {
  ListLevelDeclaration,
  ListLevelFormat,
  PastePass,
  ResolvedPasteOptions,
} from '../types.js';

/**
 * Déclaration `@list l0:level1 { … }` ou override d'instance `@list l0:level1 lfo2 { … }`
 * dans le `<style>`. Le corps exclut `{` : avec `[^}]*`, une accolade jamais fermée
 * faisait rebalayer tout le reste du fichier à chaque déclaration (ReDoS, W-2).
 */
const LIST_DECLARATION = /@list\s+(l\d+):level(\d+)(?:\s+(lfo\d+))?\s*\{([^{}]*)\}/gi;

/** Valeur de `mso-list:l0 level1 lfo1` sur un paragraphe de liste. */
const MSO_LIST_VALUE = /\b(l\d+)\s+level(\d+)(?:\s+lfo(\d+))?/i;

/** Marqueur multi-niveaux `1.1.` ou `2.3` (numérotation juridique) : toujours décimal. */
const LEGAL_MARKER = /^([0-9]+(?:\.[0-9]+)+)\.?$/;

/** Marqueur simple : `1.`, `a)`, `(b)`, `iv.`, `A.`. Tout le reste est une puce. */
const SIMPLE_MARKER = /^\(?([0-9]+|[a-z]+|[A-Z]+)[.)]$/;

/** Nombre romain bien formé (1 à 3999), quelle que soit la casse. */
const ROMAN_NUMERAL = /^(?=[ivxlcdm])m{0,3}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/i;

/**
 * Lettre qui suit `i`, `v` et `x` dans l'alphabet. Une de ces lettres isolée est ambiguë :
 * si le marqueur suivant au même niveau est son successeur alphabétique, c'est de l'alpha.
 */
const ALPHA_SUCCESSOR: Readonly<Record<string, string>> = { i: 'j', v: 'w', x: 'y' };

const ROMAN_VALUES: Readonly<Record<string, number>> = {
  i: 1,
  v: 5,
  x: 10,
  l: 50,
  c: 100,
  d: 500,
  m: 1000,
};

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
  /** Instance `lfoN` si le paragraphe la précise, sinon `undefined`. */
  readonly lfo: string | undefined;
  /** Instance de liste (`lfoN`, ou l'identifiant de définition à défaut). Deux instances d'une même définition sont deux listes. */
  readonly instanceId: string;
  readonly marker: string;
}

/** Format et numéro de départ résolus pour un item. `start` vaut `undefined` quand il est inconnu. */
interface ListLevelReading {
  readonly format: ListLevelFormat;
  readonly start: number | undefined;
}

interface OpenList {
  readonly element: Element;
  readonly level: number;
  readonly tag: 'ul' | 'ol';
}

/** Paragraphe du conteneur, avec ses informations de liste s'il en est un item. */
interface ListEntry {
  readonly child: Element;
  readonly info: ListParagraphInfo | undefined;
}

/**
 * Extrait les formats de numérotation déclarés dans le `<style>` Word. On lit le texte
 * brut, car le `<style>` est dans le `<head>` et disparaît quand on ne garde que le
 * fragment. L'absence de `mso-level-number-format` dans une déclaration de base signifie
 * « décimal » : c'est la valeur par défaut que Word omet.
 *
 * Les overrides d'instance (`@list l0:level1 lfo2 {…}`) sont indexés `lfo2:l0:level1`
 * et priment sur la base `l0:level1` ; ils héritent du format de base quand ils ne le
 * redéclarent pas. `mso-level-start-at` alimente `start`.
 */
export function parseListFormats(html: string): Map<string, ListLevelDeclaration> {
  const formats = new Map<string, ListLevelDeclaration>();
  for (const match of html.matchAll(LIST_DECLARATION)) {
    const [, listId = '', level = '', lfo, body = ''] = match;
    const baseKey = `${listId.toLowerCase()}:level${level}`;
    const declaredFormat = /mso-level-number-format\s*:\s*([a-z-]+)/i
      .exec(body)?.[1]
      ?.toLowerCase();
    const startAt = /mso-level-start-at\s*:\s*(\d+)/i.exec(body)?.[1];
    const start = startAt === undefined ? undefined : Number.parseInt(startAt, 10);
    if (lfo === undefined) {
      formats.set(baseKey, { format: toListLevelFormat(declaredFormat), start });
      continue;
    }
    const base = formats.get(baseKey);
    formats.set(`${lfo.toLowerCase()}:${baseKey}`, {
      format:
        declaredFormat === undefined
          ? (base?.format ?? 'decimal')
          : toListLevelFormat(declaredFormat),
      start: start ?? base?.start,
    });
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
  const lfo = match[3] ? `lfo${match[3]}` : undefined;
  return { listId, level, lfo, instanceId: lfo ?? listId };
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

/** Partie numérotante du marqueur (`3`, `1.2`, `c`, `iv`), `undefined` pour une puce. */
function markerToken(marker: string): string | undefined {
  return LEGAL_MARKER.exec(marker)?.[1] ?? SIMPLE_MARKER.exec(marker)?.[1];
}

/** Valeur d'un nombre romain déjà validé par `ROMAN_NUMERAL`. */
function romanValue(token: string): number {
  const letters = token.toLowerCase();
  let total = 0;
  for (let index = 0; index < letters.length; index += 1) {
    const value = ROMAN_VALUES[letters[index] ?? ''] ?? 0;
    const next = ROMAN_VALUES[letters[index + 1] ?? ''] ?? 0;
    total += value < next ? -value : value;
  }
  return total;
}

/** Rang d'un marqueur alphabétique : `a` → 1, `z` → 26, puis Word double la lettre (`aa` → 27). */
function alphaValue(token: string): number {
  const first = token.toLowerCase().charCodeAt(0) - 96;
  return (token.length - 1) * 26 + first;
}

/**
 * Vrai si un marqueur composé de lettres romaines est bien un nombre romain. Sans feuille
 * de style, `c.`, `d.`, `l.`, `m.` isolés sont des lettres (W-7) ; `i.`, `v.`, `x.` isolés
 * ne sont romains que si le marqueur suivant au même niveau n'est pas `j.`, `w.`, `y.`.
 */
function isRomanMarker(token: string, nextToken: string | undefined): boolean {
  if (!ROMAN_NUMERAL.test(token)) {
    return false;
  }
  if (token.length >= 2) {
    return true;
  }
  const successor = ALPHA_SUCCESSOR[token.toLowerCase()];
  if (successor === undefined) {
    return false;
  }
  return nextToken?.toLowerCase() !== successor;
}

/** Numéro de départ d'un marqueur décimal, dernier segment pour `1.3.` → 3. */
function decimalValue(token: string): number {
  return Number.parseInt(token.split('.').at(-1) ?? token, 10);
}

/** Format et départ déduits du seul texte du marqueur, faute de feuille de style. */
function readMarker(marker: string, nextMarker: string | undefined): ListLevelReading {
  const token = markerToken(marker);
  if (token === undefined) {
    return { format: 'bullet', start: undefined };
  }
  if (/^[0-9.]+$/.test(token)) {
    return { format: 'decimal', start: decimalValue(token) };
  }
  const upper = token === token.toUpperCase();
  const nextToken = nextMarker === undefined ? undefined : markerToken(nextMarker);
  if (isRomanMarker(token, nextToken)) {
    return { format: upper ? 'roman-upper' : 'roman-lower', start: romanValue(token) };
  }
  return { format: upper ? 'alpha-upper' : 'alpha-lower', start: alphaValue(token) };
}

/**
 * Numéro de départ lu dans le marqueur selon un format imposé par la feuille de style,
 * `undefined` si le marqueur ne correspond pas à ce format.
 */
function markerStartFor(marker: string, format: ListLevelFormat): number | undefined {
  const token = markerToken(marker);
  if (token === undefined) {
    return undefined;
  }
  switch (format) {
    case 'decimal':
      return /^[0-9.]+$/.test(token) ? decimalValue(token) : undefined;
    case 'alpha-lower':
    case 'alpha-upper':
      return /^[a-z]+$/i.test(token) ? alphaValue(token) : undefined;
    case 'roman-lower':
    case 'roman-upper':
      return ROMAN_NUMERAL.test(token) ? romanValue(token) : undefined;
    default:
      return undefined;
  }
}

/**
 * Détermine le format et le départ d'un item : override d'instance `lfoM:lX:levelN`,
 * puis déclaration de base `lX:levelN`, puis texte du marqueur. Le marqueur, quand il
 * se lit dans le format déclaré, donne le départ réel (un fragment peut commencer au
 * milieu d'une liste) ; sinon on prend `mso-level-start-at`.
 */
function resolveListLevel(
  info: ListParagraphInfo,
  nextMarker: string | undefined,
  options: ResolvedPasteOptions,
): ListLevelReading {
  const baseKey = `${info.listId}:level${info.level}`;
  const declared =
    (info.lfo === undefined ? undefined : options.listFormats.get(`${info.lfo}:${baseKey}`)) ??
    options.listFormats.get(baseKey);
  if (declared) {
    return {
      format: declared.format,
      start: markerStartFor(info.marker, declared.format) ?? declared.start,
    };
  }
  return readMarker(info.marker, nextMarker);
}

function createList(doc: Document, reading: ListLevelReading): OpenList['element'] {
  if (reading.format === 'bullet') {
    return doc.createElement('ul');
  }
  const list = doc.createElement('ol');
  const type = OL_TYPE[reading.format];
  if (type) {
    list.setAttribute('type', type);
  }
  if (reading.start !== undefined && Number.isFinite(reading.start) && reading.start > 1) {
    list.setAttribute('start', String(reading.start));
  }
  return list;
}

/**
 * Marqueur de l'item suivant au même niveau et dans la même instance, `undefined` si la
 * liste se termine avant (paragraphe normal, autre instance, remontée de niveau).
 */
function nextMarkerAtLevel(entries: readonly ListEntry[], index: number): string | undefined {
  const current = entries[index]?.info;
  if (!current) {
    return undefined;
  }
  for (let next = index + 1; next < entries.length; next += 1) {
    const info = entries[next]?.info;
    if (!info || info.instanceId !== current.instanceId || info.level < current.level) {
      return undefined;
    }
    if (info.level === current.level) {
      return info.marker;
    }
  }
  return undefined;
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

  // Marqueurs lus d'avance : la désambiguïsation alpha/romain regarde l'item suivant.
  const entries: ListEntry[] = Array.from(container.children).map((child) => {
    const partial = child.localName === 'p' ? readListParagraph(child) : undefined;
    return { child, info: partial ? { ...partial, marker: extractMarker(child) } : undefined };
  });

  for (const [index, { child, info }] of entries.entries()) {
    if (!info) {
      stack = [];
      currentInstance = undefined;
      continue;
    }
    const reading = resolveListLevel(info, nextMarkerAtLevel(entries, index), options);
    const tag: 'ul' | 'ol' = reading.format === 'bullet' ? 'ul' : 'ol';

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
      const list = createList(doc, reading);
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
