import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIABLE_PATTERN } from '../preprocess/names';
import type { CollectedVariable } from '../preprocess/variables';
import { parseFragment, runPass } from '../testing/dom';
import {
  collectResultVariables,
  createVariablesPass,
  resolveDocxVariableOptions,
  variablePatterns,
} from './variables';

const CUSTOM = /\[([a-z_]+)\]/g;
const collected = (entries: Array<[string, CollectedVariable]>): Map<string, CollectedVariable> =>
  new Map(entries);

describe('resolveDocxVariableOptions', () => {
  it('active les trois détections par défaut, sans motif', () => {
    expect(resolveDocxVariableOptions(undefined)).toEqual({
      braces: true,
      mergeFields: true,
      contentControls: true,
    });
  });

  it('respecte detect et pattern', () => {
    expect(resolveDocxVariableOptions({ detect: ['mergeFields'], pattern: CUSTOM })).toEqual({
      braces: false,
      mergeFields: true,
      contentControls: false,
      pattern: CUSTOM,
    });
    expect(resolveDocxVariableOptions({ detect: [] }).contentControls).toBe(false);
  });
});

describe('variablePatterns', () => {
  it('donne {{nom}} par défaut, le motif personnalisé à la place si fourni', () => {
    const base = resolveDocxVariableOptions(undefined);
    expect(variablePatterns(base, new Map())).toEqual([{ pattern: DEFAULT_VARIABLE_PATTERN }]);
    expect(variablePatterns({ ...base, pattern: CUSTOM }, new Map())).toEqual([
      { pattern: CUSTOM },
    ]);
  });

  it('ajoute {{nom}} restreint aux noms collectés quand le prétraitement a produit des runs', () => {
    const found = collected([['a', {}]]);
    const restricted = { pattern: DEFAULT_VARIABLE_PATTERN, only: new Set(['a']) };
    expect(
      variablePatterns({ ...resolveDocxVariableOptions(undefined), pattern: CUSTOM }, found),
    ).toEqual([{ pattern: CUSTOM }, restricted]);
    expect(
      variablePatterns(resolveDocxVariableOptions({ detect: ['mergeFields'] }), found),
    ).toEqual([restricted]);
    expect(variablePatterns(resolveDocxVariableOptions(undefined), found)).toEqual([
      { pattern: DEFAULT_VARIABLE_PATTERN },
    ]);
    expect(variablePatterns(resolveDocxVariableOptions({ detect: [] }), new Map())).toEqual([]);
  });
});

describe('createVariablesPass', () => {
  it('pose les puces avec les libellés collectés, hors <pre>', () => {
    const pass = createVariablesPass(
      [{ pattern: DEFAULT_VARIABLE_PATTERN }],
      collected([
        ['a', { label: 'A' }],
        ['b', {}],
      ]),
    );
    const { html, warnings } = runPass(pass, '<p>{{a}} {{b}} {{c}}</p><pre>{{a}}</pre>');
    expect(html).toBe(
      '<p><span data-aster-variable="a" data-label="A">{{a}}</span> <span data-aster-variable="b">{{b}}</span> <span data-aster-variable="c">{{c}}</span></p><pre>{{a}}</pre>',
    );
    expect(warnings).toEqual([]);
  });

  it('ne fait rien sans motif', () => {
    expect(runPass(createVariablesPass([], new Map()), '<p>{{a}}</p>').html).toBe('<p>{{a}}</p>');
  });
});

describe('collectResultVariables', () => {
  it('liste les puces du HTML dans l’ordre, dédoublonnées, enrichies, puis les variables hors corps', () => {
    const doc = parseFragment(
      '<p><span data-aster-variable="b">{{b}}</span> <span data-aster-variable="a">{{a}}</span> <span data-aster-variable="b">{{b}}</span></p>',
    );
    const found = collected([
      ['a', { label: 'A', value: '1' }],
      ['entete', { value: 'v' }],
    ]);
    expect(collectResultVariables(doc, found)).toEqual([
      { name: 'b' },
      { name: 'a', label: 'A', value: '1' },
      { name: 'entete', value: 'v' },
    ]);
  });

  it('renvoie une liste vide sans puce ni collecte', () => {
    expect(collectResultVariables(parseFragment('<p>x</p>'), new Map())).toEqual([]);
  });
});
