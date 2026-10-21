import type { AsterEditor, ParagraphLayoutAttrName } from '@aster-editor/core';
import type { ToolbarWidget } from '../types.js';
import { el } from '../utils/dom.js';
import { createPlainButton } from './button.js';
import { createDropdown, type Dropdown } from './dropdown.js';
import {
  MAX_PARAGRAPH_PT,
  canEditBlockLayout,
  createAlert,
  createCheckbox,
  createNumberField,
  currentBlockLayout,
  fieldSuffix,
  flagInvalid,
  isOutOfRange,
  parseNumberInput,
  readFlag,
  readNumber,
  setBlockLayout,
  submitOnEnter,
  unsetBlockLayout,
} from './paragraph-layout.js';

/**
 * Champs numériques du dialogue, dans l'ordre d'affichage : attribut, clé i18n et bornes
 * (Word : 1584 pt au plus). Un retrait de première ligne négatif est un retrait suspendu,
 * seul champ au minimum négatif.
 */
const NUMBER_FIELDS: readonly {
  readonly attr: Extract<
    ParagraphLayoutAttrName,
    'spacingBeforePt' | 'spacingAfterPt' | 'indentLeftPt' | 'indentRightPt' | 'indentFirstLinePt'
  >;
  readonly labelKey: string;
  readonly min: number;
  readonly max: number;
}[] = [
  {
    attr: 'spacingBeforePt',
    labelKey: 'ui.paragraphSpacing.before',
    min: 0,
    max: MAX_PARAGRAPH_PT,
  },
  { attr: 'spacingAfterPt', labelKey: 'ui.paragraphSpacing.after', min: 0, max: MAX_PARAGRAPH_PT },
  {
    attr: 'indentLeftPt',
    labelKey: 'ui.paragraphSpacing.indentLeft',
    min: 0,
    max: MAX_PARAGRAPH_PT,
  },
  {
    attr: 'indentRightPt',
    labelKey: 'ui.paragraphSpacing.indentRight',
    min: 0,
    max: MAX_PARAGRAPH_PT,
  },
  {
    attr: 'indentFirstLinePt',
    labelKey: 'ui.paragraphSpacing.firstLine',
    min: -MAX_PARAGRAPH_PT,
    max: MAX_PARAGRAPH_PT,
  },
];

/** Attributs que le dialogue pilote, et que « Réinitialiser » efface. */
export const PARAGRAPH_SPACING_ATTRS: readonly ParagraphLayoutAttrName[] = [
  'spacingBeforePt',
  'spacingAfterPt',
  'indentLeftPt',
  'indentRightPt',
  'indentFirstLinePt',
  'keepWithNext',
  'pageBreakBefore',
];

/**
 * Vrai si le bloc courant porte au moins un des attributs du dialogue. Un booléen à
 * `false` compte comme non posé, au cas où le core sérialise ses drapeaux à `false`
 * plutôt qu'à `null` : sinon tout paragraphe serait « mis en forme ».
 */
export function hasParagraphSpacing(editor: AsterEditor): boolean {
  const attrs = currentBlockLayout(editor);
  return PARAGRAPH_SPACING_ATTRS.some(
    (attr) => attrs[attr] !== null && attrs[attr] !== undefined && attrs[attr] !== false,
  );
}

/**
 * Widget `paragraphSpacing` : dialogue « Espacement » (avant / après, retraits gauche,
 * droite et première ligne en pt, « Conserver avec le suivant », « Saut de page avant »),
 * prérempli depuis le bloc courant. « Appliquer » envoie `paragraph.setLayout` avec chaque
 * champ : un nombre, ou `null` pour un champ vidé / une case décochée (retour à l'héritage).
 * « Réinitialiser » envoie `paragraph.unsetLayout` sur les sept attributs.
 */
export function createParagraphSpacingDialog(editor: AsterEditor): ToolbarWidget {
  return createDropdown({
    editor,
    labelKey: 'ui.paragraphSpacing.title',
    icon: 'paragraph-spacing',
    panelRole: 'dialog',
    panelClass: 'aster-dialog aster-paragraph-spacing',
    isEnabled: () => canEditBlockLayout(editor),
    isActive: () => hasParagraphSpacing(editor),
    renderPanel: (panel, dropdown) => renderSpacingPanel(editor, panel, dropdown),
  });
}

