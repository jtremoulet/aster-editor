import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AsterOptions } from '@aster-editor/core';
import type * as Core from '@aster-editor/core';
import { createEditor } from '@aster-editor/core';
import { createAster } from '../create-aster.js';
import { createMockEditor, type MockEditor } from '../testing/mock-editor.js';
import { createToolbar, registerUiTranslations } from '../toolbar/create-toolbar.js';
import {
  SOURCE_TEXTAREA_CLASS,
  SOURCE_VIEW_CLASS,
  createSourceButton,
  createSourceView,
  formatSourceHtml,
  getSourceView,
  releaseSourceView,
  retainSourceView,
} from './source-view.js';

vi.mock('@aster-editor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof Core>();
  return { ...actual, createEditor: vi.fn() };
});

describe('formatSourceHtml', () => {
  it('indente les blocs et garde le contenu inline sur la ligne de son bloc', () => {
    const html = '<h1>Titre</h1><p>Un <strong>mot</strong> et<br>suite</p><p></p>';
    expect(formatSourceHtml(html)).toBe(
      ['<h1>Titre</h1>', '<p>Un <strong>mot</strong> et<br>suite</p>', '<p></p>'].join('\n'),
    );
  });

  it('imbrique listes et tableaux', () => {
    const html = '<ul><li><p>a</p></li><li><p>b</p><ul><li><p>c</p></li></ul></li></ul>';
    expect(formatSourceHtml(html)).toBe(
      [
        '<ul>',
        '  <li>',
        '    <p>a</p>',
        '  </li>',
        '  <li>',
        '    <p>b</p>',
        '    <ul>',
        '      <li>',
        '        <p>c</p>',
        '      </li>',
        '    </ul>',
        '  </li>',
        '</ul>',
      ].join('\n'),
    );
    const table = '<table><tbody><tr><th><p>h</p></th><td><p>d</p></td></tr></tbody></table>';
    expect(formatSourceHtml(table, '\t')).toBe(
      [
        '<table>',
        '\t<tbody>',
        '\t\t<tr>',
        '\t\t\t<th>',
        '\t\t\t\t<p>h</p>',
        '\t\t\t</th>',
        '\t\t\t<td>',
        '\t\t\t\t<p>d</p>',
        '\t\t\t</td>',
        '\t\t</tr>',
        '\t</tbody>',
        '</table>',
      ].join('\n'),
    );
  });

  it('isole les balises vides et préserve l’intérieur de <pre>', () => {
    const html = '<p>a</p><hr><img src="x.png"><pre><code>if (x) {\n  y();\n}</code></pre><p>b</p>';
    expect(formatSourceHtml(html)).toBe(
      [
        '<p>a</p>',
        '<hr>',
        '<img src="x.png">',
        '<pre><code>if (x) {\n  y();\n}</code></pre>',
        '<p>b</p>',
      ].join('\n'),
    );
  });

  it('ignore les blancs entre blocs d’un HTML déjà indenté et tolère un texte nu', () => {
    expect(formatSourceHtml('<ul>\n  <li>\n    <p>a</p>\n  </li>\n</ul>')).toBe(
      '<ul>\n  <li>\n    <p>a</p>\n  </li>\n</ul>',
    );
    expect(formatSourceHtml('texte seul')).toBe('texte seul');
    expect(formatSourceHtml('')).toBe('');
    expect(formatSourceHtml('<p>a</p></p>')).toBe('<p>a</p>\n</p>');
  });
});

