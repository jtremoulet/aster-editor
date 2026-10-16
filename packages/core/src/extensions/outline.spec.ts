import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { bodyHtml, mountEditor, type MountedEditor } from '../testing/mount';
import {
  HEADING_ID_PREFIX,
  ensureHeadingIds,
  getOutline,
  headingIdNumber,
  scrollToHeading,
} from './outline';

describe('headingIdNumber', () => {
  it('lit le numéro d’un id aster-h-<n>, null sinon', () => {
    expect(headingIdNumber('aster-h-12')).toBe(12);
    expect(headingIdNumber(`${HEADING_ID_PREFIX}1`)).toBe(1);
    expect(headingIdNumber('aster-h-0')).toBeNull();
    expect(headingIdNumber('intro')).toBeNull();
    expect(headingIdNumber('aster-h-')).toBeNull();
    expect(headingIdNumber(null)).toBeNull();
    expect(headingIdNumber(3)).toBeNull();
  });
});

describe('sommaire', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({
      content: '<h1>Intro</h1><p>texte</p><h2>Partie <strong>A</strong></h2><h3></h3><p>fin</p>',
    });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('ne pose aucun id tant que le sommaire n’est pas demandé', () => {
    expect(bodyHtml(mounted.editor)).toBe(
      '<h1>Intro</h1><p>texte</p><h2>Partie <strong>A</strong></h2><h3></h3><p>fin</p>',
    );
  });

  it('getOutline liste les titres avec niveau, texte, position et id stable, sérialisé dans getHTML', () => {
    const outline = getOutline(mounted.editor);
    expect(outline).toEqual([
      { level: 1, text: 'Intro', pos: 0, id: 'aster-h-1' },
      { level: 2, text: 'Partie A', pos: 14, id: 'aster-h-2' },
      { level: 3, text: '', pos: 24, id: 'aster-h-3' },
    ]);
    expect(bodyHtml(mounted.editor)).toBe(
      '<h1 id="aster-h-1">Intro</h1><p>texte</p><h2 id="aster-h-2">Partie <strong>A</strong></h2><h3 id="aster-h-3"></h3><p>fin</p>',
    );
  });

  it('setHTML(getHTML()) est idempotent et garde les ids ; les ids importés sont conservés', () => {
    getOutline(mounted.editor);
    const html = mounted.editor.getHTML();
    mounted.editor.setHTML(html);
    expect(mounted.editor.getHTML()).toBe(html);
    expect(getOutline(mounted.editor).map((entry) => entry.id)).toEqual([
      'aster-h-1',
      'aster-h-2',
      'aster-h-3',
    ]);

    mounted.editor.setHTML('<h2 id="intro">Intro</h2><h2>Suite</h2><h2 id="aster-h-7">Sept</h2>');
    expect(getOutline(mounted.editor).map((entry) => entry.id)).toEqual([
      'intro',
      'aster-h-8',
      'aster-h-7',
    ]);
  });

  it('un titre ajouté ensuite reçoit le numéro suivant, un doublon est renuméroté', () => {
    getOutline(mounted.editor);
    mounted.editor.setHTML(
      `${mounted.editor.getHTML()}<h2 id="aster-h-2">Copie</h2><h2>Nouveau</h2>`.replace(
        /<p><\/p>$/,
        '',
      ),
    );
    expect(ensureHeadingIds(mounted.editor)).toBe(true);
    expect(ensureHeadingIds(mounted.editor)).toBe(false);
    expect(getOutline(mounted.editor).map((entry) => [entry.text, entry.id])).toEqual([
      ['Intro', 'aster-h-1'],
      ['Partie A', 'aster-h-2'],
      ['', 'aster-h-3'],
      ['Copie', 'aster-h-4'],
      ['Nouveau', 'aster-h-5'],
    ]);
  });

  it('l’attribution des ids n’entre pas dans l’historique d’annulation', () => {
    mounted.editor.commands.run('bold');
    mounted.editor.tiptap.commands.insertContent('x');
    getOutline(mounted.editor);
    expect(mounted.editor.getHTML()).toContain('id="aster-h-1"');
    expect(mounted.editor.commands.run('undo')).toBe(true);
    expect(mounted.editor.getHTML()).toContain('id="aster-h-1"');
  });

  it('sans titre : sommaire vide, document intact, rien après destroy', () => {
    mounted.editor.setHTML('<p>a</p>');
    expect(getOutline(mounted.editor)).toEqual([]);
    expect(ensureHeadingIds(mounted.editor)).toBe(false);
    expect(mounted.editor.getHTML()).toBe('<p>a</p>');
    mounted.cleanup();
    expect(getOutline(mounted.editor)).toEqual([]);
    expect(scrollToHeading(mounted.editor, 0)).toBe(false);
  });

  it('scrollToHeading place le curseur dans le titre, faux hors titre', () => {
    const [, second] = getOutline(mounted.editor);
    expect(second).toBeDefined();
    expect(scrollToHeading(mounted.editor, second!.pos)).toBe(true);
    expect(mounted.editor.tiptap.state.selection.from).toBe(second!.pos + 1);
    expect(mounted.editor.commands.isActive('heading', { level: 2 })).toBe(true);
    expect(scrollToHeading(mounted.editor, 8)).toBe(false);
    expect(scrollToHeading(mounted.editor, -1)).toBe(false);
    expect(scrollToHeading(mounted.editor, 10_000)).toBe(false);
  });
});