function renderSpacingPanel(editor: AsterEditor, panel: HTMLElement, dropdown: Dropdown): void {
  const t = (key: string): string => editor.i18n.t(key);
  const current = currentBlockLayout(editor);
  const suffix = fieldSuffix();
  panel.setAttribute('aria-label', t('ui.paragraphSpacing.title'));

  const fields = NUMBER_FIELDS.map((field) => ({
    ...field,
    ...createNumberField({
      id: `aster-paragraph-spacing-${field.attr}-${suffix}`,
      label: t(field.labelKey),
      value: readNumber(current, field.attr),
      min: field.min,
      max: field.max,
      step: 0.5,
    }),
  }));
  fields[0]?.input.setAttribute('autofocus', '');
  const alert = createAlert();

  const keepWithNext = createCheckbox(
    t('ui.paragraphSpacing.keepWithNext'),
    readFlag(current, 'keepWithNext'),
    'aster-paragraph-spacing__keep',
  );
  const pageBreakBefore = createCheckbox(
    t('ui.paragraphSpacing.pageBreakBefore'),
    readFlag(current, 'pageBreakBefore'),
    'aster-paragraph-spacing__break',
  );

  const submit = (): void => {
    const values: Partial<Record<ParagraphLayoutAttrName, number | null>> = {};
    for (const field of fields) {
      const parsed = parseNumberInput(field.input.value);
      if (parsed === 'invalid' || (parsed !== null && isOutOfRange(parsed, field.min, field.max))) {
        flagInvalid(
          field.input,
          alert,
          editor.i18n.t('ui.paragraphSpacing.invalid', { min: field.min, max: field.max }),
        );
        return;
      }
      values[field.attr] = parsed;
    }
    setBlockLayout(editor, {
      spacingBeforePt: values.spacingBeforePt ?? null,
      spacingAfterPt: values.spacingAfterPt ?? null,
      indentLeftPt: values.indentLeftPt ?? null,
      indentRightPt: values.indentRightPt ?? null,
      indentFirstLinePt: values.indentFirstLinePt ?? null,
      keepWithNext: keepWithNext.input.checked ? true : null,
      pageBreakBefore: pageBreakBefore.input.checked ? true : null,
    });
    dropdown.close(false);
    editor.focus();
  };
  submitOnEnter(
    fields.map((field) => field.input),
    submit,
  );
  for (const field of fields) {
    field.input.addEventListener('input', () => {
      field.input.removeAttribute('aria-invalid');
      alert.setAttribute('hidden', '');
    });
  }

  const ok = createPlainButton({
    className: 'aster-dialog__button aster-dialog__button--primary',
    text: t('ui.paragraphSpacing.ok'),
  });
  ok.addEventListener('click', submit);
  const cancel = createPlainButton({
    className: 'aster-dialog__button',
    text: t('ui.paragraphSpacing.cancel'),
  });
  cancel.addEventListener('click', () => dropdown.close(true));
  const reset = createPlainButton({
    className: 'aster-dialog__button aster-dialog__button--secondary',
    text: t('ui.paragraphSpacing.reset'),
  });
  reset.disabled =
    !hasParagraphSpacing(editor) || !editor.commands.canRun('paragraph.unsetLayout', {});
  reset.addEventListener('click', () => {
    unsetBlockLayout(editor, PARAGRAPH_SPACING_ATTRS);
    dropdown.close(false);
    editor.focus();
  });

  const [before, after, left, right, firstLine] = fields;
  panel.append(
    el('div', { className: 'aster-dialog__row' }, [before?.wrapper ?? '', after?.wrapper ?? '']),
    el('div', { className: 'aster-dialog__row' }, [left?.wrapper ?? '', right?.wrapper ?? '']),
    firstLine?.wrapper ?? '',
    alert,
    el('div', { className: 'aster-dialog__field' }, [
      keepWithNext.wrapper,
      pageBreakBefore.wrapper,
    ]),
    el('div', { className: 'aster-dialog__actions' }, [reset, cancel, ok]),
  );
}
