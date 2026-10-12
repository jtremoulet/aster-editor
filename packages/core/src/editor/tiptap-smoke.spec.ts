import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Placeholder } from '@tiptap/extensions';
import { describe, expect, it } from 'vitest';

/**
 * Smoke test de phase 0 : vérifie que Tiptap 3 fonctionne sous jsdom avec notre
 * config TypeScript. Si ce test casse, aucun lot ne peut démarrer.
 */
describe('Tiptap 3 sous jsdom', () => {
  it('monte un éditeur, insère du contenu et le sérialise en HTML', () => {
    const element = document.createElement('div');
    document.body.appendChild(element);
    const editor = new Editor({
      element,
      extensions: [StarterKit, TableKit, Placeholder.configure({ placeholder: 'Vide' })],
      content: '<p>Bonjour</p>',
    });

    editor.commands.setContent('<h1>Titre</h1><p>Texte <strong>gras</strong></p>');
    editor.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: true });

    const html = editor.getHTML();
    expect(html).toContain('<h1>Titre</h1>');
    expect(html).toContain('<strong>gras</strong>');
    expect(html).toContain('<table');
    expect(editor.isEditable).toBe(true);

    editor.destroy();
    expect(editor.isDestroyed).toBe(true);
    element.remove();
  });
});
