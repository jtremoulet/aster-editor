import type { TabAlign, TabLeader } from '@aster-editor/core';
import type { ImageRun } from 'docx';
import { warn, type ExportContext } from './context.js';
import { parsePoints, pointsToTwips } from './css.js';
import type { InlineState } from './inline-state.js';
import { resolvedValue, splitVariables } from './variables.js';

/**
 * Morceaux inline (`Piece`) accumulés pendant la descente : texte, sauts, images,
 * champs de fusion, tabulations et appels de note, avec les règles d'émission de chacun.
 * Module de `inline.ts` (ré-exporté par lui) : découpage L45 ; taquets avec alignement et
 * points de suite, position plafonnée (F43).
 */

export type Piece =
  /**
   * Texte ; `preserved` pour une valeur de variable résolue, dont les blancs ne suivent
   * pas les règles du HTML : ils sont écrits tels quels.
   */
  | {
      readonly kind: 'text';
      readonly text: string;
      readonly state: InlineState;
      readonly preserved?: boolean;
    }
  /** Saut de ligne ; `preserved` quand il vient d'un `\n` d'une valeur de variable. */
  | { readonly kind: 'break'; readonly state: InlineState; readonly preserved?: boolean }
  | { readonly kind: 'image'; readonly run: ImageRun; readonly state: InlineState }
  /** Champ de fusion Word (mode `fields`). */
  | { readonly kind: 'field'; readonly name: string; readonly state: InlineState }
  /** Tabulation (`<span data-tab>`, ou l'espace cadratin de la 0.5) : `w:tab`. */
  | { readonly kind: 'tab'; readonly state: InlineState }
  /** Appel de note de bas de page, `id` Word déjà attribué. */
  | { readonly kind: 'footnote'; readonly id: number; readonly state: InlineState };

/** Attribut d'un `<sup>` qui porte un appel de note explicite. */
const FOOTNOTE_REF_ATTRIBUTE = 'data-footnote-ref';

/** Position du taquet (points) d'un nœud inline de tabulation du contrat (`TabAttrs.stopPt`). */
const TAB_STOP_ATTRIBUTE = 'data-stop';

/** Alignement du taquet (`TabAttrs.align`), `left` quand absent. */
const TAB_ALIGN_ATTRIBUTE = 'data-align';

/** Points de suite du taquet (`TabAttrs.leader`), aucun quand absent. */
const TAB_LEADER_ATTRIBUTE = 'data-leader';

/**
 * Position maximale d'un taquet dans Word : 22 pouces (31 680 twips). Au-delà, Word
 * refuse la valeur dans son interface, et un `w:pos` hors `xsd:int` rend le fichier
 * illisible (R43-02) : la position est ramenée à ce plafond.
 */
export const MAX_TAB_STOP_TWIPS = 31_680;

/** Espace cadratin par lequel le lecteur de la 0.5 représentait `w:tab` : toujours accepté. */
const EM_SPACE = String.fromCharCode(0x2003);

/** Un taquet déclaré par une tabulation du paragraphe : position en twips, alignement, points de suite. */
export interface TabStop {
  readonly position: number;
  readonly align: TabAlign;
  readonly leader: TabLeader | undefined;
}

/**
 * Ce que la conversion inline remonte au paragraphe : les taquets déclarés par ses
 * tabulations (`data-stop`, `data-align`, `data-leader`), écrits en `w:tabs` sur le
 * paragraphe, dédoublonnés par position et alignement (clé `position:align`, le premier
 * déclaré gagne).
 */
export interface InlineCollector {
  readonly tabStops: Map<string, TabStop>;
}

/** `data-align` → alignement du contrat, `left` pour toute autre valeur. */
function tabAlignOf(value: string | null): TabAlign {
  switch (value?.trim().toLowerCase()) {
    case 'center':
      return 'center';
    case 'right':
      return 'right';
    case 'decimal':
      return 'decimal';
    default:
      return 'left';
  }
}

/** `data-leader` → points de suite du contrat, `undefined` pour toute autre valeur. */
function tabLeaderOf(value: string | null): TabLeader | undefined {
  switch (value?.trim().toLowerCase()) {
    case 'dot':
      return 'dot';
    case 'hyphen':
      return 'hyphen';
    case 'underscore':
      return 'underscore';
    default:
      return undefined;
  }
}

/** Texte d'un appel de note tel que l'import le produit : `[1]`. */
const FOOTNOTE_CALL_TEXT = /^\[(\d+)\]$/;

/** Options de descente : où l'on est, pour ce que Word y accepte. */
export interface CollectOptions {
  /** Faux dans un en-tête, un pied ou une note : Word y refuse les appels de note. */
  readonly notesAllowed: boolean;
  /** Collecteur du paragraphe (taquets), absent quand l'appelant n'en veut pas. */
  readonly collector?: InlineCollector;
}

/** Ajoute un saut de ligne sauf en tête de paragraphe ou juste après un autre saut. */
export function pushBreak(pieces: Piece[], state: InlineState): void {
  const last = pieces[pieces.length - 1];
  if (last && last.kind !== 'break') pieces.push({ kind: 'break', state });
}

/**
 * Valeur résolue d'une variable : une ligne par morceau texte, séparées par des sauts
 * de ligne, tous `preserved` pour que `collapseWhitespace` n'y touche pas. Une valeur
 * est de la donnée, pas du HTML : `"a\nb"` donne deux lignes, `"a  b"` garde ses deux espaces.
 */
function pushResolvedValue(value: string, state: InlineState, pieces: Piece[]): void {
  value.split(/\r?\n/).forEach((line, index) => {
    if (index > 0) pieces.push({ kind: 'break', state, preserved: true });
    if (line !== '') pieces.push({ kind: 'text', text: line, state, preserved: true });
  });
}

