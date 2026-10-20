import { describe, expect, it, vi } from 'vitest';
import { resolveVariablesHtml, type HtmlContainerParser } from './resolve-variables';

const CLIENT = '<span data-aster-variable="client" data-label="Client">{{client}}</span>';

describe('resolveVariablesHtml', () => {
  it('substitue chaque puce par sa valeur', () => {
    expect(resolveVariablesHtml(`<p>Bonjour ${CLIENT} !</p>`, { client: 'Dupont' })).toBe(
      '<p>Bonjour Dupont !</p>',
    );
  });

  it('échappe la valeur : <, > et & deviennent des entités, jamais du balisage', () => {
    expect(resolveVariablesHtml(`<p>${CLIENT}</p>`, { client: '<b>A & B</b>' })).toBe(
      '<p>&lt;b&gt;A &amp; B&lt;/b&gt;</p>',
    );
  });

  it('laisse {{nom}} en texte brut pour une variable sans valeur', () => {
    expect(resolveVariablesHtml(`<p>Bonjour ${CLIENT} !</p>`, {})).toBe(
      '<p>Bonjour {{client}} !</p>',
    );
  });

  it('accepte une valeur vide : la puce disparaît', () => {
    expect(resolveVariablesHtml(`<p>a${CLIENT}b</p>`, { client: '' })).toBe('<p>ab</p>');
  });

  it('traite plusieurs puces, dans les titres et les cellules, et garde le reste du balisage', () => {
    const html =
      `<h1>Contrat ${CLIENT}</h1>` +
      '<table><tbody><tr><td><p><strong>Date :</strong> ' +
      '<span data-aster-variable="date">{{date}}</span></p></td></tr></tbody></table>' +
      `<p><span style="color: red">rouge</span> ${CLIENT}</p>`;
    expect(resolveVariablesHtml(html, { client: 'Dupont', date: '2026-10-16' })).toBe(
      '<h1>Contrat Dupont</h1>' +
        '<table><tbody><tr><td><p><strong>Date :</strong> 2026-10-16</p></td></tr></tbody></table>' +
        '<p><span style="color: red">rouge</span> Dupont</p>',
    );
  });

  it('renvoie la même chaîne, sans parser, quand le HTML ne contient aucune puce', () => {
    const parse = vi.fn<HtmlContainerParser>();
    const html = '<p>Bonjour {{client}}</p>';
    expect(resolveVariablesHtml(html, { client: 'Dupont' }, { parse })).toBe(html);
    expect(parse).not.toHaveBeenCalled();
  });

  it('utilise le parseur injecté', () => {
    const parse = vi.fn<HtmlContainerParser>((html) => {
      const container = document.createElement('div');
      container.innerHTML = html;
      return container;
    });
    expect(resolveVariablesHtml(`<p>${CLIENT}</p>`, { client: 'Dupont' }, { parse })).toBe(
      '<p>Dupont</p>',
    );
    expect(parse).toHaveBeenCalledTimes(1);
  });
});
