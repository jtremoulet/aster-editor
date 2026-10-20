import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DocumentLayout } from '../api';
import { PAGE_VIEW_CHANGE_EVENT, PAGE_VIEW_CLASS } from '../extensions/page-view';
import { CONTENT_CLASS, DESTROYED_ERROR_MESSAGE } from './aster-editor';
import { mountEditor, selectFirstBlock, type MountedEditor } from '../testing/mount';

/**
 * Document complet pour l'idempotence : titres, listes imbriquées, table avec
 * en-tête, image, lien avec cible, marques. Volontairement court pour rester
 * lisible, chaque famille de nœud y est représentée une fois.
 */
const FULL_DOCUMENT =
  '<h1>Titre</h1>' +
  '<h2>Sous-titre</h2>' +
  '<h3>Section</h3>' +
  '<p>Du <strong>gras</strong>, de l’<em>italique</em>, du <u>souligné</u>, ' +
  'du <s>barré</s> et du <code>code</code>.</p>' +
  '<ul><li><p>Un</p><ul><li><p>Un.a</p></li></ul></li><li><p>Deux</p></li></ul>' +
  '<ol><li><p>Premier</p></li><li><p>Second</p></li></ol>' +
  '<table><tbody><tr><th><p>En-tête</p></th><th><p>Colonne</p></th></tr>' +
  '<tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>' +
  '<p><img src="https://example.com/i.png" alt="Alt" title="Titre"></p>' +
  '<p><a target="_blank" rel="noopener noreferrer" href="https://example.com">lien</a></p>';

