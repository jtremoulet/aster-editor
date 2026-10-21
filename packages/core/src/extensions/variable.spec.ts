import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NodeSelection } from '@tiptap/pm/state';

// jsdom 30 ne définit pas `ClipboardEvent`, que `view.pasteHTML` instancie pour
// simuler un collage. Un squelette sur `Event` suffit : rien ne lit `clipboardData`.
if (typeof globalThis.ClipboardEvent === 'undefined') {
  Object.assign(globalThis, {
    ClipboardEvent: class extends Event {
      readonly clipboardData = null;
    },
  });
}
import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import {
  VARIABLE_CLASS,
  VARIABLE_EDIT_EVENT,
  VARIABLE_INPUT_RULE,
  VARIABLE_RESOLVED_CLASS,
  VARIABLE_SELECTED_CLASS,
  VARIABLE_UNRESOLVED_CLASS,
  Variable,
  type VariableEditEventDetail,
} from './variable.js';
import { findNodePos, mountEditor, selectRange, type MountedEditor } from '../testing/mount.js';

const CLIENT = '<span data-aster-variable="client" data-label="Client">{{client}}</span>';
const DOC = `<p>Bonjour ${CLIENT} !</p>`;

function chip(mounted: MountedEditor, name = 'client'): HTMLElement {
  const node = mounted.editor.contentElement.querySelector<HTMLElement>(
    `span.${VARIABLE_CLASS}[data-name="${name}"]`,
  );
  if (!node) {
    throw new Error(`puce ${name} introuvable`);
  }
  return node;
}

/**
 * Simule une frappe caractère par caractère via `handleTextInput`, le point d'entrée
 * des règles de saisie ; sans règle déclenchée, le caractère est inséré tel quel.
 */
function typeText(mounted: MountedEditor, text: string): void {
  const { view } = mounted.editor.tiptap;
  for (const char of text) {
    const { from, to } = view.state.selection;
    const insert = (): ReturnType<typeof view.state.tr.insertText> =>
      view.state.tr.insertText(char, from, to);
    const handled = view.someProp('handleTextInput', (handler) =>
      handler(view, from, to, char, insert),
    );
    if (!handled) {
      view.dispatch(insert());
    }
  }
}

