import type { AsterEditor } from '@aster-editor/core';
import { escapeHtml } from '@aster-editor/core';
import type { ToolbarWidget } from '../types';
import { createPlainButton } from './button';
import { applyTooltip } from './tooltip';

/** Classe du conteneur de contenu dans la fenêtre d'impression. */
export const PRINT_CONTENT_CLASS = 'aster-print';

/**
 * Feuille minimale embarquée dans la fenêtre d'impression : la fenêtre est vierge et
 * ne peut pas charger `themes/print.css` par URL, on inline donc l'essentiel des règles
 * de contenu de `base.css` en version imprimable (noir sur blanc, pas de décor).
 */
export const PRINT_CONTENT_STYLES = [
  `.${PRINT_CONTENT_CLASS}{font-family:Georgia,serif;font-size:12pt;line-height:1.5;color:#000;max-width:none}`,
  `.${PRINT_CONTENT_CLASS} > * + *{margin-top:0.75em}`,
  `.${PRINT_CONTENT_CLASS} p{margin:0}`,
  `.${PRINT_CONTENT_CLASS} h1,.${PRINT_CONTENT_CLASS} h2,.${PRINT_CONTENT_CLASS} h3,.${PRINT_CONTENT_CLASS} h4,.${PRINT_CONTENT_CLASS} h5,.${PRINT_CONTENT_CLASS} h6{margin:1.2em 0 0.4em;line-height:1.25;font-weight:700;page-break-after:avoid}`,
  `.${PRINT_CONTENT_CLASS} h1{font-size:2em}.${PRINT_CONTENT_CLASS} h2{font-size:1.6em}.${PRINT_CONTENT_CLASS} h3{font-size:1.3em}.${PRINT_CONTENT_CLASS} h4{font-size:1.1em}.${PRINT_CONTENT_CLASS} h5{font-size:1em}.${PRINT_CONTENT_CLASS} h6{font-size:0.9em}`,
  `.${PRINT_CONTENT_CLASS} ul,.${PRINT_CONTENT_CLASS} ol{padding-left:1.6em;margin:0}`,
  `.${PRINT_CONTENT_CLASS} li > p{margin:0}.${PRINT_CONTENT_CLASS} li + li{margin-top:0.25em}`,
  `.${PRINT_CONTENT_CLASS} ul[data-type='taskList']{list-style:none;padding-left:0.2em}`,
  `.${PRINT_CONTENT_CLASS} ul[data-type='taskList'] li{display:flex;align-items:flex-start;gap:0.5em}`,
  `.${PRINT_CONTENT_CLASS} a{color:#000;text-decoration:underline}`,
  `.${PRINT_CONTENT_CLASS} blockquote{margin:0;padding:0.25em 1em;border-left:3px solid #888;color:#333}`,
  `.${PRINT_CONTENT_CLASS} code{font-family:Consolas,monospace;font-size:0.9em}`,
  `.${PRINT_CONTENT_CLASS} pre{margin:0;padding:0.75em 1em;border:1px solid #888;font-family:Consolas,monospace;font-size:0.9em;white-space:pre-wrap;page-break-inside:avoid}`,
  `.${PRINT_CONTENT_CLASS} mark{background:#eee;color:inherit}`,
  `.${PRINT_CONTENT_CLASS} hr{border:0;border-top:2px solid #888;margin:1em 0}`,
  `.${PRINT_CONTENT_CLASS} img{max-width:100%;height:auto;display:block;page-break-inside:avoid}`,
  `.${PRINT_CONTENT_CLASS} img[data-align='center']{margin-left:auto;margin-right:auto}.${PRINT_CONTENT_CLASS} img[data-align='right']{margin-left:auto}`,
  `.${PRINT_CONTENT_CLASS} table{border-collapse:collapse;width:100%;margin:0;page-break-inside:auto}`,
  `.${PRINT_CONTENT_CLASS} td,.${PRINT_CONTENT_CLASS} th{padding:0.25em 0.5em;border:1px solid #888;vertical-align:top;text-align:left}`,
  `.${PRINT_CONTENT_CLASS} th{font-weight:700;background:#eee}`,
  `.${PRINT_CONTENT_CLASS} td > p,.${PRINT_CONTENT_CLASS} th > p{margin:0}`,
  `.${PRINT_CONTENT_CLASS} tr{page-break-inside:avoid}`,
  `body{margin:2cm}`,
].join('\n');

/** Options de `buildPrintDocument`. */
export interface PrintDocumentOptions {
  /** Titre de la fenêtre, échappé. */
  title: string;
  /** Attribut `lang` du document, pour la césure et le lecteur d'écran. */
  lang: string;
  /** CSS additionnel, inséré après la feuille embarquée. */
  styles?: string;
}

/**
 * Construit le document HTML complet envoyé à la fenêtre d'impression. `html` est la
 * sortie de `getHTML()` : déjà passée par le schéma, sans script ni lien dangereux.
 */
export function buildPrintDocument(html: string, options: PrintDocumentOptions): string {
  const extra = options.styles ? `\n${options.styles}` : '';
  return (
    `<!doctype html><html lang="${escapeHtml(options.lang)}"><head><meta charset="utf-8">` +
    `<title>${escapeHtml(options.title)}</title><style>${PRINT_CONTENT_STYLES}${extra}</style></head>` +
    `<body><div class="${PRINT_CONTENT_CLASS}">${html}</div></body></html>`
  );
}

/** Ouvre une fenêtre vierge ; `null` si le navigateur l'a bloquée. */
export type WindowOpener = () => Window | null;

const defaultOpener: WindowOpener = () => window.open('', '_blank');

/**
 * Imprime le contenu de l'éditeur : fenêtre vierge, document HTML avec la feuille
 * embarquée, puis `print()`. La fenêtre se referme après impression (`afterprint`).
 * Retourne `false` si la fenêtre n'a pas pu s'ouvrir (bloqueur de popups).
 */
export function printEditor(editor: AsterEditor, open: WindowOpener = defaultOpener): boolean {
  const target = open();
  if (!target) return false;
  const document = buildPrintDocument(editor.getHTML(), {
    title: editor.i18n.t('ui.print.documentTitle'),
    lang: editor.i18n.getLocale(),
  });
  target.document.open();
  target.document.write(document);
  target.document.close();
  target.addEventListener('afterprint', () => target.close());
  target.focus();
  target.print();
  return true;
}

/**
 * Widget `print` : bouton qui imprime le document. Toujours actif, lecture seule
 * comprise : c'est une fonction de sortie, pas d'édition.
 */
export function createPrintButton(editor: AsterEditor, open?: WindowOpener): ToolbarWidget {
  const button = createPlainButton({
    className: 'aster-print-button',
    icon: 'print',
    toolbarItem: true,
  });

  const update = (): void => {
    applyTooltip(button, editor.i18n.t('ui.print.label'));
  };

  const onClick = (): void => {
    printEditor(editor, open);
  };
  button.addEventListener('click', onClick);
  update();

  return {
    element: button,
    update,
    destroy: () => button.removeEventListener('click', onClick),
  };
}
