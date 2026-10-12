import { describe, expect, it } from 'vitest';
import { STANDARD_COMMAND_IDS } from '@aster-editor/core';
import { ICON_NAMES, getIcon, hasIcon, iconNameForCommand } from './index';

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
    ]) {
      expect(hasIcon(name), `icône manquante : ${name}`).toBe(true);
    }
    expect(getIcon('fullscreen')).not.toBe(getIcon('fullscreen-exit'));
    expect(getIcon('search-previous')).not.toBe(getIcon('search-next'));
  });

  it('retourne un repli visible pour un nom inconnu', () => {
    const fallback = getIcon('does-not-exist');
    expect(fallback.startsWith('<svg')).toBe(true);
    expect(fallback).not.toBe(getIcon('bold'));
    expect(hasIcon('does-not-exist')).toBe(false);
    expect(hasIcon('toString')).toBe(false);
  });

  it('convertit un identifiant de commande en nom d’icône', () => {
    expect(iconNameForCommand('table.insert')).toBe('table-insert');
    expect(iconNameForCommand('alignLeft')).toBe('align-left');
    expect(iconNameForCommand('table.addRowBefore')).toBe('table-add-row-before');
    expect(iconNameForCommand('bold')).toBe('bold');
  });
});
