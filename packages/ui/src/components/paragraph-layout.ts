import type {
  AsterEditor,
  ParagraphLayoutAttrName,
  ParagraphLayoutAttrs,
} from '@aster-editor/core';
import { el } from '../utils/dom.js';
import { isRecord } from '../utils/guards.js';

/**
 * Briques partagées par les widgets de mise en page de paragraphe (interligne,
 * espacement, retraits, bordures) : lecture des attributs `ParagraphLayoutAttrs` du bloc
 * courant, appel des commandes `paragraph.setLayout` / `paragraph.unsetLayout`, saisie et
 * formatage des nombres. Aucun widget ne lit `tiptap.getAttributes` directement.
 */

/** Nœuds de bloc porteurs des attributs de mise en page, dans l'ordre de lecture. */
export const PARAGRAPH_LAYOUT_NODES = ['paragraph', 'heading'] as const;

/** Pas d'un clic sur « augmenter / diminuer le retrait », en points. */
export const INDENT_STEP_PT = 18;

/**
 * Bornes de saisie alignées sur Word : retraits, espacements et interligne exact plafonnés
 * à 1584 pt (22 pouces), interligne multiple à 132, épaisseur de bordure entre 0,25 et
 * 6 pt. Posées en `max` / `min` sur les champs **et** vérifiées dans `submit`, un
 * `<input type="number">` n'empêchant pas la saisie clavier hors bornes.
 */
export const MAX_PARAGRAPH_PT = 1584;
export const MAX_LINE_HEIGHT_MULTIPLE = 132;
export const MIN_BORDER_WIDTH_PT = 0.25;
export const MAX_BORDER_WIDTH_PT = 6;

/** Attributs d'un nœud, `null` s'il est absent du schéma ou hors sélection. */
function readNodeAttrs(editor: AsterEditor, name: string): Record<string, unknown> | null {
  try {
    const attrs: unknown = editor.tiptap.getAttributes(name);
    return isRecord(attrs) && Object.keys(attrs).length > 0 ? attrs : null;
  } catch {
    return null;
  }
}

