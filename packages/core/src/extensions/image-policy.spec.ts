import { afterEach, describe, expect, it } from 'vitest';

// jsdom 30 ne définit pas `ClipboardEvent`, que `view.pasteHTML` instancie pour
// simuler un collage. Un squelette sur `Event` suffit : rien ne lit `clipboardData`.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  Object.assign(globalThis, {
    ClipboardEvent: class extends Event {
      readonly clipboardData = null;
    },
  });
}
import { mountEditor, type MountedEditor } from '../testing/mount.js';

/** Sources d'image et verdict attendu avec la politique par défaut. */
const CASES: readonly [src: string, allowed: boolean][] = [
  ['javascript:alert(1)', false],
  ['java\tscript:alert(1)', false],
  ['data:text/html,x', false],
  ['data:image/png;base64,AA==', true],
  ['blob:https://example.com/uuid', true],
  ['https://example.com/a.png', true],
  ['/relative.png', true],
];

describe('politique d’images au parsing', () => {
  let mounted: MountedEditor;

  afterEach(() => {
    mounted.cleanup();
  });

  describe('setHTML', () => {
    it.each(CASES)('%s → image conservée : %s', (src, allowed) => {
      mounted = mountEditor();
      mounted.editor.setHTML(`<p>a</p><img src="${src}" alt="x">`);
      const html = mounted.editor.getHTML();
      expect(html.includes('<img')).toBe(allowed);
      if (allowed) {
        expect(html).toContain(`src="${src.replace(/\t/g, '')}"`);
      }
      expect(html).toContain('<p>a</p>');
    });
  });

  describe('collage', () => {
    it.each(CASES)('%s → image collée : %s', (src, allowed) => {
      mounted = mountEditor({ content: '<p></p>' });
      mounted.editor.focus('end');
      mounted.editor.tiptap.view.pasteHTML(`<img src="${src}">`);
      expect(mounted.editor.getHTML().includes('<img')).toBe(allowed);
    });
  });

  it('suit une politique custom pour les protocoles web', () => {
    mounted = mountEditor({ linkPolicy: { allowedProtocols: ['https'] } });
    mounted.editor.setHTML(
      '<p>a</p><img src="http://example.com/a.png"><img src="https://example.com/b.png">',
    );
    const html = mounted.editor.getHTML();
    expect(html).not.toContain('http://example.com/a.png');
    expect(html).toContain('https://example.com/b.png');
  });
});
