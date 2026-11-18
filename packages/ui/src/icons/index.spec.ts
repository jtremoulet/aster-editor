import { describe, expect, it } from 'vitest';
import { STANDARD_COMMAND_IDS } from '@aster-editor/core';
import { WIDGETS } from '../toolbar/widgets.js';
import { ICON_NAMES, getIcon, hasIcon, iconNameForCommand } from './index.js';

/** Icône attendue pour chaque widget de la toolbar (déclencheur ou bouton). */
const WIDGET_ICONS: Readonly<Record<string, string>> = {
  table: 'table-insert',
  link: 'link-set',
  image: 'image-insert',
  textColor: 'text-color',
  backgroundColor: 'background-color',
  fontFamily: 'font-family',
  fontSize: 'font-size',
  search: 'search',
  variable: 'variable',
  outline: 'outline',
  formatPainter: 'format-painter',
  source: 'source',
  fullscreen: 'fullscreen',
  specialChars: 'special-chars',
  print: 'print',
  lineSpacing: 'line-spacing',
  paragraphSpacing: 'paragraph-spacing',
  indentIncrease: 'indent-increase',
  indentDecrease: 'indent-decrease',
  paragraphBorders: 'paragraph-borders',
  caps: 'caps',
  underlineStyle: 'underline-style',
  pageLayout: 'page-layout',
};

describe('icons', () => {
  it('fournit une icône pour chaque commande standard', () => {
    for (const id of STANDARD_COMMAND_IDS) {
      expect(hasIcon(iconNameForCommand(id)), `icône manquante pour ${id}`).toBe(true);
    }
  });

  it('retourne des SVG 20×20 en currentColor, sans dépendre d’un nom', () => {
    for (const name of ICON_NAMES) {
      const svg = getIcon(name);
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('viewBox="0 0 20 20"');
      expect(svg).toContain('currentColor');
      expect(svg).toContain('aria-hidden="true"');
    }
    expect(ICON_NAMES).toContain('chevron-down');
    expect(ICON_NAMES).toContain('check');
    expect(ICON_NAMES).toContain('close');
  });

  it('fournit les icônes des widgets sans commande du core', () => {
    for (const name of [
      'search',
      'search-previous',
      'search-next',
      'source',
      'fullscreen',
      'fullscreen-exit',
      'special-chars',
      'print',
      'variable',
      'variable-insert',
      'variable-remove',
    ]) {
      expect(hasIcon(name), `icône manquante : ${name}`).toBe(true);
    }
    expect(getIcon('fullscreen')).not.toBe(getIcon('fullscreen-exit'));
    expect(getIcon('search-previous')).not.toBe(getIcon('search-next'));
    expect(getIcon('variable-insert')).not.toBe(getIcon('variable-remove'));
  });

  it('fournit une icône distincte pour chaque widget de mise en page (L26)', () => {
    const seen = new Set<string>();
    for (const [widget, icon] of Object.entries(WIDGET_ICONS)) {
      expect(hasIcon(icon), `icône manquante pour le widget ${widget} : ${icon}`).toBe(true);
      expect(seen.has(getIcon(icon)), `icône dupliquée : ${icon}`).toBe(false);
      seen.add(getIcon(icon));
    }
    // Tous les widgets du registre ont une icône attendue, sauf `heading` (texte seul).
    for (const name of Object.keys(WIDGETS)) {
      if (name === 'heading') continue;
      expect(WIDGET_ICONS, `widget ${name} sans icône attendue`).toHaveProperty(name);
    }
    expect(getIcon('indent-increase')).not.toBe(getIcon('indent-decrease'));
    expect(hasIcon('paragraph-set-layout')).toBe(true);
    expect(hasIcon('paragraph-unset-layout')).toBe(true);
  });

  it('icônes de listes : au trait, sans <text> (rendu indépendant des polices du poste)', () => {
    const names = ['bullet-list', 'ordered-list', 'task-list'];
    for (const name of names) {
      const svg = getIcon(name);
      expect(svg, name).toContain('stroke="currentColor"');
      expect(svg, name).not.toContain('<text');
    }
    expect(getIcon('bullet-list').match(/<circle /g)?.length).toBe(3);
    // Trois lignes de texte, deux chiffres dessinés au trait fin.
    expect(getIcon('ordered-list')).toContain('M8.5 5H17M8.5 10H17M8.5 15H17');
    expect(getIcon('ordered-list').match(/stroke-width="1.3"/g)?.length).toBe(2);
    expect(new Set(names.map((name) => getIcon(name))).size).toBe(3);
  });

  it('retourne un repli visible pour un nom inconnu', () => {
    const fallback = getIcon('does-not-exist');
    expect(fallback.startsWith('<svg')).toBe(true);
    expect(fallback).not.toBe(getIcon('bold'));
    expect(hasIcon('does-not-exist')).toBe(false);
    expect(hasIcon('toString')).toBe(false);
  });

  it('ignore les propriétés héritées du prototype (constructor, __proto__, toString)', () => {
    const fallback = getIcon('does-not-exist');
    for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect(hasIcon(name), name).toBe(false);
      const icon: unknown = getIcon(name);
      expect(typeof icon, name).toBe('string');
      expect(icon, name).toBe(fallback);
    }
  });

  it('convertit un identifiant de commande en nom d’icône', () => {
    expect(iconNameForCommand('table.insert')).toBe('table-insert');
    expect(iconNameForCommand('alignLeft')).toBe('align-left');
    expect(iconNameForCommand('table.addRowBefore')).toBe('table-add-row-before');
    expect(iconNameForCommand('bold')).toBe('bold');
  });
});
