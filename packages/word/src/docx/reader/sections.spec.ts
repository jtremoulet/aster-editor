import { describe, expect, it } from 'vitest';
import type { DocxImportWarning } from '../types';
import {
  namedPageSize,
  readDocumentLang,
  readSectionLayout,
  readSectionProperties,
  readSectionStart,
} from './sections';
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

  it('R25-11 : page, marges et colonnes hors des bornes Word ignorées avec avertissement', () => {
    const warnings: DocxImportWarning[] = [];
    expect(
      readSectionLayout(
        sectPr(
          '<w:pgSz w:w="1000000000000" w:h="1000000000000"/><w:cols w:num="1000000000"/><w:pgMar w:top="1000000000000" w:left="720"/>',
        ),
        styles,
        undefined,
        warnings,
      ),
    ).toEqual({ page: { margins: { leftMm: 12.7 } } });
    expect(warnings.map((w) => w.code)).toEqual(['reader', 'reader', 'reader']);
    expect(warnings[0]?.message).toContain('hors des bornes');
    expect(warnings[1]?.message).toContain('Marge top');
    expect(warnings[2]?.message).toContain('colonnes');
    // Marge plus grande que la page connue : ignorée, les autres restent.
    const margins: DocxImportWarning[] = [];
    expect(
      readSectionLayout(
        sectPr(
          '<w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="17000" w:bottom="1134" w:left="12000" w:right="1134"/>',
        ),
        styles,
        undefined,
        margins,
      ),
    ).toEqual({
      page: { size: 'A4', orientation: 'portrait', margins: { rightMm: 20, bottomMm: 20 } },
    });
    expect(margins.map((w) => w.message)).toEqual([
      expect.stringContaining('Marge top'),
      expect.stringContaining('Marge left'),
    ]);
    // Bornes incluses : 12,7 mm (720 twips) et 558,8 mm (31 680 twips), 45 colonnes.
    expect(
      readSectionLayout(sectPr('<w:pgSz w:w="720" w:h="31680"/><w:cols w:num="45"/>'), styles),
    ).toEqual({ page: { size: { widthMm: 12.7, heightMm: 558.8 } }, columns: 45 });
    expect(readSectionLayout(sectPr('<w:cols w:num="46"/>'), styles)).toEqual({});
    // Sans tableau d'avertissements : même résultat, silencieux. Page trop petite aussi ignorée.
    expect(
      readSectionLayout(sectPr('<w:pgSz w:w="1000000000000" w:h="1000000000000"/>'), styles),
    ).toEqual({});
    expect(readSectionLayout(sectPr('<w:pgSz w:w="719" w:h="16838"/>'), styles)).toEqual({});
  });

  it('readSectionProperties : page, colonnes et type de saut d’une section (session 4)', () => {
    expect(
      readSectionProperties(
        sectPr(
          '<w:type w:val="continuous"/><w:pgSz w:w="11906" w:h="16838"/><w:cols w:num="2" w:space="708"/>',
        ),
      ),
    ).toEqual({ page: { size: 'A4', orientation: 'portrait' }, columns: 2, start: 'continuous' });
    for (const start of ['nextPage', 'evenPage', 'oddPage', 'continuous']) {
      expect(readSectionStart(sectPr(`<w:type w:val="${start}"/>`))).toBe(start);
    }
    // `nextColumn` et les valeurs inconnues ne sont pas dans le contrat ; absent → `nextPage` implicite non écrit.
    expect(readSectionStart(sectPr('<w:type w:val="nextColumn"/>'))).toBeUndefined();
    expect(readSectionStart(sectPr('<w:type/>'))).toBeUndefined();
    expect(readSectionStart(sectPr(''))).toBeUndefined();
    expect(readSectionProperties(sectPr(''))).toEqual({});
    // Les bornes et avertissements sont les mêmes qu'au premier niveau.
    const warnings: DocxImportWarning[] = [];
    expect(readSectionProperties(sectPr('<w:cols w:num="46"/>'), warnings)).toEqual({});
    expect(warnings.map((w) => w.code)).toEqual(['reader']);
    // `readSectionLayout` ne recopie pas `start` au premier niveau.
    expect(readSectionLayout(sectPr('<w:type w:val="continuous"/>'), styles)).toEqual({});
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