describe('createEditor', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('montage', () => {
    it('crée un conteneur .aster-content dans l’hôte et expose le contenteditable', () => {
      const container = mounted.element.querySelector(`.${CONTENT_CLASS}`);
      expect(container).not.toBeNull();
      expect(mounted.editor.element).toBe(mounted.element);
      expect(mounted.editor.contentElement.classList.contains('ProseMirror')).toBe(true);
      expect(container?.contains(mounted.editor.contentElement)).toBe(true);
    });

    it('n’injecte aucune feuille de style', () => {
      expect(document.querySelector('style[data-tiptap-style]')).toBeNull();
    });

    it('accepte un contenu initial JSON', () => {
      const other = mountEditor({
        content: {
          type: 'doc',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'JSON' }] }],
        },
      });
      expect(other.editor.getText()).toBe('JSON');
      other.cleanup();
    });

    it('démarre en lecture seule quand demandé', () => {
      const readOnly = mountEditor({ readOnly: true });
      expect(readOnly.editor.isReadOnly()).toBe(true);
      readOnly.cleanup();
    });
  });

  describe('sérialisation', () => {
    it('expose le HTML, le JSON et le texte', () => {
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour</p>');
      expect(mounted.editor.getJSON().type).toBe('doc');
      expect(mounted.editor.getText()).toBe('Bonjour');
    });

    it('sépare les paragraphes par un saut de ligne dans getText', () => {
      mounted.editor.setHTML('<p>Un</p><p>Deux</p>');
      expect(mounted.editor.getText()).toBe('Un\nDeux');
    });

    it('getText met un seul saut de ligne entre blocs, tables et listes imbriquées comprises', () => {
      mounted.editor.setHTML(
        '<h1>Titre</h1>' +
          '<table><tbody><tr><td><p>a</p></td><td><p>b</p></td></tr></tbody></table>' +
          '<ul><li><p>Un</p><ul><li><p>Deux</p></li></ul></li></ul>' +
          '<p>x<br>y</p>',
      );
      expect(mounted.editor.getText()).toBe('Titre\na\nb\nUn\nDeux\nx\ny');
    });

    it('setHTML(getHTML()) est idempotent sur un document complet', () => {
      mounted.editor.setHTML(FULL_DOCUMENT);
      const first = mounted.editor.getHTML();
      mounted.editor.setHTML(first);
      expect(mounted.editor.getHTML()).toBe(first);
    });

    it('produit une table sémantique sans attributs de layout', () => {
      mounted.editor.setHTML(FULL_DOCUMENT);
      const html = mounted.editor.getHTML();
      expect(html).toContain('<table><tbody><tr><th');
      expect(html).not.toContain('colgroup');
      expect(html).not.toContain('colspan="1"');
      expect(html).not.toContain('min-width');
    });

    it('conserve image, lien et marques à l’aller-retour', () => {
      mounted.editor.setHTML(FULL_DOCUMENT);
      const html = mounted.editor.getHTML();
      expect(html).toContain('<img src="https://example.com/i.png" alt="Alt" title="Titre">');
      expect(html).toContain('href="https://example.com"');
      expect(html).toContain('target="_blank"');
      expect(html).toContain('rel="noopener noreferrer"');
      expect(html).toContain('<strong>gras</strong>');
      expect(html).toContain('<ul><li><p>Un</p><ul><li><p>Un.a</p></li></ul></li>');
    });

    it('setJSON remplace le document', () => {
      mounted.editor.setJSON({
        type: 'doc',
        content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] }],
      });
      // `TrailingNode` ajoute un paragraphe vide après un dernier bloc non-paragraphe.
      expect(mounted.editor.getHTML()).toMatch(/^<h2>H<\/h2>(<p><\/p>)?$/);
    });

    it('insertHTML insère à la position courante en passant par le schéma', () => {
      mounted.editor.focus('end');
      mounted.editor.insertHTML('<strong> !</strong><script>x</script>');
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour<strong> !</strong></p>');
    });

    it('isEmpty et getCounts reflètent le contenu', () => {
      expect(mounted.editor.isEmpty()).toBe(false);
      expect(mounted.editor.getCounts()).toEqual({ words: 1, characters: 7 });
      mounted.editor.setHTML('');
      expect(mounted.editor.isEmpty()).toBe(true);
      expect(mounted.editor.getCounts()).toEqual({ words: 0, characters: 0 });
    });

    it('getCounts : une image seule compte un caractère et aucun mot, une table compte ses cellules', () => {
      // Valeurs observées de `CharacterCount`, figées : une feuille non-texte vaut un
      // caractère (séparateur), et les cellules se lisent comme des blocs ordinaires.
      mounted.editor.setHTML('<img src="https://example.com/a.png">');
      expect(mounted.editor.getCounts()).toEqual({ words: 0, characters: 1 });
      mounted.editor.setHTML(
        '<table><tbody><tr><th><p>En-tête</p></th><th><p>Col</p></th></tr>' +
          '<tr><td><p>ab cd</p></td><td><p>ef</p></td></tr></tbody></table>',
      );
      expect(mounted.editor.getCounts()).toEqual({ words: 5, characters: 17 });
    });
  });

  describe('événements', () => {
    it('émet ready une seule fois, dans une microtâche après le montage', async () => {
      const ready = vi.fn();
      const other = mountEditor({ commands: [] });
      other.editor.on('ready', ready);
      expect(ready).not.toHaveBeenCalled();
      await Promise.resolve();
      expect(ready).toHaveBeenCalledTimes(1);
      expect(ready).toHaveBeenCalledWith({ editor: other.editor });
      other.cleanup();
    });

    it('n’émet pas ready si l’éditeur est détruit avant la microtâche', async () => {
      const ready = vi.fn();
      const other = mountEditor({ commands: [] });
      other.editor.on('ready', ready);
      other.cleanup();
      await Promise.resolve();
      expect(ready).not.toHaveBeenCalled();
    });

    it('émet change et selectionChange quand le document est modifié', () => {
      const change = vi.fn();
      const selection = vi.fn();
      mounted.editor.on('change', change);
      mounted.editor.on('selectionChange', selection);
      mounted.editor.setHTML('<p>Modifié</p>');
      expect(change).toHaveBeenCalledTimes(1);
      expect(change).toHaveBeenCalledWith({ editor: mounted.editor });
      expect(selection).toHaveBeenCalled();
    });

    it('setHTML(html, false) n’émet pas change', () => {
      const change = vi.fn();
      mounted.editor.on('change', change);
      mounted.editor.setHTML('<p>Silencieux</p>', false);
      expect(change).not.toHaveBeenCalled();
      expect(mounted.editor.getHTML()).toBe('<p>Silencieux</p>');
    });

    it('setJSON(doc, false) n’émet pas change', () => {
      const change = vi.fn();
      mounted.editor.on('change', change);
      mounted.editor.setJSON({ type: 'doc', content: [{ type: 'paragraph' }] }, false);
      expect(change).not.toHaveBeenCalled();
    });

    it('setHTML(html, false) n’entre pas dans l’historique : undo ne revient pas en arrière', () => {
      mounted.editor.setHTML('<p>Silencieux</p>', false);
      expect(mounted.editor.commands.canRun('undo')).toBe(false);
      expect(mounted.editor.commands.run('undo')).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>Silencieux</p>');
    });

    it('setJSON(doc, false) n’entre pas dans l’historique non plus', () => {
      mounted.editor.setJSON(
        { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'J' }] }] },
        false,
      );
      expect(mounted.editor.commands.canRun('undo')).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>J</p>');
    });

    it('setHTML(html, false) après une frappe vide l’historique : pas d’undo fantôme', () => {
      mounted.editor.setHTML('<p>Tapé</p>');
      expect(mounted.editor.commands.canRun('undo')).toBe(true);
      mounted.editor.setHTML('<p>Silencieux</p>', false);
      expect(mounted.editor.commands.canRun('undo')).toBe(false);
      expect(mounted.editor.commands.run('undo')).toBe(false);
      expect(mounted.editor.getHTML()).toBe('<p>Silencieux</p>');
      // L'historique repart de ce document : la frappe suivante s'annule vers lui.
      mounted.editor.setHTML('<p>Encore</p>');
      expect(mounted.editor.commands.run('undo')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Silencieux</p>');
    });

    it('setHTML(html) avec émission reste annulable', () => {
      mounted.editor.setHTML('<p>Annulable</p>');
      expect(mounted.editor.commands.canRun('undo')).toBe(true);
      expect(mounted.editor.commands.run('undo')).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour</p>');
    });

    it('émet selectionChange sur un simple déplacement de sélection, sans change', () => {
      const change = vi.fn();
      const selection = vi.fn();
      mounted.editor.on('change', change);
      mounted.editor.on('selectionChange', selection);
      selectFirstBlock(mounted.editor);
      expect(selection).toHaveBeenCalledTimes(1);
      expect(change).not.toHaveBeenCalled();
    });

    it('émet readOnlyChange uniquement quand l’état change réellement', () => {
      const handler = vi.fn();
      mounted.editor.on('readOnlyChange', handler);
      mounted.editor.setReadOnly(true);
      mounted.editor.setReadOnly(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ editor: mounted.editor, readOnly: true });
      expect(mounted.editor.isReadOnly()).toBe(true);
      mounted.editor.setReadOnly(false);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(mounted.editor.isReadOnly()).toBe(false);
    });

    it('setReadOnly n’émet jamais change : un formulaire ne doit pas passer dirty', () => {
      const change = vi.fn();
      const readOnly = vi.fn();
      mounted.editor.on('change', change);
      mounted.editor.on('readOnlyChange', readOnly);
      mounted.editor.setReadOnly(true);
      mounted.editor.setReadOnly(false);
      expect(change).not.toHaveBeenCalled();
      expect(readOnly).toHaveBeenCalledTimes(2);
    });

    it('émet focus et blur avec l’événement DOM', () => {
      const focus = vi.fn();
      const blur = vi.fn();
      mounted.editor.on('focus', focus);
      mounted.editor.on('blur', blur);
      mounted.editor.contentElement.dispatchEvent(new FocusEvent('focus'));
      mounted.editor.contentElement.dispatchEvent(new FocusEvent('blur'));
      expect(focus).toHaveBeenCalledTimes(1);
      expect(focus.mock.calls[0]?.[0]?.event).toBeInstanceOf(FocusEvent);
      expect(blur).toHaveBeenCalledTimes(1);
    });

    it('on renvoie une fonction de désabonnement, et off désabonne aussi', () => {
      const a = vi.fn();
      const b = vi.fn();
      const unsubscribe = mounted.editor.on('change', a);
      mounted.editor.on('change', b);
      unsubscribe();
      mounted.editor.off('change', b);
      mounted.editor.setHTML('<p>x</p>');
      expect(a).not.toHaveBeenCalled();
      expect(b).not.toHaveBeenCalled();
    });

    it('un handler qui lève n’empêche pas les suivants', () => {
      const after = vi.fn();
      mounted.editor.on('change', () => {
        throw new Error('boom');
      });
      mounted.editor.on('change', after);
      expect(() => mounted.editor.setHTML('<p>x</p>')).toThrow('boom');
      expect(after).toHaveBeenCalledTimes(1);
    });
  });

  describe('vue page (contrat, L45b)', () => {
    const TWO_SECTIONS: DocumentLayout = {
      sections: [{ page: { size: 'A5' } }, { page: { size: 'A3' } }],
    };

    /** Compte les événements DOM `aster:page-view-change`, qui doivent rester émis. */
    function countDomEvents(): () => number {
      let count = 0;
      mounted.editor.contentElement.addEventListener(PAGE_VIEW_CHANGE_EVENT, () => {
        count += 1;
      });
      return () => count;
    }

    it('setPageView, getLayout et getSectionLayout sont joignables par le contrat AsterEditor', () => {
      // `mounted.editor` est typé `AsterEditor` : aucun cast vers l'implémentation.
      expect(typeof mounted.editor.setPageView).toBe('function');
      expect(typeof mounted.editor.getLayout).toBe('function');
      expect(typeof mounted.editor.getSectionLayout).toBe('function');
      expect(mounted.editor.getLayout?.()).toBeNull();
      expect(mounted.editor.getSectionLayout?.(1)).toBeNull();
    });

    it('setPageView(true) émet pageViewChange { active, layout: {} } et l’événement DOM reste émis', () => {
      const handler = vi.fn();
      const domEvents = countDomEvents();
      mounted.editor.on('pageViewChange', handler);
      mounted.editor.setPageView?.(true);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ editor: mounted.editor, active: true, layout: {} });
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
      expect(domEvents()).toBe(1);
    });

    it('setPageView(options) émet la mise en page donnée (même référence) et getSectionLayout la résout', () => {
      const handler = vi.fn();
      mounted.editor.on('pageViewChange', handler);
      mounted.editor.setPageView?.({ layout: TWO_SECTIONS });
      expect(handler).toHaveBeenCalledWith({
        editor: mounted.editor,
        active: true,
        layout: TWO_SECTIONS,
      });
      expect(mounted.editor.getLayout?.()).toBe(TWO_SECTIONS);
      expect(mounted.editor.getSectionLayout?.(2)).toBe(TWO_SECTIONS.sections?.[1]);
      // Hors plage : repli sur le premier niveau (vide ici).
      expect(mounted.editor.getSectionLayout?.(3)).toEqual({});
    });

    it('setPageView(false) émet { active: false, layout: null } une fois, et rien sans vue active', () => {
      const handler = vi.fn();
      const domEvents = countDomEvents();
      mounted.editor.on('pageViewChange', handler);
      mounted.editor.setPageView?.(false);
      expect(handler).not.toHaveBeenCalled();
      expect(domEvents()).toBe(0);
      mounted.editor.setPageView?.({ layout: TWO_SECTIONS });
      mounted.editor.setPageView?.(false);
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith({
        editor: mounted.editor,
        active: false,
        layout: null,
      });
      expect(mounted.editor.getLayout?.()).toBeNull();
      // DOM : un par montage et un par retrait, comme avant.
      expect(domEvents()).toBe(2);
    });

    it('un remplacement émet une seule fois, une fois l’état à jour : getLayout répond la nouvelle mise en page', () => {
      mounted.editor.setPageView?.(true);
      const seen: (DocumentLayout | null | undefined)[] = [];
      const domEvents = countDomEvents();
      mounted.editor.on('pageViewChange', ({ editor, layout }) => {
        seen.push(editor.getLayout?.(), layout);
      });
      mounted.editor.setPageView?.({ layout: TWO_SECTIONS });
      expect(seen).toEqual([TWO_SECTIONS, TWO_SECTIONS]);
      // DOM : retrait de l'ancienne vue puis montage de la nouvelle.
      expect(domEvents()).toBe(2);
    });

    it('une mise en page hostile n’émet pas pageViewChange : la vue précédente est remontée', () => {
      mounted.editor.setPageView?.({ layout: TWO_SECTIONS });
      const handler = vi.fn();
      mounted.editor.on('pageViewChange', handler);
      const hostile: DocumentLayout = {
        get sections(): readonly never[] {
          throw new Error('sections hostiles');
        },
      };
      expect(() => mounted.editor.setPageView?.({ layout: hostile })).toThrow('sections hostiles');
      expect(handler).not.toHaveBeenCalled();
      expect(mounted.editor.getLayout?.()).toBe(TWO_SECTIONS);
      expect(mounted.element.classList.contains(PAGE_VIEW_CLASS)).toBe(true);
    });

    it('pageView dans les options émet pendant la construction, avant tout abonnement', () => {
      const other = mountEditor({ pageView: { layout: TWO_SECTIONS } });
      try {
        const handler = vi.fn();
        other.editor.on('pageViewChange', handler);
        expect(handler).not.toHaveBeenCalled();
        expect(other.editor.getLayout?.()).toBe(TWO_SECTIONS);
      } finally {
        other.cleanup();
      }
    });
  });

  describe('focus', () => {
    it('focus(position) place la sélection au début, à la fin ou sur tout', () => {
      // « Bonjour » : p(0) B(1)…r(7) /p(8). Fin = 8, début = 1, tout = 7 caractères.
      mounted.editor.focus('end');
      expect(mounted.editor.tiptap.state.selection.from).toBe(8);
      mounted.editor.focus('start');
      expect(mounted.editor.tiptap.state.selection.from).toBe(1);
      mounted.editor.focus('all');
      expect(
        mounted.editor.tiptap.state.selection.to - mounted.editor.tiptap.state.selection.from,
      ).toBe(7);
      mounted.editor.focus();
      expect(mounted.editor.tiptap.state.selection.empty).toBe(false);
    });

    it('isFocused suit les événements de focus du contenteditable', () => {
      // jsdom ne relaie pas `element.focus()` en événement DOM de façon fiable :
      // on prouve le câblage par l'événement lui-même, qui est ce que Tiptap écoute.
      expect(mounted.editor.isFocused()).toBe(false);
      mounted.editor.contentElement.dispatchEvent(new FocusEvent('focus'));
      expect(mounted.editor.isFocused()).toBe(true);
      mounted.editor.blur();
      mounted.editor.contentElement.dispatchEvent(new FocusEvent('blur'));
      expect(mounted.editor.isFocused()).toBe(false);
    });
  });

  describe('destruction', () => {
    it('émet destroy avant de démonter, puis aucun handler n’est plus appelé', () => {
      const destroy = vi.fn();
      const change = vi.fn();
      mounted.editor.on('destroy', destroy);
      mounted.editor.on('change', change);
      mounted.editor.destroy();
      expect(destroy).toHaveBeenCalledTimes(1);
      expect(destroy).toHaveBeenCalledWith({ editor: mounted.editor });
      expect(mounted.editor.isDestroyed()).toBe(true);
      expect(mounted.editor.tiptap.isDestroyed).toBe(true);
      // Émettre après destruction est un no-op silencieux : pas de fuite.
      mounted.editor.emit('change', { editor: mounted.editor });
      expect(change).not.toHaveBeenCalled();
    });

    it('retire le conteneur de l’hôte', () => {
      mounted.editor.destroy();
      expect(mounted.element.querySelector(`.${CONTENT_CLASS}`)).toBeNull();
    });

    it('destroy est idempotent', () => {
      const destroy = vi.fn();
      mounted.editor.on('destroy', destroy);
      mounted.editor.destroy();
      mounted.editor.destroy();
      expect(destroy).toHaveBeenCalledTimes(1);
    });

    it('le registre refuse de courir sur un éditeur détruit', () => {
      mounted.editor.destroy();
      expect(mounted.editor.commands.run('bold')).toBe(false);
      expect(mounted.editor.commands.canRun('bold')).toBe(false);
      expect(mounted.editor.commands.isActive('bold')).toBe(false);
    });

    it('on est un no-op après destroy et renvoie un désabonnement inoffensif', () => {
      mounted.editor.destroy();
      const handler = vi.fn();
      const unsubscribe = mounted.editor.on('change', handler);
      expect(typeof unsubscribe).toBe('function');
      expect(() => unsubscribe()).not.toThrow();
      expect(handler).not.toHaveBeenCalled();
    });

    it('les méthodes de contenu lèvent une erreur explicite après destroy', () => {
      mounted.editor.destroy();
      expect(() => mounted.editor.getHTML()).toThrow(DESTROYED_ERROR_MESSAGE);
      expect(() => mounted.editor.setHTML('<p>x</p>')).toThrow(DESTROYED_ERROR_MESSAGE);
      expect(() => mounted.editor.getJSON()).toThrow(DESTROYED_ERROR_MESSAGE);
      expect(() => mounted.editor.getText()).toThrow(DESTROYED_ERROR_MESSAGE);
      expect(() => mounted.editor.insertHTML('<p>x</p>')).toThrow(DESTROYED_ERROR_MESSAGE);
    });
  });

  describe('options de commandes', () => {
    it('enregistre les commandes custom passées dans les options', () => {
      const run = vi.fn(() => true);
      const other = mountEditor({
        commands: [{ id: 'custom.hello', labelKey: 'command.custom.hello', run }],
      });
      expect(other.editor.commands.has('custom.hello')).toBe(true);
      expect(other.editor.commands.run('custom.hello')).toBe(true);
      expect(run).toHaveBeenCalledWith(other.editor, undefined);
      other.cleanup();
    });

    it('disabledCommands retire la commande du registre', () => {
      const other = mountEditor({ disabledCommands: ['bold', 'table.insert'] });
      expect(other.editor.commands.has('bold')).toBe(false);
      expect(other.editor.commands.has('table.insert')).toBe(false);
      expect(other.editor.commands.has('italic')).toBe(true);
      expect(other.editor.commands.run('bold')).toBe(false);
      other.cleanup();
    });
  });
});
