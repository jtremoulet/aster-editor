import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PasteContext, PasteTransformer } from '../api/index.js';

// jsdom 30 ne définit pas `ClipboardEvent`, que `view.pasteHTML` instancie pour
// simuler un collage. Un squelette sur `Event` suffit : nos props ne lisent que
// `clipboardData`, absent ici, exactement comme pour un collage simulé réel.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  Object.assign(globalThis, {
    ClipboardEvent: class extends Event {
      readonly clipboardData = null;
    },
  });
}
import { applyPasteTransformers } from './paste-pipeline.js';
import { mountEditor, type MountedEditor } from '../testing/mount.js';

describe('pipeline de collage', () => {
  describe('applyPasteTransformers', () => {
    const context = { plainText: 'texte' } as PasteContext;

    it('rend le HTML inchangé sans transformateur', () => {
      expect(applyPasteTransformers('<p>a</p>', context, [])).toBe('<p>a</p>');
    });

    it('enchaîne les transformateurs dans l’ordre, chacun recevant la sortie du précédent', () => {
      const seen: string[] = [];
      const first: PasteTransformer = (html) => {
        seen.push(`first:${html}`);
        return `${html}1`;
      };
      const second: PasteTransformer = (html) => {
        seen.push(`second:${html}`);
        return `${html}2`;
      };
      expect(applyPasteTransformers('x', context, [first, second])).toBe('x12');
      expect(seen).toEqual(['first:x', 'second:x1']);
    });

    it('transmet le contexte à chaque transformateur', () => {
      const transformer = vi.fn<PasteTransformer>((html) => html);
      applyPasteTransformers('x', context, [transformer]);
      expect(transformer).toHaveBeenCalledWith('x', context);
    });

    it('ignore un transformateur qui lève et continue la chaîne', () => {
      const broken: PasteTransformer = () => {
        throw new Error('boom');
      };
      const upper: PasteTransformer = (html) => html.toUpperCase();
      expect(applyPasteTransformers('abc', context, [broken, upper])).toBe('ABC');
    });
  });

  describe('collage simulé dans l’éditeur', () => {
    let mounted: MountedEditor;

    afterEach(() => {
      mounted.cleanup();
    });

    it('applique les transformateurs au HTML collé', () => {
      const boldToItalic: PasteTransformer = (html) =>
        html.replace(/<b>/g, '<em>').replace(/<\/b>/g, '</em>');
      const upper: PasteTransformer = (html) => html.replace('collé', 'COLLÉ');
      mounted = mountEditor({ content: '<p></p>', pasteTransformers: [boldToItalic, upper] });
      mounted.editor.focus('end');
      expect(mounted.editor.tiptap.view.pasteHTML('<p>texte <b>collé</b></p>')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>texte <em>COLLÉ</em></p>');
    });

    it('fournit le contexte avec l’éditeur et un plainText vide pour un collage simulé', () => {
      const transformer = vi.fn<PasteTransformer>((html) => html);
      mounted = mountEditor({ content: '<p></p>', pasteTransformers: [transformer] });
      mounted.editor.focus('end');
      mounted.editor.tiptap.view.pasteHTML('<p>x</p>');
      expect(transformer).toHaveBeenCalledTimes(1);
      const ctx = transformer.mock.calls[0]?.[1] as PasteContext;
      expect(ctx.editor).toBe(mounted.editor);
      expect(ctx.plainText).toBe('');
      expect(ctx.event).toBeUndefined();
    });

    it('capture l’événement DOM et son texte brut quand il existe', () => {
      const transformer = vi.fn<PasteTransformer>((html) => html);
      mounted = mountEditor({ content: '<p></p>', pasteTransformers: [transformer] });
      mounted.editor.focus('end');
      const event = {
        clipboardData: { getData: (type: string) => (type === 'text/plain' ? 'brut' : '') },
      } as unknown as ClipboardEvent;
      mounted.editor.tiptap.view
        .someProp('handleDOMEvents')
        ?.paste?.(mounted.editor.tiptap.view, event);
      mounted.editor.tiptap.view.pasteHTML('<p>x</p>');
      const ctx = transformer.mock.calls[0]?.[1] as PasteContext;
      expect(ctx.plainText).toBe('brut');
      expect(ctx.event).toBe(event);
    });

    it('n’altère pas le HTML collé sans transformateur', () => {
      mounted = mountEditor({ content: '<p></p>' });
      mounted.editor.focus('end');
      mounted.editor.tiptap.view.pasteHTML('<p>tel <strong>quel</strong></p>');
      expect(mounted.editor.getHTML()).toBe('<p>tel <strong>quel</strong></p>');
    });
  });
});
