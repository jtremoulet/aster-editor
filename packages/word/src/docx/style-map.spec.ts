import { describe, expect, it } from 'vitest';
import { ASTER_STYLE_MAP, buildStyleMap } from './style-map.js';

const RULE = /^(p|r|u|strike|highlight)(\[style-name='[^']+'\]|\.\w+)?\s=>\s[\w\s>:'()\\]+$/;

describe('ASTER_STYLE_MAP', () => {
  it('mappe les titres anglais, français et par identifiant sur h1 à h6', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(ASTER_STYLE_MAP).toContain(`p[style-name='Heading ${level}'] => h${level}:fresh`);
      expect(ASTER_STYLE_MAP).toContain(`p[style-name='Titre ${level}'] => h${level}:fresh`);
      expect(ASTER_STYLE_MAP).toContain(`p.Heading${level} => h${level}:fresh`);
    }
  });

  it('mappe le titre de document sur h1', () => {
    expect(ASTER_STYLE_MAP).toContain("p[style-name='Title'] => h1:fresh");
    expect(ASTER_STYLE_MAP).toContain("p[style-name='Titre'] => h1:fresh");
  });

  it('mappe citations, code, styles de caractères et surlignage', () => {
    expect(ASTER_STYLE_MAP).toContain("p[style-name='Quote'] => blockquote > p:fresh");
    expect(ASTER_STYLE_MAP).toContain("p[style-name='Citation'] => blockquote > p:fresh");
    expect(ASTER_STYLE_MAP.some((rule) => rule.startsWith("p[style-name='Code'] => pre"))).toBe(
      true,
    );
    expect(ASTER_STYLE_MAP).toContain("r[style-name='Strong'] => strong");
    expect(ASTER_STYLE_MAP).toContain("r[style-name='Emphasis'] => em");
    expect(ASTER_STYLE_MAP).toContain('u => u');
    expect(ASTER_STYLE_MAP).toContain('highlight => mark');
  });

  it('ne touche ni à List Paragraph ni à Hyperlink, gérés nativement par mammoth', () => {
    expect(ASTER_STYLE_MAP.some((rule) => rule.includes('List Paragraph'))).toBe(false);
    expect(ASTER_STYLE_MAP.some((rule) => rule.includes('Hyperlink'))).toBe(false);
  });

  it('ne contient que des règles à la syntaxe mammoth', () => {
    for (const rule of ASTER_STYLE_MAP) expect(rule).toMatch(RULE);
  });
});

describe('buildStyleMap', () => {
  it('retourne la map Aster seule sans règles utilisateur', () => {
    expect(buildStyleMap()).toEqual([...ASTER_STYLE_MAP]);
  });

  it('ajoute les règles utilisateur après la map Aster, nettoyées des lignes vides et commentées', () => {
    const map = buildStyleMap(["  p[style-name='Note'] => aside:fresh ", '', '# commentaire']);
    expect(map.slice(0, ASTER_STYLE_MAP.length)).toEqual([...ASTER_STYLE_MAP]);
    expect(map.slice(ASTER_STYLE_MAP.length)).toEqual(["p[style-name='Note'] => aside:fresh"]);
  });
});
