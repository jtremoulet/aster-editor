import { describe, expect, it } from 'vitest';
import { namedPageSize, readDocumentLang, readSectionLayout } from './sections';
import { buildPackage, fragment, partXml, stubStyles } from './testing-blocks';

const styles = stubStyles();

function sectPr(inner: string): Element {
  return fragment(`<w:sectPr>${inner}</w:sectPr>`);
}

describe('readSectionLayout', () => {
  it('reconnaît les formats nommés à ±1 mm dans les deux orientations', () => {
    expect(namedPageSize(210, 297)).toEqual({ size: 'A4', orientation: 'portrait' });
    expect(namedPageSize(297.5, 210.2)).toEqual({ size: 'A4', orientation: 'landscape' });
    expect(namedPageSize(215.9, 279.4)).toEqual({ size: 'Letter', orientation: 'portrait' });
    expect(namedPageSize(355.6, 215.9)).toEqual({ size: 'Legal', orientation: 'landscape' });
    expect(namedPageSize(148, 210)).toEqual({ size: 'A5', orientation: 'portrait' });
    expect(namedPageSize(297, 420)).toEqual({ size: 'A3', orientation: 'portrait' });
    expect(namedPageSize(200, 200)).toBeNull();
  });

  it('A4 portrait avec marges en mm (deux décimales)', () => {
    const layout = readSectionLayout(
      sectPr(
        '<w:pgSz w:w="11906" w:h="16838" w:orient="portrait"/>' +
          '<w:pgMar w:top="1440" w:right="1440" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>',
      ),
      styles,
    );
    expect(layout).toEqual({
      page: {
        size: 'A4',
        orientation: 'portrait',
        margins: {
          topMm: 25.4,
          rightMm: 25.4,
          bottomMm: 20,
          leftMm: 20,
          headerMm: 12.49,
          footerMm: 12.49,
        },
      },
    });
  });

  it('Letter paysage, colonnes, marge négative prise en valeur absolue', () => {
    const layout = readSectionLayout(
      sectPr(
        '<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/><w:pgMar w:top="-720" w:left="720"/><w:cols w:num="2" w:space="720"/>',
      ),
      styles,
    );
    expect(layout).toEqual({
      page: { size: 'Letter', orientation: 'landscape', margins: { topMm: 12.7, leftMm: 12.7 } },
      columns: 2,
    });
    expect(readSectionLayout(sectPr('<w:cols w:space="708"/>'), styles)).toEqual({});
    expect(readSectionLayout(sectPr('<w:cols w:num="1"/>'), styles)).toEqual({});
  });

  it('format libre : dimensions en mm, orientation seulement si explicite', () => {
    expect(readSectionLayout(sectPr('<w:pgSz w:w="5000" w:h="8000"/>'), styles)).toEqual({
      page: { size: { widthMm: 88.19, heightMm: 141.11 } },
    });
    expect(
      readSectionLayout(sectPr('<w:pgSz w:w="8000" w:h="5000" w:orient="landscape"/>'), styles),
    ).toEqual({
      page: { size: { widthMm: 141.11, heightMm: 88.19 }, orientation: 'landscape' },
    });
    expect(readSectionLayout(sectPr('<w:pgSz w:w="0" w:h="abc"/>'), styles)).toEqual({});
  });

  it('sectPr absent : police par défaut et langue seulement', () => {
    expect(readSectionLayout(null, styles)).toEqual({});
    const withFont = stubStyles({ defaultFont: () => ({ family: 'Arial', sizePt: 10 }) });
    expect(readSectionLayout(null, withFont, 'fr-FR')).toEqual({
      defaultFont: { family: 'Arial', sizePt: 10 },
      lang: 'fr-FR',
    });
  });

  it('readDocumentLang lit w:lang des docDefaults de styles.xml', async () => {
    const pkg = await buildPackage('', {
      rels: [{ id: 'rId1', type: 'styles', target: 'styles.xml' }],
      parts: {
        'word/styles.xml': partXml(
          'styles',
          '<w:docDefaults><w:rPrDefault><w:rPr><w:lang w:val="fr-FR" w:eastAsia="en-US"/></w:rPr></w:rPrDefault></w:docDefaults>',
        ),
      },
    });
    expect(await readDocumentLang(pkg)).toBe('fr-FR');
    expect(await readDocumentLang(await buildPackage(''))).toBeUndefined();
    const noLang = await buildPackage('', {
      rels: [{ id: 'rId1', type: 'styles', target: 'styles.xml' }],
      parts: { 'word/styles.xml': partXml('styles', '<w:docDefaults/>') },
    });
    expect(await readDocumentLang(noLang)).toBeUndefined();
  });
});
