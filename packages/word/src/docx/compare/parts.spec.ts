import { describe, expect, it } from 'vitest';
import { parseXml } from '../reader/test-support.js';
import { compareParts, stripRevisionIds } from './parts.js';

const encoder = new TextEncoder();

function parts(entries: Record<string, string>): Map<string, Uint8Array> {
  return new Map(Object.entries(entries).map(([path, text]) => [path, encoder.encode(text)]));
}

const OPTIONS = { excluded: new Set(['word/document.xml']), ignoreRevisionIds: true, parseXml };

describe('stripRevisionIds', () => {
  it('retire les attributs w:rsid*, les marques de rendu, de correction et les signets', () => {
    const xml =
      '<w:p w:rsidR="00A" w:rsidRDefault="00B"><w:bookmarkStart w:id="0" w:name="_x"/><w:proofErr w:type="spellStart"/>' +
      '<w:r><w:lastRenderedPageBreak/><w:t>x</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>';
    expect(stripRevisionIds(xml)).toBe('<w:p><w:r><w:t>x</w:t></w:r></w:p>');
    expect(
      stripRevisionIds('<w:settings><w:rsids><w:rsidRoot w:val="00A"/></w:rsids></w:settings>'),
    ).toBe('<w:settings></w:settings>');
  });
});

describe('compareParts', () => {
  it('identiques, différentes (ligne), supprimées, ajoutées, exclues', () => {
    const original = parts({
      'word/document.xml': '<a/>',
      'word/styles.xml': '<styles><style id="A"/><style id="B"/></styles>',
      'word/theme/theme1.xml': '<t/>',
      'word/media/image1.png': 'png',
    });
    const result = parts({
      'word/document.xml': '<b/>',
      'word/styles.xml': '<styles><style id="A"/><style id="C"/></styles>',
      'word/theme/theme1.xml': '<t/>',
      'word/numbering.xml': '<n/>',
    });
    const comparison = compareParts(original, result, OPTIONS);
    expect(comparison.identical).toEqual(['word/theme/theme1.xml']);
    expect(comparison.changed).toEqual([
      {
        path: 'word/styles.xml',
        summary: 'taille 47 → 47 octets ; ligne 3 : « <style id="B"/> » → « <style id="C"/> »',
      },
      { path: 'word/media/image1.png', summary: 'supprimée' },
      { path: 'word/numbering.xml', summary: 'ajoutée' },
    ]);
    expect(comparison.compared.map((part) => [part.path, part.kept])).toEqual([
      ['word/styles.xml', false],
      ['word/theme/theme1.xml', true],
      ['word/media/image1.png', false],
    ]);
  });

  it('XML illisible ou binaire : résumé par tailles', () => {
    const original = parts({ 'a.xml': '<unclosed', 'b.bin': 'ab' });
    const result = parts({ 'a.xml': '<unclosed>', 'b.bin': 'abc' });
    const comparison = compareParts(original, result, OPTIONS);
    expect(comparison.changed).toEqual([
      { path: 'a.xml', summary: 'taille 9 → 10 octets (XML illisible)' },
      { path: 'b.bin', summary: 'taille 2 → 3 octets' },
    ]);
  });

  it('ignoreRevisionIds : égalité hors rsid conservée, ou perdue si désactivé', () => {
    const footer = (rsid: string): string =>
      `<w:ftr xmlns:w="w"><w:p w:rsidR="${rsid}"><w:r><w:t>x</w:t></w:r></w:p></w:ftr>`;
    const original = parts({ 'word/footer1.xml': footer('00A') });
    const result = parts({ 'word/footer1.xml': footer('00B') });
    const lenient = compareParts(original, result, OPTIONS);
    expect(lenient.identical).toEqual([]);
    expect(lenient.changed[0]?.summary).toBe('identique hors identifiants de révision');
    expect(lenient.compared[0]?.kept).toBe(true);
    const strict = compareParts(original, result, { ...OPTIONS, ignoreRevisionIds: false });
    expect(strict.compared[0]?.kept).toBe(false);
    expect(strict.changed[0]?.summary).toContain('ligne 2');
  });

  it('prefixes : seules les parties sous un préfixe sont comparées', () => {
    const original = parts({ 'word/styles.xml': '<a/>', 'docProps/app.xml': '<a/>' });
    const result = parts({
      'word/styles.xml': '<a/>',
      'docProps/app.xml': '<b/>',
      'word/x.xml': '<c/>',
    });
    const comparison = compareParts(original, result, { ...OPTIONS, prefixes: ['word/'] });
    expect(comparison.identical).toEqual(['word/styles.xml']);
    expect(comparison.changed).toEqual([{ path: 'word/x.xml', summary: 'ajoutée' }]);
  });

  it('tronque la ligne différente à 80 caractères', () => {
    const long = `<t>${'x'.repeat(200)}</t>`;
    const original = parts({ 'a.xml': `<r>${long}</r>` });
    const result = parts({ 'a.xml': `<r>${long.replace('xxx', 'yyy')}</r>` });
    const summary = compareParts(original, result, OPTIONS).changed[0]?.summary ?? '';
    expect(summary).toContain('ligne 2');
    expect(summary.length).toBeLessThan(220);
    expect(summary).toContain('…');
  });
});