describe('vue source', () => {
  let editor: MockEditor;
  let host: HTMLElement;

  beforeEach(() => {
    editor = createMockEditor();
    registerUiTranslations(editor);
    host = document.createElement('div');
    host.className = 'aster';
    host.append(editor.element);
    document.body.append(host);
    editor.contentElement.innerHTML = '<p>Bonjour</p>';
  });

  afterEach(() => {
    getSourceView(editor).destroy();
    host.remove();
    vi.clearAllMocks();
  });

  const textarea = (): HTMLTextAreaElement | null =>
    editor.element.querySelector<HTMLTextAreaElement>(`.${SOURCE_TEXTAREA_CLASS}`);

  describe('contrôleur', () => {
    it('getSourceView partage une instance par éditeur', () => {
      expect(getSourceView(editor)).toBe(getSourceView(editor));
      expect(getSourceView(createMockEditor())).not.toBe(getSourceView(editor));
    });

    it('enter masque le contenu, ajoute le textarea formaté, passe en lecture seule et marque la racine', () => {
      const view = getSourceView(editor);
      const listener = vi.fn();
      view.onChange(listener);
      view.enter();
      expect(view.isActive()).toBe(true);
      expect(textarea()).toBe(view.textarea);
      expect(textarea()?.value).toBe('<p>Bonjour</p>');
      expect(textarea()?.getAttribute('aria-label')).toBe('HTML source');
      expect(editor.contentElement.hasAttribute('hidden')).toBe(true);
      expect(editor.isReadOnly()).toBe(true);
      expect(host.classList.contains(SOURCE_VIEW_CLASS)).toBe(true);
      expect(document.activeElement).toBe(textarea());
      expect(listener).toHaveBeenCalledTimes(1);
      // Idempotent.
      view.enter();
      expect(editor.element.querySelectorAll(`.${SOURCE_TEXTAREA_CLASS}`).length).toBe(1);
    });

    it('exit applique le HTML modifié, rend l’édition et le focus', () => {
      const view = getSourceView(editor);
      const changes = vi.fn();
      editor.on('change', changes);
      view.enter();
      view.textarea!.value = '<p>Salut</p>';
      view.exit();
      expect(view.isActive()).toBe(false);
      expect(textarea()).toBeNull();
      expect(editor.contentElement.hasAttribute('hidden')).toBe(false);
      expect(editor.isReadOnly()).toBe(false);
      expect(host.classList.contains(SOURCE_VIEW_CLASS)).toBe(false);
      expect(editor.getText()).toBe('<p>Salut</p>');
      expect(changes).toHaveBeenCalledTimes(1);
      expect(editor.focusCalls).toBe(1);
    });

    it('exit sans modification ne touche pas au document', () => {
      const view = getSourceView(editor);
      const changes = vi.fn();
      editor.on('change', changes);
      view.toggle();
      view.toggle();
      expect(changes).not.toHaveBeenCalled();
      expect(editor.contentElement.innerHTML).toBe('<p>Bonjour</p>');
    });

    it('refuse d’entrer en lecture seule', () => {
      editor.setReadOnly(true);
      const view = getSourceView(editor);
      view.enter();
      expect(view.isActive()).toBe(false);
      expect(textarea()).toBeNull();
    });

    it('destroy quitte la vue sans appliquer, rend l’édition et oublie l’instance', () => {
      const view = getSourceView(editor);
      const listener = vi.fn();
      view.onChange(listener);
      view.enter();
      view.textarea!.value = '<p>Perdu</p>';
      expect(editor.isReadOnly()).toBe(true);
      view.destroy();
      expect(textarea()).toBeNull();
      expect(editor.contentElement.hasAttribute('hidden')).toBe(false);
      expect(editor.contentElement.innerHTML).toBe('<p>Bonjour</p>');
      expect(editor.isReadOnly()).toBe(false);
      expect(host.classList.contains(SOURCE_VIEW_CLASS)).toBe(false);
      expect(listener).toHaveBeenCalledTimes(2);
      expect(getSourceView(editor)).not.toBe(view);
      view.enter();
      expect(textarea()).toBeNull();
    });

    it('destroy hors vue source ne touche pas à la lecture seule posée par l’intégrateur', () => {
      const view = getSourceView(editor);
      editor.setReadOnly(true);
      view.destroy();
      expect(editor.isReadOnly()).toBe(true);
    });

    it('retainSourceView / releaseSourceView : le dernier utilisateur détruit le contrôleur', () => {
      const first = retainSourceView(editor);
      const second = retainSourceView(editor);
      expect(first).toBe(second);
      first.enter();
      releaseSourceView(first);
      expect(first.isActive()).toBe(true);
      expect(getSourceView(editor)).toBe(first);
      releaseSourceView(second);
      expect(first.isActive()).toBe(false);
      expect(editor.isReadOnly()).toBe(false);
      expect(getSourceView(editor)).not.toBe(first);
      // Libérer un contrôleur obtenu par `getSourceView` (jamais retenu) le détruit aussi.
      const bare = getSourceView(editor);
      releaseSourceView(bare);
      expect(getSourceView(editor)).not.toBe(bare);
    });

    it('masque le conteneur .aster-content quand le contenteditable y vit', () => {
      const container = document.createElement('div');
      container.className = 'aster-content';
      editor.element.append(container);
      container.append(editor.contentElement);
      const view = createSourceView(editor);
      view.enter();
      expect(container.hasAttribute('hidden')).toBe(true);
      expect(editor.contentElement.hasAttribute('hidden')).toBe(false);
      view.exit();
      expect(container.hasAttribute('hidden')).toBe(false);
    });
  });

  describe('widget source dans la toolbar', () => {
    it('bascule la vue, reste actif pendant que le reste de la toolbar est désactivé', () => {
      const container = document.createElement('div');
      host.prepend(container);
      const toolbar = createToolbar(editor, container, [
        ['bold'],
        [{ type: 'widget', widget: 'source' }],
      ]);
      const bold = container.querySelector<HTMLButtonElement>('[data-command="bold"]')!;
      const source = container.querySelector<HTMLButtonElement>('.aster-source-button')!;
      expect(source.getAttribute('aria-label')).toBe('Show HTML source');
      expect(source.getAttribute('aria-pressed')).toBe('false');
      source.click();
      expect(source.getAttribute('aria-pressed')).toBe('true');
      expect(source.disabled).toBe(false);
      expect(bold.disabled).toBe(true);
      expect(getSourceView(editor).isActive()).toBe(true);
      source.click();
      expect(source.getAttribute('aria-pressed')).toBe('false');
      expect(bold.disabled).toBe(false);
      toolbar.destroy();
    });

    it('toolbar.destroy() pendant la vue source la quitte et rend l’édition', () => {
      const container = document.createElement('div');
      host.prepend(container);
      const toolbar = createToolbar(editor, container, [
        ['bold'],
        [{ type: 'widget', widget: 'source' }],
      ]);
      container.querySelector<HTMLButtonElement>('.aster-source-button')!.click();
      expect(textarea()).not.toBeNull();
      expect(editor.isReadOnly()).toBe(true);
      toolbar.destroy();
      expect(textarea()).toBeNull();
      expect(editor.contentElement.hasAttribute('hidden')).toBe(false);
      expect(editor.isReadOnly()).toBe(false);
      expect(host.classList.contains(SOURCE_VIEW_CLASS)).toBe(false);
    });

    it('deux boutons source partagent le contrôleur, détruit avec le dernier', () => {
      const a = createSourceButton(editor);
      const b = createSourceButton(editor);
      const view = getSourceView(editor);
      view.enter();
      a.destroy();
      expect(view.isActive()).toBe(true);
      expect((b.element as HTMLButtonElement).getAttribute('aria-pressed')).toBe('true');
      b.destroy();
      expect(view.isActive()).toBe(false);
      expect(editor.isReadOnly()).toBe(false);
    });

    it('est désactivé si l’éditeur est en lecture seule hors vue source', () => {
      const widget = createSourceButton(editor);
      const button = widget.element as HTMLButtonElement;
      editor.setReadOnly(true);
      widget.update();
      expect(button.disabled).toBe(true);
      button.click();
      expect(getSourceView(editor).isActive()).toBe(false);
      widget.destroy();
    });

    it('suit les changements du contrôleur et se désabonne au destroy', () => {
      const widget = createSourceButton(editor);
      const button = widget.element as HTMLButtonElement;
      const view = getSourceView(editor);
      view.enter();
      expect(button.getAttribute('aria-pressed')).toBe('true');
      widget.destroy();
      view.exit();
      expect(button.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('via createAster', () => {
    it('expose toggleSource / isSourceView et nettoie au destroy', () => {
      const mock = createMockEditor();
      mock.contentElement.innerHTML = '<p>x</p>';
      vi.mocked(createEditor).mockImplementation((options: AsterOptions) => {
        options.element.append(mock.element);
        return mock;
      });
      const root = document.createElement('div');
      document.body.append(root);
      const instance = createAster(root, { toolbar: 'full' });
      expect(instance.isSourceView()).toBe(false);
      instance.toggleSource();
      expect(instance.isSourceView()).toBe(true);
      expect(instance.element.classList.contains(SOURCE_VIEW_CLASS)).toBe(true);
      expect(
        instance.element.querySelector('.aster-source-button')?.getAttribute('aria-pressed'),
      ).toBe('true');
      // La toolbar `full` porte un bouton `source` : sa destruction ne doit pas détruire
      // le contrôleur tant que l'instance `createAster` le retient.
      instance.toolbar?.destroy();
      expect(instance.isSourceView()).toBe(true);
      instance.destroy();
      expect(mock.element.querySelector(`.${SOURCE_TEXTAREA_CLASS}`)).toBeNull();
      expect(mock.isReadOnly()).toBe(false);
      root.remove();
    });
  });
});
