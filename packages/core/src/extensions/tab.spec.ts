import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TAB_COMMAND_IDS } from '../commands/layout.js';
import { en } from '../i18n/en.js';
import { fr } from '../i18n/fr.js';
import {
  TAB_CLASS,
  TAB_STOP_CSS_VARIABLE,
  canInsertTab,
  isTabNode,
  normalizeTabsInCodeBlocks,
  sanitizeTabAlign,
  sanitizeTabLeader,
  sanitizeTabStop,
  tabAttrs,
} from './tab.js';
import {
  bodyHtml,
  findNodePos,
  mountEditor,
  selectRange,
  type MountedEditor,
} from '../testing/mount.js';

const TAB = '<span data-tab=""></span>';
const STOPPED = '<span data-tab="" data-stop="36pt"></span>';
/** Les trois attributs, dans l'ordre figé par le contrat : taquet, alignement, points de suite. */
const FULL = '<span data-tab="" data-stop="36pt" data-align="right" data-leader="dot"></span>';

/**
 * Frappe une touche par le vrai chemin de ProseMirror (`handleKeyDown` de chaque plugin,
 * dans l'ordre), et rend vrai si un keymap l'a consommée. `commands.keyboardShortcut`
 * ne convient pas : il rend toujours vrai et ne rejoue que les pas, pas les sélections.
 */
function pressKey(mounted: MountedEditor, key: string): boolean {
  const { view } = mounted.editor.tiptap;
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  return view.someProp('handleKeyDown', (handler) => handler(view, event)) === true;
}

/** Les `span.aster-tab` rendus par le NodeView, dans l'ordre. */
function tabElements(mounted: MountedEditor): HTMLElement[] {
  return Array.from(
    mounted.editor.contentElement.querySelectorAll<HTMLElement>(`span.${TAB_CLASS}`),
  );
}

/** Place le curseur à la fin du premier bloc de texte dont le contenu est `text`. */
function cursorAtEndOf(mounted: MountedEditor, text: string): void {
  let target = -1;
  mounted.editor.tiptap.state.doc.descendants((node, pos) => {
    if (target < 0 && node.isTextblock && node.textContent === text) {
      target = pos + 1 + node.content.size;
    }
    return target < 0;
  });
  if (target < 0) {
    throw new Error(`bloc ${text} introuvable`);
  }
  selectRange(mounted.editor, target, target);
}

