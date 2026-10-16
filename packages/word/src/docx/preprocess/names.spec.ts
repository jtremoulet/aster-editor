import { describe, expect, it } from 'vitest';
import {
  DEFAULT_VARIABLE_PATTERN,
  isVariableName,
  normalizeVariableName,
  toVariableName,
} from './names';

describe('isVariableName', () => {
  it('accepte lettres, chiffres, _, . et - après un premier caractère alphanumérique', () => {
    expect(isVariableName('client.nom')).toBe(true);
    expect(isVariableName('Nom_2-b')).toBe(true);
    expect(isVariableName('été')).toBe(true);
    expect(isVariableName('.nom')).toBe(false);
    expect(isVariableName('nom complet')).toBe(false);
    expect(isVariableName('')).toBe(false);
  });
});

describe('normalizeVariableName', () => {
  it('met en minuscules, retire les accents et remplace les espaces par _', () => {
    expect(normalizeVariableName('Nom complet')).toBe('nom_complet');
    expect(normalizeVariableName('  Date  d’échéance ')).toBe('date_decheance');
    expect(normalizeVariableName('Montant (HT)')).toBe('montant_ht');
  });

  it('retire les . et - de tête et renvoie null s’il ne reste rien', () => {
    expect(normalizeVariableName('--x')).toBe('x');
    expect(normalizeVariableName('???')).toBeNull();
    expect(normalizeVariableName('')).toBeNull();
  });
});

describe('toVariableName', () => {
  it('garde la casse d’un nom déjà valide et normalise les autres', () => {
    expect(toVariableName(' NumeroFacture ')).toBe('NumeroFacture');
    expect(toVariableName('Numéro facture')).toBe('numero_facture');
  });
});

describe('DEFAULT_VARIABLE_PATTERN', () => {
  it('reste linéaire sur une entrée adversariale de 1 Mo', () => {
    const inputs = [
      '{{'.repeat(500_000),
      `{{${'a'.repeat(1_000_000)}`,
      `{{ ${' '.repeat(1_000_000)}`,
      '{{a}'.repeat(250_000),
    ];
    for (const input of inputs) {
      const started = performance.now();
      const re = new RegExp(DEFAULT_VARIABLE_PATTERN.source, DEFAULT_VARIABLE_PATTERN.flags);
      expect(re.exec(input)).toBeNull();
      expect(performance.now() - started).toBeLessThan(500);
    }
  });
});
