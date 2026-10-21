import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VARIABLE_PATTERN } from '../../docx/preprocess/names.js';
import { normalizeGoogleDocsHtml } from '../../google/normalize-google-docs-html.js';
import { normalizeHtmlForCompare, parseHtml, runPass } from '../../testing/html-compare.js';
import { normalizeWordHtml } from '../normalize-word-html.js';
import { wrapVariablePlaceholders, wrapVariables } from './variables.js';

const chip = (name: string): string => `<span data-aster-variable="${name}">{{${name}}}</span>`;

describe('wrapVariables (passe de collage)', () => {
  it('remplace {{nom}} par une puce, deux par paragraphe', () => {
    expect(runPass('<p>Bonjour {{prenom}} {{nom}}.</p>', wrapVariables)).toBe(
      `<p>Bonjour ${chip('prenom')} ${chip('nom')}.</p>`,
    );
  });

  it('fonctionne dans une cellule, un titre et une marque inline', () => {
    expect(runPass('<table><tr><td>{{montant}} €</td></tr></table>', wrapVariables)).toBe(
      `<table><tbody><tr><td>${chip('montant')} €</td></tr></tbody></table>`,
    );
    expect(runPass('<h1>Contrat {{client.nom}}</h1>', wrapVariables)).toBe(
      `<h1>Contrat ${chip('client.nom')}</h1>`,
    );
    expect(runPass('<p><strong>{{x}}</strong></p>', wrapVariables)).toBe(
      `<p><strong>${chip('x')}</strong></p>`,
    );
  });

  it('tolère les espaces intérieurs et émet le texte canonique', () => {
    expect(runPass('<p>{{ nom }}</p>', wrapVariables)).toBe(`<p>${chip('nom')}</p>`);
  });

  it('ignore les accolades seules, un {{ incomplet et un nom invalide', () => {
    const html = '<p>{ seules } et {{ incomplet, {{}} vide, {{a b}} espace, {{.x}} point</p>';
    expect(runPass(html, wrapVariables)).toBe(html);
  });

  it('recolle un {{ coupé sur deux nœuds texte adjacents', () => {
    const doc = parseHtml('<p></p>');
    const p = doc.body.firstElementChild as Element;
    p.appendChild(doc.createTextNode('Date : {'));
    p.appendChild(doc.createTextNode('{date}}.'));
    wrapVariables(doc, { keepColors: false, keepAlignment: true, listFormats: new Map() });
    expect(doc.body.innerHTML).toBe(`<p>Date : ${chip('date')}.</p>`);
  });

  it('recolle un {{ et un nom}} répartis sur deux marques du même paragraphe, jamais à travers un <br> (I-8)', () => {
    expect(runPass('<p><strong>{{</strong>nom}}</p>', wrapVariables)).toBe(
      `<p><strong>${chip('nom')}</strong></p>`,
    );
    expect(runPass('<p>{{<br>nom}}</p>', wrapVariables)).toBe('<p>{{<br>nom}}</p>');
  });

  it('laisse <pre> et <code> intacts et ne ré-enveloppe pas une puce existante', () => {
    const html = `<pre>{{a}}</pre><p><code>{{b}}</code> ${chip('c')}</p>`;
    expect(runPass(html, wrapVariables)).toBe(html);
  });

  it('se désactive avec variables: false et accepte un motif personnalisé', () => {
    expect(runPass('<p>{{a}}</p>', wrapVariables, { variables: false })).toBe('<p>{{a}}</p>');
    const custom = runPass('<p>[a] et {{b}}</p>', wrapVariables, {
      variables: { pattern: /\[([a-z_]+)\]/ },
    });
    expect(custom).toBe(`<p>${chip('a')} et {{b}}</p>`);
  });
});

describe('wrapVariablePlaceholders (moteur)', () => {
  it('pose data-label quand le libellé est connu, et renvoie le nombre de puces', () => {
    const doc = parseHtml('<p>{{a}} {{b}}</p>');
    const count = wrapVariablePlaceholders(doc, doc.body, {
      patterns: [DEFAULT_VARIABLE_PATTERN],
      labels: new Map([
        ['a', 'Libellé A'],
        ['b', ''],
      ]),
    });
    expect(count).toBe(2);
    expect(doc.body.innerHTML).toBe(
      `<p><span data-aster-variable="a" data-label="Libellé A">{{a}}</span> ${chip('b')}</p>`,
    );
  });

  it('ne fait rien sans motif', () => {
    const doc = parseHtml('<p>{{a}}</p>');
    expect(wrapVariablePlaceholders(doc, doc.body, { patterns: [] })).toBe(0);
    expect(doc.body.innerHTML).toBe('<p>{{a}}</p>');
  });

  it('combine plusieurs motifs sans chevauchement et survit à une correspondance vide', () => {
    const doc = parseHtml('<p>[a] {{a}} x</p>');
    wrapVariablePlaceholders(doc, doc.body, {
      patterns: [/\[([a-z]+)\]/, DEFAULT_VARIABLE_PATTERN, /(\{\{a)\}\}/, /(x*)/],
    });
    expect(doc.body.innerHTML).toBe(`<p>${chip('a')} ${chip('a')} ${chip('x')}</p>`);
  });

  it('restreint un motif aux noms autorisés avec only', () => {
    const doc = parseHtml('<p>{{a}} {{b}}</p>');
    wrapVariablePlaceholders(doc, doc.body, {
      patterns: [{ pattern: DEFAULT_VARIABLE_PATTERN, only: new Set(['a']) }],
    });
    expect(doc.body.innerHTML).toBe(`<p>${chip('a')} {{b}}</p>`);
  });

  it('reste linéaire sur 1 Mo d’accolades', () => {
    const doc = parseHtml(`<p>${'{{'.repeat(250_000)}${'{{a}'.repeat(125_000)}</p>`);
    const started = performance.now();
    expect(wrapVariablePlaceholders(doc, doc.body, { patterns: [DEFAULT_VARIABLE_PATTERN] })).toBe(
      0,
    );
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe('fixture word-365-variables', () => {
  const fixture = readFileSync(
    `${import.meta.env.ASTER_FIXTURES}word-html/word-365-variables.html`,
    'utf8',
  );
  const expected = readFileSync(
    `${import.meta.env.ASTER_FIXTURES}word-html/expected/word-365-variables.html`,
    'utf8',
  );

  it('produit le HTML attendu : puces dans un paragraphe, une marque, une cellule, {{ coupé recollé', () => {
    const out = normalizeWordHtml(fixture);
    expect(normalizeHtmlForCompare(out)).toBe(normalizeHtmlForCompare(expected));
    expect(out).not.toMatch(/mso-|class=/);
  });

  it('garde {{nom}} en texte avec variables: false', () => {
    const out = normalizeWordHtml(fixture, { variables: false });
    expect(out).not.toContain('data-aster-variable');
    expect(out).toContain('{{prenom}}');
  });

  it('s’applique aussi au collage Google Docs', () => {
    const html =
      '<b id="docs-internal-guid-1" style="font-weight:normal"><p><span style="font-weight:700">{{a}}</span> et {{b}}</p></b>';
    expect(normalizeGoogleDocsHtml(html)).toBe(
      `<p><strong>${chip('a')}</strong> et ${chip('b')}</p>`,
    );
  });
});
