import type { AsterEditor, BlockBorder, BorderSide, BorderStyle } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { el } from '../utils/dom';
import { isRecord } from '../utils/guards';
import { createPlainButton } from './button';
import { createDropdown, type Dropdown } from './dropdown';
import {
  MAX_BORDER_WIDTH_PT,
  MIN_BORDER_WIDTH_PT,
  canEditBlockLayout,
  createAlert,
  createCheckbox,
  createNumberField,
  currentBlockLayout,
  fieldSuffix,
  flagInvalid,
  isOutOfRange,
  parseNumberInput,
  setBlockLayout,
  submitOnEnter,
  unsetBlockLayout,
} from './paragraph-layout';

/** Côtés éditables par le dialogue, dans l'ordre d'affichage (`between` n'est pas proposé). */
export const BORDER_SIDES: readonly Exclude<BorderSide, 'between'>[] = [
  'top',
  'right',
  'bottom',
  'left',
];

/** Styles de trait proposés, dans l'ordre du sélecteur ; `none` retire la bordure. */
export const BORDER_STYLES: readonly BorderStyle[] = ['solid', 'dashed', 'dotted', 'double'];

/** Épaisseur et couleur proposées quand un côté passe de « aucune » à un style de trait. */
export const DEFAULT_BORDER_WIDTH_PT = 0.5;
export const DEFAULT_BORDER_COLOR = '#000000';
/** Fond proposé quand la case « Fond » est cochée sans couleur antérieure. */
export const DEFAULT_SHADING_COLOR = '#eeeeee';

function isBorderStyle(value: unknown): value is BorderStyle {
  return typeof value === 'string' && (BORDER_STYLES as readonly string[]).includes(value);
}

function isBorderSide(value: unknown): value is BorderSide {
  return (
    typeof value === 'string' &&
    (['top', 'right', 'bottom', 'left', 'between'] as readonly string[]).includes(value)
  );
}

/** Vrai si `value` est un `BlockBorder` complet et cohérent. */
export function isBlockBorder(value: unknown): value is BlockBorder {
  return (
    isRecord(value) &&
    isBorderSide(value['side']) &&
    isBorderStyle(value['style']) &&
    typeof value['widthPt'] === 'number' &&
    Number.isFinite(value['widthPt']) &&
    typeof value['color'] === 'string'
  );
}

/** Bordures et fond du bloc courant, tolérants aux attributs absents ou malformés. */
export function currentBorders(editor: AsterEditor): {
  borders: readonly BlockBorder[];
  shading: string | null;
} {
  const attrs = currentBlockLayout(editor);
  const raw = attrs['borders'];
  const borders = Array.isArray(raw) ? raw.filter(isBlockBorder) : [];
  const shading = attrs['shading'];
  return { borders, shading: typeof shading === 'string' && shading.length > 0 ? shading : null };
}

/** Vrai si le bloc courant a au moins une bordure ou un fond. */
export function hasBordersOrShading(editor: AsterEditor): boolean {
  const { borders, shading } = currentBorders(editor);
  return borders.length > 0 || shading !== null;
}

/** Couleur acceptable pour `<input type="color">` : `#rrggbb` minuscule, sinon repli. */
export function toHexColor(value: string | null | undefined, fallback: string): string {
  if (!value) return fallback;
  const trimmed = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return fallback;
}

/**
 * Widget `paragraphBorders` : dialogue « Bordures et fond ». Une ligne par côté (haut,
 * droite, bas, gauche) avec style de trait, épaisseur en pt (0,25 à 6, comme Word) et
 * couleur, plus une case « Fond » et sa couleur. « Appliquer » envoie
 * `paragraph.setLayout({ borders, shading })` (`null` quand rien n'est coché, pour
 * effacer), « Réinitialiser » envoie `paragraph.unsetLayout({ attrs: ['borders',
 * 'shading'] })`. Une bordure `between` (import Word, non éditable ici) est conservée
 * telle quelle ; une couleur d'origine hors `#rrggbb` (`rgb()`, nom) est renvoyée intacte
 * tant que son sélecteur n'a pas été touché.
 */
