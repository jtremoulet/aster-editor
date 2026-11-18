import { afterEach, describe, expect, it } from 'vitest';
import type { AsterEditor, DocumentLayout } from '../api/index.js';
import { AsterEditorImpl } from '../editor/aster-editor.js';
import { mountEditor, type MountedEditor } from '../testing/mount.js';
import {
  displayHeaderFooterHtml,
  hasHeaderFooterVariables,
  headerFooterVariablesOf,
} from './header-footer-variables.js';
import { PAGE_FOOTER_CLASS, PAGE_HEADER_CLASS } from './page-view.js';

/** Puce figée, telle que la mise en page la stocke. */
const chip = (name: string, label?: string): string =>
  `<span data-aster-variable="${name}"${label ? ` data-label="${label}"` : ''}>{{${name}}}</span>`;

/** L'implémentation interne, qui porte `setPageView` et `getLayout`. */
function impl(editor: AsterEditor): AsterEditorImpl {
  if (!(editor instanceof AsterEditorImpl)) {
    throw new Error('AsterEditorImpl attendu');
  }
  return editor;
}

describe('variables dans les en-têtes et pieds de page', () => {
  let mounted: MountedEditor | null = null;

  afterEach(() => {
    mounted?.cleanup();
    mounted = null;
  });

  /** Puces affichées dans un conteneur : texte, classes d'état et infobulle. */
  const shown = (root: Element | null | undefined): string[] =>
    Array.from(root?.querySelectorAll('.aster-variable') ?? []).map(
      (element) =>
        `${element.textContent}|${element.classList.contains('aster-variable--resolved') ? 'resolved' : 'unresolved'}|${element.getAttribute('title')}`,
    );

  it('displayHeaderFooterHtml : valeur, sinon libellé de la puce, libellé déclaré, nom', () => {
    mounted = mountEditor({
      variables: {
        variables: [{ name: 'conseiller', label: 'Nom du conseiller' }],
        values: { ville: 'Montpellier' },
      },
    });
    const { editor } = mounted;
    const template = document.createElement('template');
    template.innerHTML = displayHeaderFooterHtml(
      `<p>${chip('ville')} ${chip('client', 'Client')} ${chip('conseiller')} ${chip('reference')}</p>`,
      editor,
    );
    expect(shown(template.content.firstElementChild)).toEqual([
      'Montpellier|resolved|{{ville}}',
      `Client|unresolved|${editor.i18n.t('variable.unresolved', { name: 'client' })}`,
      `Nom du conseiller|unresolved|${editor.i18n.t('variable.unresolved', { name: 'conseiller' })}`,
      `reference|unresolved|${editor.i18n.t('variable.unresolved', { name: 'reference' })}`,
    ]);
    // Le nom reste lisible sur la puce, comme dans le corps.
    expect(template.content.querySelector('.aster-variable')?.getAttribute('data-name')).toBe(
      'ville',
    );
  });

  it('une valeur est posée en texte : aucun HTML injecté', () => {
    mounted = mountEditor({ variables: { values: { x: '<img src=x onerror=alert(1)>' } } });
    const html = displayHeaderFooterHtml(`<p>${chip('x')}</p>`, mounted.editor);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img');
  });

  it('sans éditeur, sans puce ou avec un nom invalide : HTML rendu tel quel', () => {
    mounted = mountEditor();
    const plain = '<p>Sans variable</p>';
    expect(displayHeaderFooterHtml(plain, mounted.editor)).toBe(plain);
    expect(hasHeaderFooterVariables(plain)).toBe(false);
    const withChip = `<p>${chip('a')}</p>`;
    expect(hasHeaderFooterVariables(withChip)).toBe(true);
    expect(displayHeaderFooterHtml(withChip, null)).toBe(withChip);
    const invalid = '<p><span data-aster-variable="a b">{{a b}}</span></p>';
    expect(displayHeaderFooterHtml(invalid, mounted.editor)).toBe(invalid);
  });

  it('un {{nom}} en texte (en-tête importé de Word) est affiché comme une puce, pas dans une puce existante', () => {
    mounted = mountEditor({
      variables: {
        variables: [{ name: 'Nom', label: 'Nom du client' }],
        values: { Societe: 'Nebula' },
      },
    });
    const template = document.createElement('template');
    template.innerHTML = displayHeaderFooterHtml(
      `<p>Fusion : {{Nom}} | Société : <strong>{{Societe}}</strong> | ${chip('ref')} | {{a b}}</p>`,
      mounted.editor,
    );
    expect(template.content.textContent).toBe(
      'Fusion : Nom du client | Société : Nebula | ref | {{a b}}',
    );
    expect(template.content.querySelectorAll('.aster-variable')).toHaveLength(3);
    expect(template.content.querySelector('strong .aster-variable--resolved')?.textContent).toBe(
      'Nebula',
    );
  });

  it('l’hôte est associé à son éditeur, et oublié à la destruction', () => {
    mounted = mountEditor();
    expect(headerFooterVariablesOf(mounted.element)).toBe(mounted.editor);
    expect(headerFooterVariablesOf(null)).toBeNull();
    mounted.editor.destroy();
    expect(headerFooterVariablesOf(mounted.element)).toBeNull();
  });

  it('vue page : en-tête et pied affichent les puces, suivent setValues et define, sans toucher la mise en page', () => {
    const layout: DocumentLayout = {
      headers: { default: { html: `<p>Dossier ${chip('reference')}</p>` } },
      footers: { default: { html: `<p>${chip('conseiller')}</p>` } },
    };
    mounted = mountEditor({ pageView: { layout } });
    const { editor, element } = mounted;
    const header = element.querySelector(`.${PAGE_HEADER_CLASS}`);
    const footer = element.querySelector(`.${PAGE_FOOTER_CLASS}`);
    expect(header?.textContent).toBe('Dossier reference');
    expect(shown(footer)[0]).toContain('conseiller|unresolved');

    editor.variables.setValues({ reference: 'A-2026-014' });
    expect(header?.textContent).toBe('Dossier A-2026-014');
    expect(shown(header)).toEqual(['A-2026-014|resolved|{{reference}}']);

    editor.variables.define([{ name: 'conseiller', label: 'Nom du conseiller' }]);
    expect(footer?.textContent).toBe('Nom du conseiller');

    editor.variables.setValues({ reference: undefined });
    expect(header?.textContent).toBe('Dossier reference');

    // Seul l'affichage change : la mise en page (donc l'export) garde les puces figées.
    expect(impl(editor).getLayout()).toBe(layout);
    expect(layout.headers?.default?.html).toBe(`<p>Dossier ${chip('reference')}</p>`);
  });

  it('showHeadersFooters: false ou mise en page sans variable : setValues ne réaffiche rien', () => {
    mounted = mountEditor({
      pageView: { layout: { headers: { default: { html: '<p>Fixe</p>' } } } },
    });
    const header = mounted.element.querySelector(`.${PAGE_HEADER_CLASS}`);
    const paragraph = header?.firstElementChild;
    mounted.editor.variables.setValues({ a: '1' });
    // Même nœud : l'en-tête n'a pas été réécrit.
    expect(header?.firstElementChild).toBe(paragraph);
  });
});
