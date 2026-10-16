import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AsterEditor, VariableValues } from '../api';
import {
  canInsertVariable,
  isAsterVariableStore,
  isValidVariableName,
  variablePlaceholder,
  type AsterVariableStore,
} from './variable-store';
import { mountEditor, type MountedEditor } from '../testing/mount';

/** Le magasin concret du core, au-delà du contrat `VariableStore` exposé par l'éditeur. */
function asterStore(mounted: MountedEditor): AsterVariableStore {
  const store = mounted.editor.variables;
  if (!isAsterVariableStore(store)) {
    throw new Error('magasin Aster attendu');
  }
  return store;
}

const DOC =
  '<p><span data-aster-variable="client" data-label="Client">{{client}}</span> ' +
  '<span data-aster-variable="date">{{date}}</span> ' +
  '<span data-aster-variable="client">{{client}}</span></p>';

describe('isValidVariableName', () => {
  it('accepte lettres, chiffres, _, . et - ; refuse espaces, accolades et vide', () => {
    expect(isValidVariableName('client')).toBe(true);
    expect(isValidVariableName('client.nom-2_x')).toBe(true);
    expect(isValidVariableName('été')).toBe(true);
    expect(isValidVariableName('_a')).toBe(true);
    expect(isValidVariableName('')).toBe(false);
    expect(isValidVariableName('a b')).toBe(false);
    expect(isValidVariableName('-a')).toBe(false);
    expect(isValidVariableName('.a')).toBe(false);
    expect(isValidVariableName('{{a}}')).toBe(false);
  });

  it('variablePlaceholder rend la syntaxe canonique', () => {
    expect(variablePlaceholder('client')).toBe('{{client}}');
  });
});