export function createParagraphBordersDialog(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'ui.borders.title',
    icon: 'paragraph-borders',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-borders-dialog',
    isEnabled: () => canEditBlockLayout(editor),
    isActive: () => hasBordersOrShading(editor),
    renderPanel: (panel, dropdown) => renderBordersPanel(editor, panel, dropdown),
  });
}

interface SideRow {
  readonly side: Exclude<BorderSide, 'between'>;
  readonly style: HTMLSelectElement;
  readonly width: HTMLInputElement;
  readonly color: HTMLInputElement;
  /** Couleur à renvoyer : celle d'origine tant que le sélecteur n'a pas émis `input`. */
  readonly currentColor: () => string;
}

/**
 * Lie un `<input type="color">` à une couleur d'origine : `toHexColor` replie en silence
 * tout ce qui n'est pas `#rgb` / `#rrggbb`, le repli ne doit donc être renvoyé que si
 * l'utilisateur a réellement choisi une couleur.
 */
function trackColor(input: HTMLInputElement, original: string | null): () => string {
  let touched = false;
  input.addEventListener('input', () => {
    touched = true;
  });
  return () => (touched || original === null ? input.value : original);
}

function renderBordersPanel(editor: AsterEditor, panel: HTMLElement, dropdown: Dropdown): void {
  const t = (key: string): string => editor.i18n.t(key);
  const current = currentBorders(editor);
  const suffix = fieldSuffix();
  panel.setAttribute('aria-label', t('ui.borders.title'));
  const alert = createAlert();

  const table = el('div', {
    className: 'aster-borders-dialog__sides',
    attrs: { role: 'group', 'aria-label': t('ui.borders.title') },
  });
  table.append(
    el('div', { className: 'aster-borders-dialog__head' }, [
      el('span'),
      el('span', { className: 'aster-dialog__label', text: t('ui.borders.style') }),
      el('span', { className: 'aster-dialog__label', text: t('ui.borders.width') }),
      el('span', { className: 'aster-dialog__label', text: t('ui.borders.color') }),
    ]),
  );

  const rows: SideRow[] = [];
  for (const side of BORDER_SIDES) {
    const existing = current.borders.find((border) => border.side === side);
    const styleId = `aster-borders-${side}-style-${suffix}`;
    const style = el('select', {
      className: 'aster-dialog__input aster-dialog__select aster-borders-dialog__style',
      attrs: {
        id: styleId,
        'aria-label': `${t(`ui.borders.side.${side}`)} – ${t('ui.borders.style')}`,
      },
    });
    for (const value of ['none', ...BORDER_STYLES]) {
      const option = el('option', { attrs: { value }, text: t(`ui.borders.style.${value}`) });
      style.append(option);
    }
    style.value = existing ? existing.style : 'none';
    if (side === 'top') style.setAttribute('autofocus', '');

    const widthField = createNumberField({
      id: `aster-borders-${side}-width-${suffix}`,
      label: `${t(`ui.borders.side.${side}`)} – ${t('ui.borders.width')}`,
      value: existing ? existing.widthPt : DEFAULT_BORDER_WIDTH_PT,
      min: MIN_BORDER_WIDTH_PT,
      max: MAX_BORDER_WIDTH_PT,
      step: 0.25,
      className: 'aster-borders-dialog__width',
    });
    widthField.wrapper.querySelector('label')?.classList.add('aster-visually-hidden');
    const color = el('input', {
      className: 'aster-borders-dialog__color',
      attrs: {
        type: 'color',
        id: `aster-borders-${side}-color-${suffix}`,
        'aria-label': `${t(`ui.borders.side.${side}`)} – ${t('ui.borders.color')}`,
      },
    });
    color.value = toHexColor(existing?.color, DEFAULT_BORDER_COLOR);
    const currentColor = trackColor(color, existing?.color ?? null);

    const syncRow = (): void => {
      const disabled = style.value === 'none';
      widthField.input.disabled = disabled;
      color.disabled = disabled;
    };
    style.addEventListener('change', syncRow);
    syncRow();

    table.append(
      el('div', { className: 'aster-borders-dialog__row', attrs: { 'data-side': side } }, [
        el('label', {
          className: 'aster-dialog__label',
          attrs: { for: styleId },
          text: t(`ui.borders.side.${side}`),
        }),
        style,
        widthField.wrapper,
        color,
      ]),
    );
    rows.push({ side, style, width: widthField.input, color, currentColor });
  }

  const shading = createCheckbox(
    t('ui.borders.shading'),
    current.shading !== null,
    'aster-borders-dialog__shading',
  );
  const shadingColor = el('input', {
    className: 'aster-borders-dialog__color aster-borders-dialog__shading-color',
    attrs: { type: 'color', 'aria-label': t('ui.borders.shadingColor') },
  });
  shadingColor.value = toHexColor(current.shading, DEFAULT_SHADING_COLOR);
  const currentShadingColor = trackColor(shadingColor, current.shading);
  shadingColor.disabled = !shading.input.checked;
  shading.input.addEventListener('change', () => {
    shadingColor.disabled = !shading.input.checked;
  });

  const submit = (): void => {
    // Les bordures `between` ne sont pas éditables ici : on repart d'elles.
    const borders: BlockBorder[] = current.borders.filter((border) => border.side === 'between');
    for (const row of rows) {
      const style = row.style.value;
      if (!isBorderStyle(style)) continue;
      const width = parseNumberInput(row.width.value);
      if (
        width === null ||
        width === 'invalid' ||
        isOutOfRange(width, MIN_BORDER_WIDTH_PT, MAX_BORDER_WIDTH_PT)
      ) {
        flagInvalid(
          row.width,
          alert,
          editor.i18n.t('ui.borders.invalid', {
            min: MIN_BORDER_WIDTH_PT,
            max: MAX_BORDER_WIDTH_PT,
          }),
        );
        return;
      }
      borders.push({ side: row.side, style, widthPt: width, color: row.currentColor() });
    }
    setBlockLayout(editor, {
      borders: borders.length > 0 ? borders : null,
      shading: shading.input.checked ? currentShadingColor() : null,
    });
    dropdown.close(false);
    editor.focus();
  };
  submitOnEnter(
    rows.map((row) => row.width),
    submit,
  );
  for (const row of rows) {
    row.width.addEventListener('input', () => {
      row.width.removeAttribute('aria-invalid');
      alert.setAttribute('hidden', '');
    });
  }

  const ok = createPlainButton({
    className: 'aster-dialog__button aster-dialog__button--primary',
    text: t('ui.borders.ok'),
  });
  ok.addEventListener('click', submit);
  const cancel = createPlainButton({
    className: 'aster-dialog__button',
    text: t('ui.borders.cancel'),
  });
  cancel.addEventListener('click', () => dropdown.close(true));
  const reset = createPlainButton({
    className: 'aster-dialog__button aster-dialog__button--secondary',
    text: t('ui.borders.reset'),
  });
  reset.disabled =
    !hasBordersOrShading(editor) || !editor.commands.canRun('paragraph.unsetLayout', {});
  reset.addEventListener('click', () => {
    unsetBlockLayout(editor, ['borders', 'shading']);
    dropdown.close(false);
    editor.focus();
  });

  panel.append(
    table,
    alert,
    el('div', { className: 'aster-dialog__row aster-borders-dialog__shading-row' }, [
      shading.wrapper,
      shadingColor,
    ]),
    el('div', { className: 'aster-dialog__actions' }, [reset, cancel, ok]),
  );
}
