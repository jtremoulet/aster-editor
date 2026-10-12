import { describe, expect, it } from 'vitest';
import { formatShortcut, isMacPlatform } from './shortcut';
import { tooltipText } from '../components/tooltip';
import { rovingIndexFor } from './dom';

describe('formatShortcut', () => {
  it('rend Mod-b en Ctrl+B sur PC et ⌘B sur mac', () => {
    expect(formatShortcut('Mod-b', false)).toBe('Ctrl+B');
    expect(formatShortcut('Mod-b', true)).toBe('⌘B');
  });

  it('gère plusieurs modificateurs, dans l’ordre canonique mac', () => {
    expect(formatShortcut('Mod-Shift-7', false)).toBe('Ctrl+Shift+7');
    expect(formatShortcut('Mod-Shift-7', true)).toBe('⇧⌘7');
    expect(formatShortcut('Alt-Shift-Mod-x', true)).toBe('⌥⇧⌘X');
    expect(formatShortcut('Ctrl-Alt-Delete', false)).toBe('Ctrl+Alt+Del');
  });

  it('nomme les touches spéciales et tolère les entrées vides', () => {
    expect(formatShortcut('Mod-Enter', false)).toBe('Ctrl+↵');
    expect(formatShortcut('Escape', false)).toBe('Esc');
    expect(formatShortcut('Super-k', false)).toBe('Super+K');
    expect(formatShortcut('', false)).toBe('');
    expect(formatShortcut(undefined, true)).toBe('');
    expect(formatShortcut('-', false)).toBe('');
  });

  it('détecte la plateforme depuis une chaîne', () => {
    expect(isMacPlatform('MacIntel')).toBe(true);
    expect(isMacPlatform('iPhone')).toBe(true);
    expect(isMacPlatform('Win32')).toBe(false);
    expect(typeof isMacPlatform()).toBe('boolean');
  });
});

describe('tooltipText', () => {
  it('ajoute le raccourci entre parenthèses, ou rien', () => {
    expect(tooltipText('Bold', 'Mod-b', false)).toBe('Bold (Ctrl+B)');
    expect(tooltipText('Bold', undefined, false)).toBe('Bold');
  });
});

describe('rovingIndexFor', () => {
  it('boucle dans les deux sens et gère Home/End', () => {
    expect(rovingIndexFor('ArrowRight', 0, 3)).toBe(1);
    expect(rovingIndexFor('ArrowRight', 2, 3)).toBe(0);
    expect(rovingIndexFor('ArrowLeft', 0, 3)).toBe(2);
    expect(rovingIndexFor('Home', 2, 3)).toBe(0);
    expect(rovingIndexFor('End', 0, 3)).toBe(2);
    expect(rovingIndexFor('ArrowDown', 0, 3)).toBeNull();
    expect(rovingIndexFor('ArrowDown', 0, 3, 'vertical')).toBe(1);
    expect(rovingIndexFor('ArrowRight', 0, 3, 'vertical')).toBeNull();
    expect(rovingIndexFor('ArrowUp', 0, 3, 'both')).toBe(2);
    expect(rovingIndexFor('a', 0, 3)).toBeNull();
    expect(rovingIndexFor('ArrowRight', 0, 0)).toBeNull();
  });
});
