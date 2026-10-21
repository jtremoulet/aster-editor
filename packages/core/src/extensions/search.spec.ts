import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SEARCH_OPEN_EVENT,
  getSearchStorage,
  type SearchOpenEventDetail,
} from '../commands/search.js';
import { mountEditor, selectRange, type MountedEditor } from '../testing/mount.js';
import {
  SEARCH_CURRENT_CLASS,
  SEARCH_MATCH_CLASS,
  findMatches,
  scrollCurrentIntoView,
} from './search.js';

const CONTENT = '<p>Le chat dort. Le Chat ronfle.</p><h2>chat perché</h2>';

describe('recherche / remplacement', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: CONTENT });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  const tiptap = (): MountedEditor['editor']['tiptap'] => mounted.editor.tiptap;
  const storage = (): ReturnType<typeof getSearchStorage> => getSearchStorage(mounted.editor);
  const highlighted = (): HTMLElement[] =>
    Array.from(
      mounted.editor.contentElement.querySelectorAll<HTMLElement>(`.${SEARCH_MATCH_CLASS}`),
    );
  const current = (): HTMLElement | null =>
    mounted.editor.contentElement.querySelector<HTMLElement>(`.${SEARCH_CURRENT_CLASS}`);

  describe('findMatches', () => {
    it('trouve les correspondances bloc par bloc, insensible à la casse par défaut', () => {
      const matches = findMatches(tiptap().state.doc, 'chat');
      expect(matches).toHaveLength(3);
      expect(matches[0]).toEqual({ from: 4, to: 8 });
      // Le texte à ces positions est bien la requête.
      for (const match of matches) {
        expect(tiptap().state.doc.textBetween(match.from, match.to).toLowerCase()).toBe('chat');
      }
    });

    it('respecte la casse sur demande et ignore une requête vide', () => {
      expect(findMatches(tiptap().state.doc, 'Chat', true)).toHaveLength(1);
      expect(findMatches(tiptap().state.doc, '')).toEqual([]);
    });

    it('ne traverse pas une frontière de bloc et traite la requête littéralement', () => {
      expect(findMatches(tiptap().state.doc, 'ronfle.chat')).toEqual([]);
      expect(findMatches(tiptap().state.doc, 'dort.')).toHaveLength(1);
      expect(findMatches(tiptap().state.doc, '.*')).toEqual([]);
    });

    it('mappe correctement les positions après un saut de ligne', () => {
      mounted.editor.setHTML('<p>ab<br>chat</p>');
      const [match] = findMatches(tiptap().state.doc, 'chat');
      expect(match).toBeDefined();
      expect(tiptap().state.doc.textBetween(match!.from, match!.to)).toBe('chat');
    });
  });

  describe('setSearchQuery', () => {
    it('remplit le storage, décore les correspondances et marque la première comme courante', () => {
      expect(tiptap().commands.setSearchQuery('chat')).toBe(true);
      expect(storage().query).toBe('chat');
      expect(storage().matches).toHaveLength(3);
      expect(storage().currentIndex).toBe(0);
      expect(highlighted()).toHaveLength(3);
      expect(current()?.textContent).toBe('chat');
      expect(tiptap().state.selection.from).toBe(4);
    });

    it('démarre à la première correspondance après le curseur', () => {
      selectRange(mounted.editor, 10, 10);
      tiptap().commands.setSearchQuery('chat');
      expect(storage().currentIndex).toBe(1);
      expect(current()?.textContent).toBe('Chat');
    });

    it('respecte la casse et retombe sur aucune correspondance', () => {
      tiptap().commands.setSearchQuery('CHAT', { caseSensitive: true });
      expect(storage().matches).toEqual([]);
      expect(storage().currentIndex).toBe(-1);
      expect(highlighted()).toHaveLength(0);
    });

    it('can() ne modifie pas le storage', () => {
      expect(tiptap().can().setSearchQuery('chat')).toBe(true);
      expect(storage().query).toBe('');
    });
  });

  describe('navigation', () => {
    it('nextMatch et previousMatch cyclent et déplacent la sélection', () => {
      tiptap().commands.setSearchQuery('chat');
      expect(tiptap().commands.nextMatch()).toBe(true);
      expect(storage().currentIndex).toBe(1);
      tiptap().commands.nextMatch();
      expect(storage().currentIndex).toBe(2);
      expect(tiptap().state.selection.from).toBe(storage().matches[2]?.from);
      tiptap().commands.nextMatch();
      expect(storage().currentIndex).toBe(0);
      tiptap().commands.previousMatch();
      expect(storage().currentIndex).toBe(2);
      expect(current()?.closest('h2')).not.toBeNull();
    });

    it('échouent sans correspondance', () => {
      expect(tiptap().commands.nextMatch()).toBe(false);
      expect(tiptap().commands.previousMatch()).toBe(false);
      expect(tiptap().can().nextMatch()).toBe(false);
    });

    it('L52 (retour n° 5b) : la correspondance courante défile à l’écran même sans focus dans l’éditeur', () => {
      // jsdom n'implémente pas `scrollIntoView` : on l'observe sur le prototype.
      const scrolled: Element[] = [];
      const spy = vi.fn(function (this: Element) {
        scrolled.push(this);
      });
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        configurable: true,
        value: spy,
      });
      try {
        // Le focus est ailleurs (champ du bandeau) : ProseMirror n'écrit pas la sélection
        // dans le DOM et ignore `tr.scrollIntoView()` ; le plugin fait défiler lui-même.
        const input = document.createElement('input');
        document.body.append(input);
        input.focus();
        expect(document.activeElement).toBe(input);
        tiptap().commands.setSearchQuery('chat');
        expect(spy).toHaveBeenCalledTimes(1);
        expect(spy).toHaveBeenLastCalledWith({ block: 'center', inline: 'nearest' });
        expect(scrolled[0]).toBe(current());
        tiptap().commands.nextMatch();
        expect(spy).toHaveBeenCalledTimes(2);
        expect(scrolled[1]).toBe(current());
        expect(scrolled[1]).not.toBe(scrolled[0]);
        tiptap().commands.previousMatch();
        expect(spy).toHaveBeenCalledTimes(3);
        tiptap().commands.replaceCurrent('chien');
        expect(spy).toHaveBeenCalledTimes(4);
        // Une frappe ailleurs recalcule les correspondances sans faire défiler.
        tiptap().commands.insertContentAt(tiptap().state.doc.content.size - 1, ' x');
        expect(spy).toHaveBeenCalledTimes(4);
        tiptap().commands.replaceAll('chien');
        tiptap().commands.clearSearch();
        expect(spy).toHaveBeenCalledTimes(4);
        expect(scrollCurrentIntoView).toBeTypeOf('function');
        input.remove();
      } finally {
        Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
      }
    });
  });

  describe('remplacement', () => {
    it('replaceCurrent remplace la courante et passe à la suivante', () => {
      tiptap().commands.setSearchQuery('chat');
      expect(tiptap().commands.replaceCurrent('chien')).toBe(true);
      expect(mounted.editor.getHTML()).toContain('<p>Le chien dort. Le Chat ronfle.</p>');
      expect(storage().matches).toHaveLength(2);
      expect(storage().currentIndex).toBe(0);
      expect(current()?.textContent).toBe('Chat');
    });

    it('replaceCurrent ne re-sélectionne pas un remplacement contenant la requête', () => {
      tiptap().commands.setSearchQuery('chat');
      tiptap().commands.replaceCurrent('chaton');
      expect(storage().matches).toHaveLength(3);
      expect(storage().currentIndex).toBe(1);
      expect(current()?.textContent).toBe('Chat');
    });

    it('replaceAll remplace tout et vide les correspondances', () => {
      tiptap().commands.setSearchQuery('chat');
      expect(tiptap().commands.replaceAll('X')).toBe(true);
      expect(mounted.editor.getHTML()).toBe(
        '<p>Le X dort. Le X ronfle.</p><h2>X perché</h2><p></p>',
      );
      expect(storage().matches).toEqual([]);
      expect(highlighted()).toHaveLength(0);
    });

    it('replaceCurrent et replaceAll échouent sans correspondance', () => {
      expect(tiptap().commands.replaceCurrent('x')).toBe(false);
      expect(tiptap().commands.replaceAll('x')).toBe(false);
    });

    it('replaceCurrent conserve les marques du texte remplacé', () => {
      mounted.editor.setHTML('<p><strong>chat</strong> noir</p>');
      tiptap().commands.setSearchQuery('chat');
      tiptap().commands.replaceCurrent('chien');
      expect(mounted.editor.getHTML()).toBe('<p><strong>chien</strong> noir</p>');
    });
  });

  describe('clearSearch et suivi du document', () => {
    it('clearSearch vide tout', () => {
      tiptap().commands.setSearchQuery('chat');
      expect(tiptap().commands.clearSearch()).toBe(true);
      expect(storage()).toEqual({ query: '', caseSensitive: false, matches: [], currentIndex: -1 });
      expect(highlighted()).toHaveLength(0);
    });

    it('une modification du document recalcule les correspondances', () => {
      tiptap().commands.setSearchQuery('chat');
      tiptap().commands.nextMatch();
      expect(storage().currentIndex).toBe(1);
      // Insertion avant la courante : elle reste courante, décalée.
      tiptap().commands.insertContentAt(1, 'Oh ! ');
      expect(storage().matches).toHaveLength(3);
      expect(storage().currentIndex).toBe(1);
      expect(current()?.textContent).toBe('Chat');
      // Suppression de la courante : la suivante prend le relais.
      const target = storage().matches[1]!;
      tiptap().commands.deleteRange({ from: target.from, to: target.to });
      expect(storage().matches).toHaveLength(2);
      expect(storage().currentIndex).toBe(1);
      expect(current()?.closest('h2')).not.toBeNull();
    });

    it('un simple déplacement de sélection garde les décorations', () => {
      tiptap().commands.setSearchQuery('chat');
      selectRange(mounted.editor, 2, 2);
      expect(highlighted()).toHaveLength(3);
    });
  });

  describe('commandes Aster search.*', () => {
    it('sont enregistrées avec libellé et icône conventionnels', () => {
      for (const id of [
        'search.open',
        'search.next',
        'search.previous',
        'search.replace',
        'search.replaceAll',
        'search.clear',
      ]) {
        const command = mounted.editor.commands.get(id);
        expect(command?.labelKey).toBe(`command.${id}`);
        expect(['search', 'search-next', 'search-previous', 'close']).toContain(command?.icon);
        expect(mounted.editor.i18n.has(`command.${id}`)).toBe(true);
      }
      expect(mounted.editor.commands.get('search.open')?.shortcut).toBe('Mod-f');
    });

    it('search.open émet aster:search-open sur l’hôte et applique la requête fournie', () => {
      const handler = vi.fn((event: Event) => event.preventDefault());
      mounted.element.addEventListener(SEARCH_OPEN_EVENT, handler);
      expect(mounted.editor.commands.run('search.open')).toBe(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(mounted.editor.commands.isActive('search.open')).toBe(false);
      mounted.editor.commands.run('search.open', { query: 'chat' });
      const event = handler.mock.calls[1]?.[0] as CustomEvent<SearchOpenEventDetail>;
      expect(event.detail).toEqual({ query: 'chat' });
      expect(storage().matches).toHaveLength(3);
      expect(mounted.editor.commands.isActive('search.open')).toBe(true);
    });

    it('search.open sans écouteur ni requête rend false pour laisser Mod-f au navigateur', () => {
      expect(mounted.editor.commands.run('search.open')).toBe(false);
      expect(mounted.editor.commands.run('search.open', { query: 'chat' })).toBe(true);
      expect(mounted.editor.commands.get('search.open')?.icon).toBe('search');
      expect(mounted.editor.commands.get('search.clear')?.icon).toBe('close');
    });

    it('Mod-f déclenche search.open', () => {
      const handler = vi.fn();
      mounted.element.addEventListener(SEARCH_OPEN_EVENT, handler);
      mounted.editor.contentElement.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true, cancelable: true }),
      );
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('next/previous/replace/replaceAll/clear passent par le registre', () => {
      const { commands } = mounted.editor;
      expect(commands.canRun('search.next')).toBe(false);
      expect(commands.run('search.next', { query: 'chat' })).toBe(true);
      expect(storage().currentIndex).toBe(1);
      expect(commands.canRun('search.previous')).toBe(true);
      expect(commands.run('search.previous')).toBe(true);
      expect(storage().currentIndex).toBe(0);
      expect(commands.run('search.replace', { query: 'chat', replacement: 'chien' })).toBe(true);
      expect(mounted.editor.getText()).toContain('Le chien dort');
      expect(commands.run('search.replaceAll', { query: 'chat', replacement: 'loup' })).toBe(true);
      expect(mounted.editor.getText().trimEnd()).toBe(
        'Le chien dort. Le loup ronfle.\nloup perché',
      );
      expect(commands.canRun('search.clear')).toBe(true);
      expect(commands.run('search.clear')).toBe(true);
      expect(commands.canRun('search.clear')).toBe(false);
    });

    it('search.next avec une requête déjà active avance sans la réappliquer', () => {
      mounted.editor.commands.run('search.next', { query: 'chat' });
      expect(storage().currentIndex).toBe(1);
      mounted.editor.commands.run('search.next', { query: 'chat' });
      expect(storage().currentIndex).toBe(2);
      // Changer la casse réapplique la requête.
      mounted.editor.commands.run('search.next', { query: 'chat', caseSensitive: true });
      expect(storage().caseSensitive).toBe(true);
      expect(storage().matches).toHaveLength(2);
    });
  });
});