describe('extension Variable', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: DOC });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  describe('sérialisation HTML', () => {
    it('sérialise la puce en span[data-aster-variable] avec {{nom}} et reste idempotent', () => {
      expect(mounted.editor.getHTML()).toBe(DOC);
      mounted.editor.setHTML(mounted.editor.getHTML());
      expect(mounted.editor.getHTML()).toBe(DOC);
    });

    it('omet data-label quand le libellé est absent ou vide', () => {
      mounted.editor.setHTML('<p><span data-aster-variable="x" data-label="">{{x}}</span></p>');
      expect(mounted.editor.getHTML()).toBe('<p><span data-aster-variable="x">{{x}}</span></p>');
    });

    it('ignore un span dont le nom est invalide : son texte reste du texte', () => {
      mounted.editor.setHTML('<p><span data-aster-variable="a b">{{a b}}</span></p>');
      expect(mounted.editor.getHTML()).toBe('<p>{{a b}}</p>');
    });

    it('ne convertit pas {{nom}} en texte brut, chargé ou collé', () => {
      mounted.editor.setHTML('<p>{{client}}</p>');
      expect(mounted.editor.getHTML()).toBe('<p>{{client}}</p>');
      mounted.editor.focus('end');
      mounted.editor.tiptap.view.pasteHTML('<p>{{autre}}</p>');
      expect(mounted.editor.getHTML()).toContain('{{autre}}');
      expect(mounted.editor.getHTML()).not.toContain('data-aster-variable');
    });

    it('une puce collée via pasteHTML garde son nom et son libellé', () => {
      mounted.editor.setHTML('<p>Bonjour</p>');
      mounted.editor.focus('end');
      mounted.editor.tiptap.view.pasteHTML(
        '<p><span data-aster-variable="ville" data-label="Ville">{{ville}}</span></p>',
      );
      expect(mounted.editor.getHTML()).toBe(
        '<p>Bonjour<span data-aster-variable="ville" data-label="Ville">{{ville}}</span></p>',
      );
      expect(chip(mounted, 'ville').textContent).toBe('Ville');
      // Le libellé vit sur la puce ; le magasin ne connaît que le nom de la variable présente.
      expect(mounted.editor.variables.getNames()).toEqual(['ville']);
      expect(mounted.editor.variables.list()).toEqual([{ name: 'ville' }]);
    });

    it('un nom invalide injecté via setJSON ne produit ni puce listée ni data-aster-variable (V-12)', () => {
      mounted.editor.setJSON({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'A ' },
              { type: 'variable', attrs: { name: 'a b', label: 'Hostile' } },
              { type: 'variable', attrs: { name: '"><img src=x onerror=alert(1)>' } },
            ],
          },
        ],
      });
      const html = mounted.editor.getHTML();
      expect(html).not.toContain('data-aster-variable');
      expect(html).not.toContain('<img');
      expect(mounted.editor.variables.getNames()).toEqual([]);
      expect(mounted.editor.variables.list()).toEqual([]);
      // Le DOM du NodeView ne porte pas non plus le nom hostile.
      const chips = mounted.editor.contentElement.querySelectorAll(`span.${VARIABLE_CLASS}`);
      expect(Array.from(chips, (el) => el.getAttribute('data-name'))).toEqual(['', '']);
      // Relu, le HTML exporté redevient du texte : aucune puce ne survit.
      mounted.editor.setHTML(html);
      expect(mounted.editor.getHTML()).not.toContain('aster-variable');
      expect(mounted.editor.variables.getNames()).toEqual([]);
    });

    it('getHTML en mode resolve substitue les valeurs en texte échappé', () => {
      mounted.editor.variables.setValues({ client: '<b>Dupont & fils</b>' });
      expect(mounted.editor.getHTML({ variables: 'resolve' })).toBe(
        '<p>Bonjour &lt;b&gt;Dupont &amp; fils&lt;/b&gt; !</p>',
      );
      // Le mode par défaut et le mode explicite `placeholders` gardent les puces.
      expect(mounted.editor.getHTML()).toBe(DOC);
      expect(mounted.editor.getHTML({ variables: 'placeholders' })).toBe(DOC);
    });

    it('getHTML en mode resolve laisse {{nom}} pour une variable sans valeur', () => {
      expect(mounted.editor.getHTML({ variables: 'resolve' })).toBe('<p>Bonjour {{client}} !</p>');
    });

    it('getText rend la valeur si connue, sinon {{nom}}', () => {
      expect(mounted.editor.getText()).toBe('Bonjour {{client}} !');
      mounted.editor.variables.setValues({ client: 'Dupont' });
      expect(mounted.editor.getText()).toBe('Bonjour Dupont !');
    });

    it('le nœud survit à getJSON / setJSON', () => {
      const json = mounted.editor.getJSON();
      const paragraph = json.content?.[0];
      const node = paragraph?.content?.find((child) => child.type === 'variable');
      expect(node?.attrs).toEqual({ name: 'client', label: 'Client' });
      mounted.editor.setHTML('<p>vide</p>');
      mounted.editor.setJSON(json);
      expect(mounted.editor.getHTML()).toBe(DOC);
    });

    it('le texte Tiptap (renderText) rend la syntaxe {{nom}}', () => {
      expect(mounted.editor.tiptap.getText()).toBe('Bonjour {{client}} !');
    });
  });

  describe('NodeView', () => {
    it('rend span.aster-variable avec le libellé et l’état non résolu', () => {
      const el = chip(mounted);
      expect(el.textContent).toBe('Client');
      expect(el.classList.contains(VARIABLE_UNRESOLVED_CLASS)).toBe(true);
      expect(el.classList.contains(VARIABLE_RESOLVED_CLASS)).toBe(false);
      expect(el.getAttribute('title')).toBe('Variable sans valeur : client');
      expect(el.getAttribute('contenteditable')).toBe('false');
    });

    it('affiche le nom quand il n’y a pas de libellé', () => {
      mounted.editor.setHTML('<p><span data-aster-variable="x">{{x}}</span></p>');
      expect(chip(mounted, 'x').textContent).toBe('x');
    });

    it('se rafraîchit sur setValues sans recréer le DOM : valeur, --resolved, title {{nom}}', () => {
      const el = chip(mounted);
      mounted.editor.variables.setValues({ client: 'Dupont' });
      expect(chip(mounted)).toBe(el);
      expect(el.textContent).toBe('Dupont');
      expect(el.classList.contains(VARIABLE_RESOLVED_CLASS)).toBe(true);
      expect(el.classList.contains(VARIABLE_UNRESOLVED_CLASS)).toBe(false);
      expect(el.getAttribute('title')).toBe('{{client}}');
      mounted.editor.variables.setValues({ client: undefined });
      expect(el.textContent).toBe('Client');
      expect(el.classList.contains(VARIABLE_UNRESOLVED_CLASS)).toBe(true);
    });

    it('se rafraîchit aussi sur define et prend la valeur initiale des options', () => {
      mounted.editor.variables.define([{ name: 'client', value: 'Martin' }]);
      expect(chip(mounted).textContent).toBe('Martin');
      const other = mountEditor({ content: DOC, variables: { values: { client: 'Durand' } } });
      expect(chip(other).textContent).toBe('Durand');
      other.cleanup();
    });

    it('traduit le title de l’état non résolu selon la locale', () => {
      mounted.editor.i18n.setLocale('en');
      expect(chip(mounted).getAttribute('title')).toBe('Variable without value: client');
    });

    it('pose ProseMirror-selectednode quand la puce est sélectionnée, et le retire ensuite', () => {
      const el = chip(mounted);
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'variable'));
      expect(el.classList.contains('ProseMirror-selectednode')).toBe(true);
      expect(el.classList.contains(VARIABLE_SELECTED_CLASS)).toBe(true);
      selectRange(mounted.editor, 1, 1);
      expect(el.classList.contains('ProseMirror-selectednode')).toBe(false);
      expect(el.classList.contains(VARIABLE_SELECTED_CLASS)).toBe(false);
    });

    it('le double-clic sélectionne la puce et émet aster:variable-edit sur l’hôte', () => {
      const received: VariableEditEventDetail[] = [];
      const listener = (event: Event): void => {
        received.push((event as CustomEvent<VariableEditEventDetail>).detail);
      };
      mounted.editor.element.addEventListener(VARIABLE_EDIT_EVENT, listener);
      chip(mounted).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }));
      mounted.editor.element.removeEventListener(VARIABLE_EDIT_EVENT, listener);
      expect(received).toEqual([{ pos: findNodePos(mounted.editor, 'variable'), name: 'client' }]);
      expect(mounted.editor.tiptap.state.selection).toBeInstanceOf(NodeSelection);
      expect(mounted.editor.commands.isActive('variable.remove')).toBe(true);
    });

    it('n’émet pas aster:variable-edit en lecture seule', () => {
      let count = 0;
      const listener = (): void => {
        count += 1;
      };
      mounted.editor.element.addEventListener(VARIABLE_EDIT_EVENT, listener);
      mounted.editor.setReadOnly(true);
      chip(mounted).dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      mounted.editor.element.removeEventListener(VARIABLE_EDIT_EVENT, listener);
      expect(count).toBe(0);
    });

    it('se désabonne à la destruction : une puce retirée du document ne se rafraîchit plus', () => {
      const el = chip(mounted);
      mounted.editor.setHTML('<p>vide</p>');
      mounted.editor.variables.setValues({ client: 'Dupont' });
      expect(el.textContent).toBe('Client');
      expect(el.classList.contains(VARIABLE_UNRESOLVED_CLASS)).toBe(true);
    });

    it('la destruction de l’éditeur avec des puces ne lève pas', () => {
      expect(() => mounted.cleanup()).not.toThrow();
      expect(mounted.editor.isDestroyed()).toBe(true);
    });

    it('reflète une mise à jour d’attributs (libellé) sans recréer le DOM', () => {
      const el = chip(mounted);
      mounted.editor.tiptap.commands.setNodeSelection(findNodePos(mounted.editor, 'variable'));
      mounted.editor.tiptap.commands.updateAttributes('variable', { label: 'Nouveau' });
      expect(chip(mounted)).toBe(el);
      expect(el.textContent).toBe('Nouveau');
      expect(mounted.editor.getHTML()).toBe(
        '<p>Bonjour <span data-aster-variable="client" data-label="Nouveau">{{client}}</span> !</p>',
      );
    });

    it('sans éditeur Aster (extension nue), la puce affiche le libellé et title {{nom}}', () => {
      const element = document.createElement('div');
      document.body.appendChild(element);
      const bare = new Editor({ element, extensions: [StarterKit, Variable], content: DOC });
      const el = element.querySelector<HTMLElement>(`span.${VARIABLE_CLASS}`);
      expect(el?.textContent).toBe('Client');
      expect(el?.getAttribute('title')).toBe('{{client}}');
      expect(el?.classList.contains(VARIABLE_UNRESOLVED_CLASS)).toBe(true);
      expect(bare.getHTML()).toBe(DOC);
      bare.destroy();
      element.remove();
    });
  });

  describe('règle de saisie {{nom}}', () => {
    it('VARIABLE_INPUT_RULE n’accepte que les noms valides en fin de texte', () => {
      expect(VARIABLE_INPUT_RULE.test('Bonjour {{client}}')).toBe(true);
      expect(VARIABLE_INPUT_RULE.test('{{client.nom-2_x}}')).toBe(true);
      expect(VARIABLE_INPUT_RULE.test('{{été}}')).toBe(true);
      expect(VARIABLE_INPUT_RULE.test('{{a b}}')).toBe(false);
      expect(VARIABLE_INPUT_RULE.test('{{-x}}')).toBe(false);
      expect(VARIABLE_INPUT_RULE.test('{{}}')).toBe(false);
      expect(VARIABLE_INPUT_RULE.test('{{client}} ')).toBe(false);
    });

    it('taper {{nom}} crée une puce', () => {
      mounted.editor.setHTML('<p>Bonjour</p>');
      mounted.editor.focus('end');
      typeText(mounted, ' {{client}}');
      expect(mounted.editor.getHTML()).toBe(
        '<p>Bonjour <span data-aster-variable="client">{{client}}</span></p>',
      );
      expect(chip(mounted).textContent).toBe('client');
    });

    it('un nom invalide reste du texte', () => {
      mounted.editor.setHTML('<p>Bonjour</p>');
      mounted.editor.focus('end');
      typeText(mounted, ' {{a b}}');
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour {{a b}}</p>');
    });

    it('undoInputRule rend le texte tapé', () => {
      mounted.editor.setHTML('<p>Bonjour</p>');
      mounted.editor.focus('end');
      typeText(mounted, ' {{client}}');
      expect(mounted.editor.tiptap.commands.undoInputRule()).toBe(true);
      expect(mounted.editor.getHTML()).toBe('<p>Bonjour {{client}}</p>');
    });
  });
});
