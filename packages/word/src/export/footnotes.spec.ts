import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx';
import { parseFragment, roundTrip, toDocumentXml, toZipEntries } from './testing/sample';

/** HTML tel que l'import le produit : appel `[1]` en exposant et liste finale de notes. */
const IMPORTED =
  '<p>Texte<sup>[1]</sup> suite<sup>[2]</sup>.</p>' +
  '<ol data-footnotes=""><li data-footnote="footnote-1"><p>Note <strong>une</strong>.</p></li>' +
  '<li data-footnote="footnote-2"><p>Note deux.</p><p>Second paragraphe.</p></li></ol>';

describe('notes de bas de page à l’export', () => {
  it('écrit footnotes.xml, référence les notes dans le corps et retire la liste', async () => {
    const entries = await toZipEntries(await exportDocx(IMPORTED));
    const footnotes = entries.get('word/footnotes.xml') ?? '';
    expect(footnotes).toContain('<w:footnote w:id="1">');
    expect(footnotes).toContain('<w:footnote w:id="2">');
    expect(footnotes).toContain('<w:pStyle w:val="FootnoteText"/>');
    expect(footnotes).toContain('<w:footnoteRef/>');
    expect(footnotes).toContain('>une</w:t>');
    expect(footnotes).toContain('>Second paragraphe.</w:t>');
    const document = entries.get('word/document.xml') ?? '';
    expect(document).toContain('<w:footnoteReference w:id="1"/>');
    expect(document).toContain('<w:footnoteReference w:id="2"/>');
    expect(document).toContain('>Texte</w:t>');
    expect(document).not.toContain('Note deux');
    expect(document).not.toContain('<w:numPr>');
  });

  it('accepte un appel explicite data-footnote-ref et des items sans identifiant', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p>A<sup data-footnote-ref="2">x</sup> B<sup data-footnote-ref="1">y</sup></p>' +
        '<ul data-footnotes><li>première</li><li>seconde</li></ul>',
    );
    expect(xml).toContain(
      '>A</w:t></w:r><w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="2"/>',
    );
    expect(xml).toContain('<w:footnoteReference w:id="1"/>');
    expect(xml).not.toContain('>x</w:t>');
    expect(warnings).toEqual([]);
  });

  it('laisse en exposant un appel sans note, avec avertissement si explicite', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p>a<sup>[1]</sup> b<sup data-footnote-ref="9">[9]</sup> c<sup>2</sup></p>',
    );
    expect(xml).not.toContain('footnoteReference');
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('>[1]</w:t>');
    expect(xml).toContain('>[9]</w:t>');
    expect(warnings).toEqual([{ code: 'footnote-missing', message: expect.stringContaining('9') }]);
  });

  it('gère une note vide et une note de fin (endnote-) comme note de bas de page', async () => {
    const entries = await toZipEntries(
      await exportDocx(
        '<p>a<sup>[1]</sup></p><ol data-footnotes><li data-footnote="endnote-1"></li></ol>',
      ),
    );
    expect(entries.get('word/footnotes.xml')).toContain('<w:footnote w:id="1">');
    expect(entries.get('word/document.xml')).toContain('<w:footnoteReference w:id="1"/>');
  });

  it('aller-retour exportDocx → importDocx : [1] en exposant et liste data-footnotes', async () => {
    const { html, warnings } = await roundTrip(IMPORTED);
    const doc = parseFragment(html);
    expect(Array.from(doc.querySelectorAll('sup')).map((sup) => sup.textContent)).toEqual([
      '[1]',
      '[2]',
    ]);
    const list = doc.querySelector('ol[data-footnotes]');
    expect(list).not.toBeNull();
    const items = Array.from(list?.querySelectorAll('li[data-footnote]') ?? []);
    expect(items.map((item) => item.getAttribute('data-footnote'))).toEqual([
      'footnote-1',
      'footnote-2',
    ]);
    expect(items[0]?.querySelector('strong')?.textContent).toBe('une');
    expect(items[1]?.textContent).toContain('Second paragraphe.');
    expect(warnings).toEqual([]);
  });
});
