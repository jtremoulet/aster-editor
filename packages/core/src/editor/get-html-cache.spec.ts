import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeOutputHtml } from '../html/normalize-output';
import { mountEditor, selectRange, type MountedEditor } from '../testing/mount';

// Espion sur le module entier : l'éditeur importe `normalizeOutputHtml` par liaison
// vive, l'espion compte donc bien les appels faits depuis `getHTML()`.
vi.mock(import('../html/normalize-output'), { spy: true });

// Se termine par un paragraphe : sinon `TrailingNode` en ajouterait un à la première
// transaction, ce qui est un vrai changement de document, pas un défaut du cache.
const TABLE =
  '<p>Avant</p>' +
  '<table><tbody><tr><th><p>A</p></th><th><p>B</p></th></tr>' +
  '<tr><td><p>c</p></td><td><p>d</p></td></tr></tbody></table>' +
  '<p>Après</p>';

describe('cache de getHTML', () => {
  let mounted: MountedEditor;
  const normalize = vi.mocked(normalizeOutputHtml);

  beforeEach(() => {
    mounted = mountEditor({ content: TABLE });
    normalize.mockClear();
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('ne normalise qu’une fois tant qu’aucune transaction ne change le document', () => {
    const first = mounted.editor.getHTML();
    const second = mounted.editor.getHTML();
    expect(second).toBe(first);
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it('ignore un déplacement de sélection et un passage en lecture seule', () => {
    mounted.editor.getHTML();
    selectRange(mounted.editor, 1, 1);
    mounted.editor.setReadOnly(true);
    mounted.editor.setReadOnly(false);
    mounted.editor.getHTML();
    expect(normalize).toHaveBeenCalledTimes(1);
  });

  it('recalcule après une frappe', () => {
    const before = mounted.editor.getHTML();
    mounted.editor.focus('end');
    mounted.editor.tiptap.commands.insertContent('x');
    const after = mounted.editor.getHTML();
    expect(after).not.toBe(before);
    expect(after).toContain('x');
    expect(normalize).toHaveBeenCalledTimes(2);
    mounted.editor.getHTML();
    expect(normalize).toHaveBeenCalledTimes(2);
  });
});
