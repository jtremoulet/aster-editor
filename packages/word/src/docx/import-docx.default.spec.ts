import { readFileSync } from 'node:fs';
import { createEditor } from '@aster-editor/core';
import { describe, expect, it } from 'vitest';
import { importDocx } from './import-docx';
import { normalizeHtml, parseFragment } from './testing/dom';

/**
 * Chemin par défaut de `importDocx` depuis la 0.6 (L46) : sans option, c'est le lecteur
 * stylé qui lit, `fidelity: 'semantic'` restant le chemin mammoth des 0.4.x. Sur les
 * fixtures 01-10, le défaut doit être strictement `styled` (même HTML, même mise en
 * page), porter le même texte et les mêmes variables que le chemin sémantique, et
 * survivre tel quel à un passage dans un éditeur du core (idempotence stricte).
 */

const FIXTURES = `${import.meta.env.ASTER_FIXTURES}docx/`;

const NAMES = [
  '01-headings-lists',
  '02-tables',
  '03-images',
  '04-rapport-client',
  '05-tableaux-complexes',
  '06-styles-francais',
  '07-long',
  '08-variables-braces',
  '09-variables-mergefields',
  '10-variables-content-controls',
] as const;

/** Fixtures dont la sortie stylée est figée dans `expected/` (la 07, fixture de charge, ne l'est pas). */
const WITH_EXPECTED = NAMES.filter((name) => name !== '07-long');

/**
 * Fixtures dont le HTML stylé ressort du core **à l'octet près**. Les autres en diffèrent
 * par trois détails de sérialisation du core, sans perte de contenu (test suivant) : `type`
 * d'un `<ol>` replacé après `data-docx-num-id`, `colwidth` recopié sur toutes les lignes
 * d'un tableau (le lecteur ne le pose que sur la première), image inline sortie de son
 * paragraphe (le nœud image du core est un bloc). Même limite que sur les fixtures 14 et 15.
 */
const STRICT_IDEMPOTENT = [
  '06-styles-francais',
  '09-variables-mergefields',
  '10-variables-content-controls',
] as const;

function loadFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`${FIXTURES}${name}.docx`);
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function loadExpected(name: string): string {
  return readFileSync(`${FIXTURES}expected/${name}.html`, 'utf8');
}

/**
 * Texte d'un HTML, comparable entre les deux chemins : mammoth écrit l'appel de note
 * `[1]`, le lecteur stylé `1` ; un bloc de code multi-paragraphes diffère par ses sauts de
 * ligne. Les crochets et les blancs sont donc neutralisés.
 */
function comparableText(html: string): string {
  return (parseFragment(html).body.textContent ?? '').replace(/[[\]]/g, '').replace(/\s+/g, '');
}

/** Monte un éditeur du core, y charge le HTML et rend ce que le core en ressort. */
function throughEditor(html: string): string {
  const element = document.createElement('div');
  document.body.appendChild(element);
  const editor = createEditor({ element });
  try {
    editor.setHTML(html);
    return editor.getHTML();
  } finally {
    editor.destroy();
    element.remove();
  }
}

describe('importDocx : chemin par défaut styled (0.6)', () => {
  it.each(NAMES)('%s : sans option, le résultat est celui de fidelity: styled', async (name) => {
    const buffer = loadFixture(name);
    const byDefault = await importDocx(buffer);
    const styled = await importDocx(buffer, { fidelity: 'styled' });
    expect(byDefault.html).toBe(styled.html);
    expect(byDefault.layout).toEqual(styled.layout);
    expect(byDefault.variables).toEqual(styled.variables);
    expect(byDefault.lost).toEqual(styled.lost);
    expect(byDefault.warnings).toEqual(styled.warnings);
    // Mise en page lue et gabarit d'origine : signatures du lecteur stylé.
    expect(byDefault.layout.page).toBeDefined();
    expect(byDefault.template).toBe(buffer);
    expect(byDefault.html).toContain('data-docx-style=');
  });

  it.each(NAMES)('%s : même texte et mêmes variables que fidelity: semantic', async (name) => {
    const buffer = loadFixture(name);
    const styled = await importDocx(buffer);
    const semantic = await importDocx(buffer, { fidelity: 'semantic' });
    expect(comparableText(styled.html)).toBe(comparableText(semantic.html));
    expect(styled.variables).toEqual(semantic.variables);
    expect(styled.warnings).toEqual([]);
    expect(semantic.warnings).toEqual([]);
    // Le chemin sémantique garde sa forme 0.4.x : pas de style, mise en page vide.
    expect(semantic.html).not.toContain('data-docx-style');
    expect(semantic.layout).toEqual({});
    expect(semantic.lost).toEqual([]);
    expect(semantic.template).toBe(buffer);
  });

  it.each(WITH_EXPECTED)('%s : correspond au HTML stylé attendu', async (name) => {
    const { html } = await importDocx(loadFixture(name));
    expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected(name)));
  });

  it.each(STRICT_IDEMPOTENT)(
    '%s : survit à setHTML puis getHTML dans le core (strict)',
    async (name) => {
      const { html } = await importDocx(loadFixture(name));
      expect(normalizeHtml(throughEditor(html))).toBe(normalizeHtml(html));
    },
  );

  it.each(NAMES)(
    '%s : garde texte, blocs, styles Word et marques après setHTML puis getHTML',
    async (name) => {
      const { html } = await importDocx(loadFixture(name));
      const back = throughEditor(html);
      // Blancs neutralisés : le core rogne l'espace qui précédait une image sortie du paragraphe.
      const text = (fragment: string): string =>
        (parseFragment(fragment).body.textContent ?? '').replace(/\s+/g, '');
      expect(text(back)).toBe(text(html));
      const count = (fragment: string, selector: string): number =>
        parseFragment(fragment).querySelectorAll(selector).length;
      for (const selector of [
        'h1',
        'h2',
        'h3',
        'p',
        'ul',
        'ol',
        'li',
        'table',
        'tr',
        'td, th',
        'img',
        '[data-docx-style]',
        '[data-docx-run-style]',
        '[data-aster-variable]',
        '[style]',
        'strong',
        'em',
        'u',
        's',
        'sup',
        'sub',
        'a[href]',
      ]) {
        expect(count(back, selector), selector).toBe(count(html, selector));
      }
    },
    // La 07 (300 paragraphes, 15 tableaux) passe par un éditeur jsdom : plus de 5 s sous charge.
    20_000,
  );
});