/**
 * Morceaux d'une variable selon le mode : en `fields` un champ de fusion, en `resolve`
 * sa valeur (ou `{{nom}}`), en `placeholders` le texte d'origine.
 */
export function pushVariable(
  name: string,
  raw: string,
  state: InlineState,
  ctx: ExportContext,
  pieces: Piece[],
): void {
  switch (ctx.variables.mode) {
    case 'fields':
      pieces.push({ kind: 'field', name, state });
      return;
    case 'resolve': {
      const value = resolvedValue(name, ctx);
      if (value === undefined) pieces.push({ kind: 'text', text: raw, state });
      else pushResolvedValue(value, state, pieces);
      return;
    }
    default:
      pieces.push({ kind: 'text', text: raw, state });
  }
}

/**
 * Texte brut : découpé sur le motif des variables en modes `fields`/`resolve`, sauf
 * dans une marque de code, où `{{…}}` est du contenu. Un espace cadratin (tabulation de
 * la 0.5) devient une tabulation.
 */
export function pushText(
  text: string,
  state: InlineState,
  ctx: ExportContext,
  pieces: Piece[],
): void {
  if (text === '') return;
  if (text.includes(EM_SPACE)) {
    text.split(EM_SPACE).forEach((part, index) => {
      if (index > 0) pieces.push({ kind: 'tab', state });
      pushText(part, state, ctx, pieces);
    });
    return;
  }
  if (state.code) {
    pieces.push({ kind: 'text', text, state });
    return;
  }
  for (const segment of splitVariables(text, ctx.variables)) {
    if (segment.kind === 'text') pieces.push({ kind: 'text', text: segment.text, state });
    else pushVariable(segment.name, segment.raw, state, ctx, pieces);
  }
}

/**
 * `<span data-tab data-stop="36pt" data-align="center" data-leader="dot">` : une
 * tabulation, dont le taquet (s'il est connu) est remonté au paragraphe avec son
 * alignement et ses points de suite. Une position au-delà de `MAX_TAB_STOP_TWIPS` est
 * ramenée au plafond avec avertissement. Le contenu du nœud (vide par contrat) est ignoré.
 */
export function pushTab(
  element: Element,
  state: InlineState,
  ctx: ExportContext,
  options: CollectOptions,
  pieces: Piece[],
): void {
  const stop = parsePoints(element.getAttribute(TAB_STOP_ATTRIBUTE));
  if (stop !== null && stop > 0 && options.collector) {
    let position = pointsToTwips(stop);
    if (position > MAX_TAB_STOP_TWIPS) {
      warn(
        ctx,
        'page-margins-clamped',
        `Taquet à ${String(stop)} pt au-delà de 22 pouces, ramené au plafond de Word`,
      );
      position = MAX_TAB_STOP_TWIPS;
    }
    const align = tabAlignOf(element.getAttribute(TAB_ALIGN_ATTRIBUTE));
    const key = `${String(position)}:${align}`;
    if (!options.collector.tabStops.has(key)) {
      options.collector.tabStops.set(key, {
        position,
        align,
        leader: tabLeaderOf(element.getAttribute(TAB_LEADER_ATTRIBUTE)),
      });
    }
  }
  pieces.push({ kind: 'tab', state });
}

/**
 * Clé de note d'un `<sup>` : `data-footnote-ref="1"` explicite, ou texte `[1]` tel que
 * l'import le produit. `null` si le `<sup>` est un exposant ordinaire.
 */
function footnoteKey(element: Element): { key: string; explicit: boolean } | null {
  const explicit = element.getAttribute(FOOTNOTE_REF_ATTRIBUTE);
  if (explicit !== null && explicit.trim() !== '') return { key: explicit.trim(), explicit: true };
  const call = FOOTNOTE_CALL_TEXT.exec((element.textContent ?? '').trim());
  return call?.[1] ? { key: call[1], explicit: false } : null;
}

/**
 * Appel de note d'un `<sup>` : `true` si un morceau a été émis. Une vraie référence
 * quand la note existe, que l'endroit l'autorise et qu'elle n'a pas déjà été appelée ;
 * sinon un exposant `[n]` avec l'avertissement qui explique le repli. Un `<sup>` qui
 * n'est pas un appel (ou un appel implicite `[n]` sans note) rend `false` : son
 * contenu est converti comme tout exposant.
 */
export function pushFootnoteCall(
  element: Element,
  state: InlineState,
  ctx: ExportContext,
  options: CollectOptions,
  pieces: Piece[],
): boolean {
  const call = footnoteKey(element);
  if (!call) return false;
  const note = ctx.footnotes.get(call.key);
  if (!note) {
    if (call.explicit) {
      warn(ctx, 'footnote-missing', `Appel de note ${call.key} sans note, laissé en exposant`);
    }
    return false;
  }
  const fallback: Piece = {
    kind: 'text',
    text: `[${call.key}]`,
    state: { ...state, superScript: true, subScript: false },
  };
  if (!options.notesAllowed) {
    warn(
      ctx,
      'footnote-not-allowed',
      `Appel de note ${call.key} dans un en-tête, un pied ou une note : Word l'y refuse, laissé en exposant`,
    );
    pieces.push(fallback);
    return true;
  }
  if (ctx.footnoteCalls.has(call.key)) {
    warn(
      ctx,
      'footnote-duplicate',
      `Second appel de la note ${call.key} : Word n'en accepte qu'un, laissé en exposant`,
    );
    pieces.push(fallback);
    return true;
  }
  ctx.footnoteCalls.add(call.key);
  pieces.push({ kind: 'footnote', id: note.id, state });
  return true;
}