/** Égalité structurelle simple ; `null` et `undefined` sont confondus (attribut non posé). */
function sameAttrValue(a: unknown, b: unknown): boolean {
  if ((a ?? null) === (b ?? null)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Attributs du bloc courant. Tiptap renvoie `{}` hors du nœud demandé, un dictionnaire
 * non vide signale donc le bloc sous le curseur. Sur une sélection qui couvre à la fois
 * un paragraphe et un titre, les deux sont lus et seuls les attributs à valeur commune
 * sont conservés : un attribut qui diffère est « indéterminé » (absent, rien de coché ni
 * de prérempli), comme dans Word. Tolérant si l'extension manque (core réduit, mock).
 */
export function currentBlockLayout(editor: AsterEditor): Record<string, unknown> {
  const found = PARAGRAPH_LAYOUT_NODES.map((name) => readNodeAttrs(editor, name)).filter(
    (attrs): attrs is Record<string, unknown> => attrs !== null,
  );
  const [first, ...others] = found;
  if (!first) return {};
  if (others.length === 0) return first;
  const merged: Record<string, unknown> = {};
  for (const key of Object.keys(first)) {
    if (others.every((attrs) => sameAttrValue(first[key], attrs[key]))) merged[key] = first[key];
  }
  return merged;
}

/** Vrai si `value` sort de l'intervalle `[min, max]` (bornes absentes = non vérifiées). */
export function isOutOfRange(value: number, min?: number, max?: number): boolean {
  return (min !== undefined && value < min) || (max !== undefined && value > max);
}

/** Champ numérique fini d'un dictionnaire, `null` s'il est absent, nul ou d'un autre type. */
export function readNumber(record: Record<string, unknown>, key: string): number | null {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Champ booléen d'un dictionnaire : vrai seulement si la valeur est exactement `true`. */
export function readFlag(record: Record<string, unknown>, key: string): boolean {
  return record[key] === true;
}

/** Vrai si la commande `paragraph.setLayout` est exécutable dans l'état courant. */
export function canEditBlockLayout(editor: AsterEditor): boolean {
  return editor.commands.canRun('paragraph.setLayout', {});
}

/** Fusionne des attributs de mise en page dans les blocs de la sélection. */
export function setBlockLayout(editor: AsterEditor, attrs: ParagraphLayoutAttrs): boolean {
  return editor.commands.run('paragraph.setLayout', attrs);
}

/** Efface les attributs nommés des blocs de la sélection. */
export function unsetBlockLayout(
  editor: AsterEditor,
  attrs: readonly ParagraphLayoutAttrName[],
): boolean {
  return editor.commands.run('paragraph.unsetLayout', { attrs });
}

/** Résultat d'une saisie numérique : vide, invalide, ou un nombre fini. */
export type ParsedNumber = number | null | 'invalid';

/**
 * Forme d'un nombre décimal, exposant compris (`1e3`, accepté par `<input type="number">`).
 * Sans alternative ambiguë entre `\d+` et `\d*` : une saisie longue et invalide est
 * rejetée en temps linéaire, la fonction étant publique et appelée sur `input.value`.
 */
const NUMBER_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Lit une saisie numérique : virgule ou point décimal, unité (`pt`, `mm`, `px`) tolérée,
 * vide → `null`, texte non numérique ou nombre non fini → `'invalid'`.
 */
export function parseNumberInput(value: string): ParsedNumber {
  const trimmed = value
    .trim()
    .replace(',', '.')
    .replace(/\s*(pt|mm|px)$/i, '');
  if (trimmed === '') return null;
  if (!NUMBER_PATTERN.test(trimmed)) return 'invalid';
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 'invalid';
}

/** Formate un nombre pour l'affichage : au plus deux décimales, séparateur de la locale. */
export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

/** Valeur d'un `<input type="number">` : au plus deux décimales, point décimal, vide si `null`. */
export function numberInputValue(value: number | null): string {
  return value === null ? '' : String(Math.round(value * 100) / 100);
}

/** Suffixe aléatoire pour des `id` de champs uniques par ouverture de panneau. */
export function fieldSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}

/** Options d'un champ numérique de dialogue. */
export interface NumberFieldOptions {
  readonly id: string;
  readonly label: string;
  readonly value: number | null;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number | 'any';
  readonly placeholder?: string;
  /** Classe additionnelle du conteneur. */
  readonly className?: string;
}

/** Champ numérique libellé : conteneur `.aster-dialog__field` + `<input type="number">`. */
export function createNumberField(options: NumberFieldOptions): {
  wrapper: HTMLElement;
  input: HTMLInputElement;
} {
  const input = el('input', {
    className: 'aster-dialog__input aster-dialog__input--number',
    attrs: {
      type: 'number',
      id: options.id,
      autocomplete: 'off',
      inputmode: 'decimal',
      min: options.min === undefined ? undefined : String(options.min),
      max: options.max === undefined ? undefined : String(options.max),
      step: options.step === undefined ? 'any' : String(options.step),
      placeholder: options.placeholder,
    },
  });
  input.value = numberInputValue(options.value);
  const wrapper = el(
    'div',
    { className: ['aster-dialog__field', options.className].filter(Boolean).join(' ') },
    [
      el('label', {
        className: 'aster-dialog__label',
        attrs: { for: options.id },
        text: options.label,
      }),
      input,
    ],
  );
  return { wrapper, input };
}

/** Case à cocher libellée : `<label class="aster-dialog__check"><input type="checkbox">…</label>`. */
export function createCheckbox(
  label: string,
  checked: boolean,
  className?: string,
): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const input = el('input', {
    className: ['aster-dialog__checkbox', className].filter(Boolean).join(' '),
    attrs: { type: 'checkbox' },
  });
  input.checked = checked;
  const wrapper = el('label', { className: 'aster-dialog__check' }, [input, label]);
  return { wrapper, input };
}

/** Entrée valide un champ comme le bouton principal du dialogue. */
export function submitOnEnter(inputs: readonly HTMLElement[], submit: () => void): void {
  for (const input of inputs) {
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        submit();
      }
    });
  }
}

/** Marque un champ invalide, affiche le message dans l'alerte et lui donne le focus. */
export function flagInvalid(input: HTMLInputElement, alert: HTMLElement, message: string): void {
  alert.textContent = message;
  alert.removeAttribute('hidden');
  input.setAttribute('aria-invalid', 'true');
  input.focus();
}

/** Zone d'alerte masquée d'un dialogue (`role="alert"`). */
export function createAlert(): HTMLElement {
  return el('div', { className: 'aster-dialog__error', attrs: { role: 'alert', hidden: '' } });
}
