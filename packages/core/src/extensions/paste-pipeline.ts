import type { EditorView } from '@tiptap/pm/view';
import type { AsterEditor, PasteContext, PasteTransformer } from '../api';

/**
 * Applique les transformateurs dans l'ordre, chacun recevant la sortie du
 * précédent. Fonction pure, testable sans éditeur. Un transformateur qui lève
 * est ignoré : un bug dans un nettoyeur ne doit pas bloquer le collage.
 */
export function applyPasteTransformers(
  html: string,
  context: PasteContext,
  transformers: readonly PasteTransformer[],
): string {
  let current = html;
  for (const transformer of transformers) {
    try {
      current = transformer(current, context);
    } catch {
      // Transformateur défaillant : on garde la sortie précédente.
    }
  }
  return current;
}

/** Props ProseMirror produites par le pipeline de collage. */
export interface PastePipelineProps {
  transformPastedHTML: (html: string, view: EditorView) => string;
  /** Capture l'événement DOM avant ProseMirror pour alimenter le `PasteContext`. */
  onPasteEvent: (view: EditorView, event: ClipboardEvent) => boolean;
}

/**
 * Branche `options.pasteTransformers` sur `transformPastedHTML`.
 *
 * ProseMirror ne transmet pas l'événement à `transformPastedHTML`, alors on le
 * capture juste avant via `handleDOMEvents.paste` : c'est le seul moyen d'offrir
 * `plainText` et `event` aux transformateurs, dont `word` a besoin pour ses
 * heuristiques. Un collage simulé (`view.pasteHTML`) n'a simplement pas d'événement.
 */
export function createPastePipelineProps(
  editor: AsterEditor,
  transformers: readonly PasteTransformer[],
): PastePipelineProps {
  let pendingEvent: ClipboardEvent | undefined;

  return {
    onPasteEvent(_view, event) {
      pendingEvent = event;
      return false;
    },
    transformPastedHTML(html) {
      if (transformers.length === 0) {
        pendingEvent = undefined;
        return html;
      }
      const event = pendingEvent;
      pendingEvent = undefined;
      const context: PasteContext = {
        editor,
        plainText: event?.clipboardData?.getData('text/plain') ?? '',
        event,
      };
      return applyPasteTransformers(html, context, transformers);
    },
  };
}