describe('VariableStore', () => {
  let mounted: MountedEditor;

  afterEach(() => {
    mounted.cleanup();
  });

  it('getNames lit les nœuds réellement présents, dédoublonnés, sans les déclarées', () => {
    mounted = mountEditor({
      content: DOC,
      variables: { variables: [{ name: 'societe', label: 'Société' }] },
    });
    expect(mounted.editor.variables.getNames()).toEqual(['client', 'date']);
    mounted.editor.setHTML('<p>rien</p>');
    expect(mounted.editor.variables.getNames()).toEqual([]);
  });

  it('list fusionne déclarées et présentes avec les valeurs courantes', () => {
    mounted = mountEditor({
      content: DOC,
      variables: {
        variables: [
          { name: 'societe', label: 'Société', description: 'Raison sociale', value: 'Nebula' },
          { name: 'client', label: 'Client déclaré' },
        ],
        values: { date: '2026-10-16' },
      },
    });
    expect(mounted.editor.variables.list()).toEqual([
      { name: 'societe', label: 'Société', description: 'Raison sociale', value: 'Nebula' },
      { name: 'client', label: 'Client déclaré' },
      { name: 'date', value: '2026-10-16' },
    ]);
    expect(mounted.editor.variables.getValues()).toEqual({ societe: 'Nebula', date: '2026-10-16' });
  });

  it('setValues fusionne, efface avec undefined et émet variablesChange avec les valeurs', () => {
    mounted = mountEditor({ content: DOC });
    const received: VariableValues[] = [];
    const editors: AsterEditor[] = [];
    mounted.editor.on('variablesChange', ({ editor, values }) => {
      editors.push(editor);
      received.push(values);
    });
    mounted.editor.variables.setValues({ client: 'Dupont' });
    mounted.editor.variables.setValues({ date: '2026', client: undefined });
    expect(received).toEqual([{ client: 'Dupont' }, { date: '2026' }]);
    expect(editors).toEqual([mounted.editor, mounted.editor]);
    expect(mounted.editor.variables.getValues()).toEqual({ date: '2026' });
  });

  it('define déclare, met à jour par fusion et émet variablesChange', () => {
    mounted = mountEditor({ content: '<p></p>' });
    const handler = vi.fn();
    mounted.editor.on('variablesChange', handler);
    mounted.editor.variables.define([{ name: 'client', label: 'Client', value: 'A' }]);
    mounted.editor.variables.define([{ name: 'client', description: 'Nom du client' }]);
    expect(mounted.editor.variables.list()).toEqual([
      { name: 'client', label: 'Client', description: 'Nom du client', value: 'A' },
    ]);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(asterStore(mounted).isDeclared('client')).toBe(true);
  });

  it('resolve appelle le résolveur pour les présentes sans valeur seulement, applique et émet', async () => {
    const resolve = vi.fn(async (name: string) => (name === 'date' ? '2026' : undefined));
    mounted = mountEditor({
      content: DOC,
      variables: { values: { client: 'Dupont' }, resolve },
    });
    const handler = vi.fn();
    mounted.editor.on('variablesChange', handler);
    expect(mounted.editor.variables.hasUnresolved()).toBe(true);
    await expect(mounted.editor.variables.resolve()).resolves.toEqual({
      client: 'Dupont',
      date: '2026',
    });
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith('date', mounted.editor);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(mounted.editor.variables.hasUnresolved()).toBe(false);
    // Rien à résoudre : le résolveur n'est plus appelé, rien n'est émis.
    await mounted.editor.variables.resolve();
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('resolve n’émet rien quand le résolveur ne renvoie que undefined', async () => {
    mounted = mountEditor({ content: DOC, variables: { resolve: () => undefined } });
    const handler = vi.fn();
    mounted.editor.on('variablesChange', handler);
    await expect(mounted.editor.variables.resolve()).resolves.toEqual({});
    expect(handler).not.toHaveBeenCalled();
    expect(mounted.editor.variables.hasUnresolved()).toBe(true);
  });

  it('resolve sans résolveur renvoie les valeurs courantes', async () => {
    mounted = mountEditor({ content: DOC, variables: { values: { client: 'X' } } });
    await expect(mounted.editor.variables.resolve()).resolves.toEqual({ client: 'X' });
  });

  it('hasUnresolved ne regarde que les variables présentes dans le document', () => {
    mounted = mountEditor({
      content: '<p><span data-aster-variable="client">{{client}}</span></p>',
      variables: { variables: [{ name: 'societe' }], values: { client: 'Dupont' } },
    });
    expect(mounted.editor.variables.hasUnresolved()).toBe(false);
    mounted.editor.variables.setValues({ client: undefined });
    expect(mounted.editor.variables.hasUnresolved()).toBe(true);
  });

  it('allowUnknown vrai par défaut : canInsert ne vérifie que la syntaxe', () => {
    mounted = mountEditor({ content: '<p></p>' });
    expect(isAsterVariableStore(mounted.editor.variables)).toBe(true);
    const store = asterStore(mounted);
    expect(store.allowUnknown).toBe(true);
    expect(store.canInsert('inconnue')).toBe(true);
    expect(store.canInsert('a b')).toBe(false);
    expect(canInsertVariable(mounted.editor, 'inconnue')).toBe(true);
  });

  it('allowUnknown faux : seules les variables déclarées sont insérables', () => {
    mounted = mountEditor({
      content: '<p></p>',
      variables: { allowUnknown: false, variables: [{ name: 'client' }] },
    });
    const store = asterStore(mounted);
    expect(store.allowUnknown).toBe(false);
    expect(store.canInsert('client')).toBe(true);
    expect(store.canInsert('inconnue')).toBe(false);
    store.define([{ name: 'inconnue' }]);
    expect(store.canInsert('inconnue')).toBe(true);
  });

  it('insert passe par la commande variable.insert', () => {
    mounted = mountEditor({ content: '<p></p>' });
    expect(mounted.editor.variables.insert('client', 'Client')).toBe(true);
    expect(mounted.editor.getHTML()).toBe(
      '<p><span data-aster-variable="client" data-label="Client">{{client}}</span></p>',
    );
    expect(mounted.editor.variables.insert('date')).toBe(true);
    expect(mounted.editor.variables.getNames()).toEqual(['client', 'date']);
    mounted.editor.setReadOnly(true);
    expect(mounted.editor.variables.insert('x')).toBe(false);
  });
});