describe('Tab', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>a</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('sérialisation HTML', () => {
    it.each([
      ['sans taquet', `<p>a${TAB}b</p>`],
      ['avec taquet', `<p>a${STOPPED}b</p>`],
      ['deux tabulations consécutives', `<p>${TAB}${TAB}b</p>`],
      [
        'dans un titre et une cellule',
        `<h1>a${TAB}b</h1><table><tbody><tr><td><p>${STOPPED}c</p></td></tr></tbody></table>`,
      ],
      ['décimales du taquet', `<p>a<span data-tab="" data-stop="12.5pt"></span>b</p>`],
      ['taquet, alignement et points de suite', `<p>a${FULL}b</p>`],
      [
        'points de suite sans taquet',
        '<p>a<span data-tab="" data-leader="underscore"></span>b</p>',
      ],
      ['alignement décimal seul', '<p>a<span data-tab="" data-align="decimal"></span>b</p>'],
    ])('%s : rendu exact et idempotence stricte', (_name, html) => {
      mounted.editor.setHTML(html);
      expect(bodyHtml(mounted.editor)).toBe(html);
      mounted.editor.setHTML(mounted.editor.getHTML());
      expect(bodyHtml(mounted.editor)).toBe(html);
    });

    it('attributs du nœud : stopPt null par défaut, lu en points (px convertis)', () => {
      mounted.editor.setHTML(
        `<p>a${TAB}b${STOPPED}c<span data-tab="" data-stop="48px"></span></p>`,
      );
      const json = mounted.editor.getJSON();
      const tabs = json.content?.[0]?.content?.filter((node) => node.type === 'tab') ?? [];
      expect(tabs.map((node) => node.attrs)).toEqual([
        { stopPt: null, align: null, leader: null },
        { stopPt: 36, align: null, leader: null },
        { stopPt: 36, align: null, leader: null },
      ]);
    });

    it('un taquet invalide (négatif, hors bornes, texte) n’est pas émis', () => {
      mounted.editor.setHTML('<p>a<span data-tab="" data-stop="-3pt"></span>b</p>');
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}b</p>`);
      mounted.editor.setJSON({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'tab', attrs: { stopPt: 1e307 } },
              { type: 'tab', attrs: { stopPt: 'abc' } },
              { type: 'tab', attrs: { stopPt: 7.126 } },
            ],
          },
        ],
      });
      expect(mounted.editor.getHTML()).toBe(
        `<p>${TAB}${TAB}<span data-tab="" data-stop="7.13pt"></span></p>`,
      );
      expect(sanitizeTabStop(0)).toBe(0);
      expect(sanitizeTabStop(-1)).toBeNull();
      expect(sanitizeTabStop(Number.NaN)).toBeNull();
    });

    it('align left ou inconnu et leader inconnu ne sont pas émis ; ordre data-stop, data-align, data-leader', () => {
      // Attributs dans le désordre et `left` explicite : réémis dans l'ordre du contrat, sans `left`.
      mounted.editor.setHTML(
        '<p>a<span data-leader="dot" data-align="left" data-tab="" data-stop="36pt"></span>b</p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p>a<span data-tab="" data-stop="36pt" data-leader="dot"></span>b</p>',
      );
      mounted.editor.setHTML(
        '<p>a<span data-tab="" data-align="justify"></span><span data-tab="" data-align="RIGHT" data-leader="dots"></span>b</p>',
      );
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}${TAB}b</p>`);
      mounted.editor.setJSON({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'tab', attrs: { align: 'center', leader: 'hyphen' } },
              { type: 'tab', attrs: { stopPt: 72, align: 7, leader: null } },
            ],
          },
        ],
      });
      expect(mounted.editor.getHTML()).toBe(
        '<p><span data-tab="" data-align="center" data-leader="hyphen"></span><span data-tab="" data-stop="72pt"></span></p>',
      );
      const node = mounted.editor.tiptap.state.doc.nodeAt(findNodePos(mounted.editor, 'tab'));
      expect(node ? tabAttrs(node) : null).toEqual({
        stopPt: null,
        align: 'center',
        leader: 'hyphen',
      });
      expect(sanitizeTabAlign('left')).toBeNull();
      expect(sanitizeTabAlign('decimal')).toBe('decimal');
      expect(sanitizeTabLeader('underscore')).toBe('underscore');
      expect(sanitizeTabLeader(' dot')).toBeNull();
    });

    it('le contenu textuel d’un span data-tab chargé est ignoré (atome)', () => {
      mounted.editor.setHTML('<p>a<span data-tab="">    </span>b</p>');
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}b</p>`);
    });

    it('getText rend \\t, tiptap.getText aussi, getHTML resolve ne touche pas aux tabulations', () => {
      mounted.editor.setHTML(
        `<p>a${TAB}b</p><p><span data-aster-variable="v">{{v}}</span>${STOPPED}c</p>`,
      );
      expect(mounted.editor.getText()).toBe('a\tb\n{{v}}\tc');
      expect(mounted.editor.tiptap.getText()).toBe('a\tb\n\n{{v}}\tc');
      mounted.editor.variables.setValues({ v: 'V' });
      expect(mounted.editor.getHTML({ variables: 'resolve' })).toBe(
        `<p>a${TAB}b</p><p>V${STOPPED}c</p>`,
      );
      expect(mounted.editor.getHTML()).toContain('data-aster-variable');
    });
  });

  describe('NodeView', () => {
    it('rend span.aster-tab non éditable avec la largeur de repli, et le taquet quand il est connu', () => {
      mounted.editor.setHTML(`<p>a${TAB}b${STOPPED}c</p>`);
      const [plain, stopped] = tabElements(mounted);
      expect(plain?.getAttribute('contenteditable')).toBe('false');
      expect(plain?.getAttribute('data-tab')).toBe('');
      expect(plain?.style.display).toBe('inline-block');
      expect(plain?.style.minWidth).toBe('2em');
      expect(plain?.hasAttribute('data-stop')).toBe(false);
      expect(plain?.style.getPropertyValue(TAB_STOP_CSS_VARIABLE)).toBe('');
      expect(stopped?.getAttribute('data-stop')).toBe('36pt');
      expect(stopped?.style.getPropertyValue(TAB_STOP_CSS_VARIABLE)).toBe('36pt');
      expect(stopped?.style.minWidth).toBe('2em');
    });

    it('reflète une mise à jour du taquet sans recréer le DOM', () => {
      mounted.editor.setHTML(`<p>a${TAB}b</p>`);
      const [el] = tabElements(mounted);
      const pos = findNodePos(mounted.editor, 'tab');
      const { state, view } = mounted.editor.tiptap;
      view.dispatch(state.tr.setNodeMarkup(pos, undefined, { stopPt: 72 }));
      expect(tabElements(mounted)[0]).toBe(el);
      expect(el?.style.getPropertyValue(TAB_STOP_CSS_VARIABLE)).toBe('72pt');
      expect(mounted.editor.getHTML()).toBe('<p>a<span data-tab="" data-stop="72pt"></span>b</p>');
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { stopPt: null }));
      expect(el?.hasAttribute('data-stop')).toBe(false);
      expect(el?.style.getPropertyValue(TAB_STOP_CSS_VARIABLE)).toBe('');
    });

    it('reflète data-align et data-leader, retirés quand ils ne sont plus connus', () => {
      mounted.editor.setHTML(`<p>a${FULL}b</p>`);
      const [el] = tabElements(mounted);
      expect(el?.getAttribute('data-align')).toBe('right');
      expect(el?.getAttribute('data-leader')).toBe('dot');
      const pos = findNodePos(mounted.editor, 'tab');
      const { view } = mounted.editor.tiptap;
      view.dispatch(view.state.tr.setNodeMarkup(pos, undefined, { stopPt: 36 }));
      expect(tabElements(mounted)[0]).toBe(el);
      expect(el?.hasAttribute('data-align')).toBe(false);
      expect(el?.hasAttribute('data-leader')).toBe(false);
      expect(el?.getAttribute('data-stop')).toBe('36pt');
    });
  });

  describe('touche Tab', () => {
    beforeEach(() => {
      mounted.cleanup();
      mounted = mountEditor({ content: '<p>a</p>', tabKey: 'insert' });
    });

    it("par défaut (tabKey 'focus'), Tab n'est pas consommée et n'insère rien", () => {
      mounted.cleanup();
      mounted = mountEditor({ content: '<p>a</p>' });
      cursorAtEndOf(mounted, 'a');
      expect(pressKey(mounted, 'Tab')).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>a</p>');
      // La commande programmatique reste disponible dans les deux modes.
      expect(mounted.editor.commands.run('text.insertTab')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}</p>`);
    });

    it('insère une tabulation dans un paragraphe et un titre', () => {
      cursorAtEndOf(mounted, 'a');
      expect(pressKey(mounted, 'Tab')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}</p>`);
      mounted.editor.setHTML('<h2>t</h2>');
      selectRange(mounted.editor, 1, 1);
      expect(pressKey(mounted, 'Tab')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(`<h2>${TAB}t</h2>`);
    });

    it('dans une liste, Tab garde sinkListItem et n’insère rien', () => {
      mounted.editor.setHTML('<ul><li><p>un</p></li><li><p>deux</p></li></ul>');
      cursorAtEndOf(mounted, 'deux');
      expect(pressKey(mounted, 'Tab')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(
        '<ul><li><p>un</p><ul><li><p>deux</p></li></ul></li></ul>',
      );
      // Premier item : impossible d'indenter, la touche n'est pas consommée, pas de tabulation.
      cursorAtEndOf(mounted, 'un');
      expect(pressKey(mounted, 'Tab')).toBe(false);
      expect(mounted.editor.getHTML()).not.toContain('data-tab');
    });

    it('dans une liste de tâches, Tab n’insère pas de tabulation', () => {
      mounted.editor.setHTML(
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="false"><p>un</p></li></ul>',
      );
      cursorAtEndOf(mounted, 'un');
      expect(pressKey(mounted, 'Tab')).toBe(false);
      expect(mounted.editor.getHTML()).not.toContain('data-tab');
    });

    it('dans une cellule, Tab garde la navigation de table', () => {
      mounted.editor.setHTML(
        '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>',
      );
      cursorAtEndOf(mounted, 'a');
      expect(pressKey(mounted, 'Tab')).toBe(true);
      expect(mounted.editor.tiptap.state.selection.$from.parent.textContent).toBe('b');
      // Dernière cellule : une ligne est ajoutée, jamais une tabulation.
      expect(pressKey(mounted, 'Tab')).toBe(true);
      expect(mounted.editor.getHTML()).not.toContain('data-tab');
      expect((mounted.editor.getHTML().match(/<tr>/g) ?? []).length).toBe(2);
    });

    it('Tab remplace une sélection de texte', () => {
      selectRange(mounted.editor, 1, 2);
      expect(pressKey(mounted, 'Tab')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>${TAB}</p>`);
    });
  });

  describe('Backspace et Delete', () => {
    it('Backspace après une tabulation l’efface d’un coup', () => {
      mounted.editor.setHTML(`<p>a${TAB}b</p>`);
      selectRange(mounted.editor, 3, 3);
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>ab</p>');
    });

    it('Delete avant une tabulation l’efface', () => {
      mounted.editor.setHTML(`<p>a${STOPPED}b</p>`);
      selectRange(mounted.editor, 2, 2);
      expect(pressKey(mounted, 'Delete')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>ab</p>');
    });

    it('Backspace ailleurs garde son comportement (ici la jonction de deux paragraphes)', () => {
      mounted.editor.setHTML(`<p>a</p><p>${TAB}b</p>`);
      selectRange(mounted.editor, 4, 4);
      expect(pressKey(mounted, 'Backspace')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}b</p>`);
      // Une sélection non vide n'est pas traitée par le raccourci de tabulation.
      selectRange(mounted.editor, 1, 3);
      expect(pressKey(mounted, 'Delete')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>b</p>');
    });
  });

  describe('commande text.insertTab', () => {
    it('est enregistrée hors contrat avec ses libellés', () => {
      expect(TAB_COMMAND_IDS).toEqual(['text.insertTab']);
      expect(mounted.editor.commands.has('text.insertTab')).toBe(true);
      expect(fr['command.text.insertTab']).toBeTruthy();
      expect(en['command.text.insertTab']).toBeTruthy();
    });

    it('insère une tabulation, avec taquet valide, même dans une liste', () => {
      cursorAtEndOf(mounted, 'a');
      expect(mounted.editor.commands.canRun('text.insertTab')).toBe(true);
      expect(mounted.editor.commands.run('text.insertTab')).toBe(true);
      expect(mounted.editor.commands.run('text.insertTab', { stopPt: 36 })).toBe(true);
      expect(mounted.editor.commands.run('text.insertTab', { stopPt: -5 })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(`<p>a${TAB}${STOPPED}${TAB}</p>`);
      mounted.editor.setHTML('<ul><li><p>un</p></li></ul>');
      cursorAtEndOf(mounted, 'un');
      expect(mounted.editor.commands.run('text.insertTab')).toBe(true);
      expect(bodyHtml(mounted.editor)).toBe(`<ul><li><p>un${TAB}</p></li></ul>`);
      const node = mounted.editor.tiptap.state.doc.nodeAt(findNodePos(mounted.editor, 'tab'));
      expect(isTabNode(node)).toBe(true);
      expect(node ? tabAttrs(node) : null).toEqual({ stopPt: null, align: null, leader: null });
    });

    it('accepte align et leader, dans l’ordre du contrat ; left et valeurs inconnues ignorés', () => {
      cursorAtEndOf(mounted, 'a');
      expect(
        mounted.editor.commands.run('text.insertTab', {
          stopPt: 36,
          align: 'right',
          leader: 'dot',
        }),
      ).toBe(true);
      expect(mounted.editor.commands.run('text.insertTab', { align: 'left', leader: 'x' })).toBe(
        true,
      );
      expect(mounted.editor.commands.run('text.insertTab', { leader: 'underscore' })).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        `<p>a${FULL}${TAB}<span data-tab="" data-leader="underscore"></span></p>`,
      );
    });

    it('est refusée en lecture seule', () => {
      mounted.editor.setReadOnly(true);
      expect(mounted.editor.commands.canRun('text.insertTab')).toBe(false);
      expect(mounted.editor.commands.run('text.insertTab')).toBe(false);
    });
  });

  describe('bloc de code (R41-04)', () => {
    const CODE = '<pre><code>a</code></pre>';

    it('la touche Tab et text.insertTab sont refusées dans un bloc de code, qui n’est pas scindé', () => {
      mounted.editor.setHTML(CODE);
      cursorAtEndOf(mounted, 'a');
      expect(canInsertTab(mounted.editor.tiptap.state)).toBe(false);
      expect(pressKey(mounted, 'Tab')).toBe(false);
      expect(bodyHtml(mounted.editor)).toBe(CODE);
      expect(mounted.editor.commands.canRun('text.insertTab')).toBe(false);
      expect(mounted.editor.commands.run('text.insertTab')).toBe(false);
      expect(bodyHtml(mounted.editor)).toBe(CODE);
      // Dans un paragraphe, rien ne change.
      mounted.editor.setHTML('<p>a</p>');
      cursorAtEndOf(mounted, 'a');
      expect(canInsertTab(mounted.editor.tiptap.state)).toBe(true);
      expect(mounted.editor.commands.canRun('text.insertTab')).toBe(true);
    });

    it('au chargement, une tabulation dans un bloc de code devient le texte \\t, sans scission', () => {
      mounted.editor.setHTML(`<pre><code>a${TAB}b</code></pre>`);
      expect(bodyHtml(mounted.editor)).toBe('<pre><code>a\tb</code></pre>');
      // Le `\n` final est le paragraphe vide que TrailingNode ajoute après un bloc de code.
      expect(mounted.editor.getText()).toBe('a\tb\n');
      mounted.editor.setHTML(mounted.editor.getHTML());
      expect(bodyHtml(mounted.editor)).toBe('<pre><code>a\tb</code></pre>');
      // Contenu initial et insertHTML passent par la même normalisation ; le contenu
      // textuel d'un span hôte est ignoré comme pour l'atome.
      const other = mountEditor({
        content: `<pre><code>x<span data-tab="" data-stop="36pt">zzz</span>y</code></pre>`,
      });
      expect(bodyHtml(other.editor)).toBe('<pre><code>x\ty</code></pre>');
      other.cleanup();
      mounted.editor.setHTML('<p>a</p>');
      cursorAtEndOf(mounted, 'a');
      mounted.editor.insertHTML(`<pre><code>c${TAB}d</code></pre>`);
      expect(mounted.editor.getHTML()).toContain('<pre><code>c\td</code></pre>');
    });

    it('normalizeTabsInCodeBlocks ne touche qu’aux tabulations des pre et rend la même chaîne sinon', () => {
      const plain = `<p>a${TAB}b</p>`;
      expect(normalizeTabsInCodeBlocks(plain)).toBe(plain);
      expect(normalizeTabsInCodeBlocks(CODE)).toBe(CODE);
      expect(normalizeTabsInCodeBlocks(`${plain}${CODE}`)).toBe(`${plain}${CODE}`);
      expect(normalizeTabsInCodeBlocks(`${plain}<pre><code>c${STOPPED}d${TAB}</code></pre>`)).toBe(
        `${plain}<pre><code>c\td\t</code></pre>`,
      );
    });
  });
});
