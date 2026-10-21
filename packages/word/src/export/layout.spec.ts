import { describe, expect, it } from 'vitest';
import { importDocx } from '../docx/import-docx';
import type { DocxImportResult } from '../docx/types';
import { exportDocx } from './export-docx';
import { parseFragment, toDocumentXml, toZipEntries } from './testing/sample';
import type { DocxExportOptions, DocxExportWarning } from './types';

/** Export neuf puis import stylé (le chemin sémantique ne lit pas la mise en page). */
async function roundTrip(html: string, options: DocxExportOptions = {}): Promise<DocxImportResult> {
  const blob = await exportDocx(html, options);
  return importDocx(await blob.arrayBuffer(), { fidelity: 'styled' });
}

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('export neuf — styles inline du contrat de mise en page', () => {
  it('paragraphe : interligne, espacements, retraits, bordures, fond, keepNext, saut de page', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p style="line-height: 1.15; margin-top: 6pt; margin-bottom: 6pt; margin-left: 36pt; margin-right: 0pt; text-indent: 18pt; border-bottom: 1pt solid #000000; background-color: #eeeeee" data-keep-next data-page-break-before>a</p>' +
        '<p style="line-height: 14pt; margin-left: 14.15pt; text-indent: -14.15pt; border: 1pt dashed rgb(255, 0, 0)" data-border-between="0.5pt solid #00ff00">b</p>',
    );
    expect(xml).toContain(
      '<w:spacing w:after="120" w:before="120" w:line="276" w:lineRule="auto"/>',
    );
    expect(xml).toContain('<w:ind w:left="720" w:right="0" w:firstLine="360"/>');
    expect(xml).toContain(
      '<w:pBdr><w:bottom w:val="single" w:color="000000" w:sz="8" w:space="1"/></w:pBdr>',
    );
    expect(xml).toContain('<w:shd w:fill="EEEEEE" w:color="auto" w:val="clear"/>');
    expect(xml).toContain('<w:keepNext/>');
    expect(xml).toContain('<w:pageBreakBefore/>');
    expect(xml).toContain('<w:spacing w:line="280" w:lineRule="exact"/>');
    expect(xml).toContain('<w:ind w:left="283" w:hanging="283"/>');
    expect(count(xml, 'w:val="dashed" w:color="FF0000" w:sz="8"')).toBe(4);
    expect(xml).toContain('<w:between w:val="single" w:color="00FF00" w:sz="4" w:space="1"/>');
    expect(warnings).toEqual([]);
  });

  it('data-docx-style connu → pStyle, inconnu ignoré en export neuf (titre conservé)', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<p data-docx-style="ListParagraph">a</p><h2 data-docx-style="Heading2">b</h2><h1 data-docx-style="Titre1">c</h1>',
    );
    expect(xml).toContain('<w:pStyle w:val="ListParagraph"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
    expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
    expect(xml).not.toContain('Titre1');
    expect(warnings).toEqual([]);
  });

  it('run : espacement, casse, petites capitales, souligné stylé, barré double, fond, style de caractère', async () => {
    const { xml } = await toDocumentXml(
      '<p><span style="letter-spacing: 2pt; text-transform: uppercase">a</span>' +
        '<span style="font-variant: small-caps">b</span>' +
        '<u style="text-decoration-style: double">c</u><u style="text-decoration-style: wavy">d</u>' +
        '<s style="text-decoration-style: double">e</s>' +
        '<span style="background-color: #ffff00">f</span><span style="background-color: #f2f2f2">g</span>' +
        '<span data-docx-run-style="Code">h</span><span data-docx-run-style="Absent">i</span></p>',
    );
    expect(xml).toContain('<w:spacing w:val="40"/>');
    expect(xml).toContain('<w:caps/>');
    expect(xml).toContain('<w:smallCaps/>');
    expect(xml).toContain('<w:u w:val="double"/>');
    expect(xml).toContain('<w:u w:val="wave"/>');
    expect(xml).toContain('<w:dstrike/>');
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain('<w:shd w:fill="F2F2F2" w:color="auto" w:val="clear"/>');
    expect(xml).toContain('<w:rStyle w:val="Code"/>');
    expect(xml).not.toContain('Absent');
  });

  it('liste importée : data-docx-num-indent retire les retraits portés par la numérotation', async () => {
    const { xml } = await toDocumentXml(
      '<ol data-docx-num-id="7"><li><p style="margin-left: 36pt; text-indent: -18pt" data-docx-style="ListParagraph" data-docx-num-indent>a</p>' +
        '<p style="margin-left: 36pt" data-docx-style="ListParagraph">suite</p></li></ol>',
    );
    expect(xml).not.toContain('<w:ind w:left="720" w:hanging="360"/>');
    expect(xml).toContain('<w:numPr><w:ilvl w:val="0"/><w:numId w:val="2"/></w:numPr>');
    expect(xml).toContain('<w:ind w:left="720"/>');
  });

  it('tableau : largeur, bordures déclarées (nil ailleurs), style, cellules (bordures, fond, vAlign, marges)', async () => {
    const { xml } = await toDocumentXml(
      '<table style="width: 300pt; border-top: 3pt solid #000000; border-bottom: 1pt solid #000000"><tbody><tr>' +
        '<td colwidth="200" style="border-right: 0.5pt solid #000000; background-color: #d9e2f3; vertical-align: middle; padding: 4pt 5.4pt 4pt 5.4pt">a</td>' +
        '<td colwidth="200" style="border-left: 0.5pt dotted #ff0000; vertical-align: bottom">b</td></tr></tbody></table>' +
        '<table style="width: 50%"><tr><td>c</td></tr></table>',
    );
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="6000"/>');
    expect(xml).toContain('<w:top w:val="single" w:color="000000" w:sz="24" w:space="1"/>');
    expect(xml).toContain('<w:left w:val="nil"/>');
    expect(xml).toContain('<w:insideH w:val="nil"/>');
    expect(xml).toContain(
      '<w:tcBorders><w:right w:val="single" w:color="000000" w:sz="4" w:space="4"/></w:tcBorders>',
    );
    expect(xml).toContain(
      '<w:tcBorders><w:left w:val="dotted" w:color="FF0000" w:sz="4" w:space="4"/></w:tcBorders>',
    );
    expect(xml).toContain('<w:shd w:fill="D9E2F3" w:color="auto" w:val="clear"/>');
    expect(xml).toContain('<w:vAlign w:val="center"/>');
    expect(xml).toContain('<w:vAlign w:val="bottom"/>');
    expect(xml).toContain(
      '<w:tcMar><w:top w:type="dxa" w:w="80"/><w:left w:type="dxa" w:w="108"/><w:bottom w:type="dxa" w:w="80"/><w:right w:type="dxa" w:w="108"/></w:tcMar>',
    );
    expect(xml).toContain('<w:tblW w:type="pct" w:w="2500"/>');
    // Sans largeur déclarée ni bordure, le quadrillage par défaut de docx reste.
    expect(count(xml, '<w:insideH w:val="single"')).toBe(1);
  });

  it('L49 : data-docx-look → w:tblLook avec les six drapeaux, rien sans attribut, aller-retour exact', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<table data-docx-look="firstRow noVBand"><tr><td>a</td></tr></table>' +
        '<table data-docx-look="bogus"><tr><td>b</td></tr></table>' +
        '<table><tr><td>c</td></tr></table>',
    );
    expect(warnings).toEqual([]);
    expect(count(xml, '<w:tblLook')).toBe(1);
    expect(xml).toMatch(
      /<w:tblLook w:firstRow="true" w:lastRow="false" w:firstColumn="false" w:lastColumn="false" w:noHBand="false" w:noVBand="true"\/>/,
    );
    const { html } = await roundTrip(
      '<table data-docx-look="noVBand firstRow lastColumn"><tr><td>a</td></tr></table>',
    );
    // Le lecteur relit l'élément et sérialise les drapeaux dans l'ordre du contrat, en dernier.
    expect(html).toContain('" data-docx-look="firstRow lastColumn noVBand"><tbody>');
  });

  it('les colonnes d’un tableau à largeur déclarée ne sont pas réduites à la page', async () => {
    const { xml } = await toDocumentXml(
      '<table style="width: 100%"><tr><td colwidth="400">a</td><td colwidth="400">b</td></tr></table>',
    );
    expect(xml).toContain('<w:gridCol w:w="6000"/>');
    expect(xml).not.toContain('w:tblLayout');
  });

  it('les styles du contrat survivent à un aller-retour export → import', async () => {
    const { html } = await roundTrip(
      '<p style="line-height: 1.5; margin-top: 12pt; margin-left: 28.35pt; text-indent: -14.15pt; border-bottom: 1pt solid #ff0000; background-color: #eeeeee" data-keep-next>' +
        '<span style="letter-spacing: 2pt; text-transform: uppercase">A</span><u style="text-decoration-style: double">b</u></p>',
    );
    const p = parseFragment(html).querySelector('p');
    const style = p?.getAttribute('style') ?? '';
    expect(style).toContain('line-height: 1.5');
    expect(style).toContain('margin-top: 12pt');
    expect(style).toContain('margin-left: 28.35pt');
    expect(style).toContain('text-indent: -14.15pt');
    expect(style).toContain('border-bottom: 1pt solid #ff0000');
    expect(style).toContain('background-color: #eeeeee');
    expect(p?.hasAttribute('data-keep-next')).toBe(true);
    expect(html).toContain('letter-spacing: 2pt');
    expect(html).toContain('text-transform: uppercase');
    expect(html).toContain('<u style="text-decoration-style: double">');
  });
});

describe('export neuf — options.layout', () => {
  it('page, marges, distances d’en-tête, colonnes, police et langue', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', {
        layout: {
          page: {
            size: 'Letter',
            orientation: 'landscape',
            margins: {
              topMm: 20,
              rightMm: 15,
              bottomMm: 20,
              leftMm: 15,
              headerMm: 10,
              footerMm: 10,
            },
          },
          columns: 2,
          defaultFont: { family: 'Georgia', sizePt: 12 },
          lang: 'fr-FR',
        },
      }),
    );
    const document = entries.get('word/document.xml') ?? '';
    expect(document).toContain('<w:pgSz w:w="15840" w:h="12240" w:orient="landscape"/>');
    expect(document).toContain(
      '<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850" w:header="567" w:footer="567" w:gutter="0"/>',
    );
    expect(document).toContain('<w:cols w:num="2" w:equalWidth="true"/>');
    const styles = entries.get('word/styles.xml') ?? '';
    expect(styles).toContain('w:ascii="Georgia"');
    expect(styles).toContain('<w:sz w:val="24"/>');
    expect(styles).toContain('<w:lang w:val="fr-FR"/>');
  });

  it('les options explicites priment champ par champ sur layout', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', {
        page: { margins: { top: 10 } },
        lang: 'en-GB',
        layout: {
          page: { size: 'A3', margins: { topMm: 50, leftMm: 30 } },
          defaultFont: { family: 'Arial' },
          lang: 'fr-FR',
        },
      }),
    );
    const document = entries.get('word/document.xml') ?? '';
    // Champ par champ : format A3 du layout, marge haute explicite 10 mm, marge gauche du layout.
    expect(document).toContain('<w:pgSz w:w="16838" w:h="23811" w:orient="portrait"/>');
    expect(document).toContain('w:top="567"');
    expect(document).toContain('w:left="1701"');
    const styles = entries.get('word/styles.xml') ?? '';
    expect(styles).toContain('<w:lang w:val="en-GB"/>');
    expect(styles).toContain('w:ascii="Arial"');
  });

  it('format libre en millimètres', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', { layout: { page: { size: { widthMm: 100, heightMm: 200 } } } }),
    );
    expect(entries.get('word/document.xml')).toContain(
      '<w:pgSz w:w="5669" w:h="11339" w:orient="portrait"/>',
    );
  });

  it('en-têtes et pieds default / first / even, première page différente, pages paires', async () => {
    const warnings: DocxExportWarning[] = [];
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', {
        onWarning: (warning) => warnings.push(warning),
        layout: {
          titlePage: true,
          headers: {
            default: { html: '<p style="text-align: right">En-tête <strong>courant</strong></p>' },
            first: { html: '<p>Première page</p>' },
            even: { html: '<p>Page paire</p>' },
          },
          footers: { default: { html: '<p>Pied</p>' } },
        },
      }),
    );
    expect(warnings).toEqual([]);
    const document = entries.get('word/document.xml') ?? '';
    expect(document).toContain('<w:headerReference w:type="default"');
    expect(document).toContain('<w:headerReference w:type="first"');
    expect(document).toContain('<w:headerReference w:type="even"');
    expect(document).toContain('<w:footerReference w:type="default"');
    expect(document).toContain('<w:titlePg/>');
    expect(entries.get('word/settings.xml')).toContain('<w:evenAndOddHeaders/>');
    const headers = Array.from(entries.entries())
      .filter(([name]) => /^word\/header\d+\.xml$/.test(name))
      .map(([, xml]) => xml);
    expect(headers).toHaveLength(3);
    expect(
      headers.some((xml) => xml.includes('courant') && xml.includes('<w:jc w:val="right"/>')),
    ).toBe(true);
    expect(headers.some((xml) => xml.includes('Première page'))).toBe(true);
    expect(headers.some((xml) => xml.includes('Page paire'))).toBe(true);
  });

  it('options.header prime sur layout.headers.default, first vient du layout', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', {
        header: 'Explicite',
        layout: {
          headers: { default: { html: '<p>Layout</p>' }, first: { html: '<p>Première</p>' } },
        },
      }),
    );
    const headers = Array.from(entries.entries())
      .filter(([name]) => /^word\/header\d+\.xml$/.test(name))
      .map(([, xml]) => xml)
      .join('');
    expect(headers).toContain('Explicite');
    expect(headers).not.toContain('Layout');
    expect(headers).toContain('Première');
  });

  it('un aller-retour export neuf → import rend le même layout', async () => {
    const layout = {
      page: {
        size: 'A4' as const,
        orientation: 'portrait' as const,
        margins: {
          topMm: 20,
          rightMm: 20,
          bottomMm: 20,
          leftMm: 20,
          headerMm: 12.7,
          footerMm: 12.7,
        },
      },
      headers: { default: { html: '<p>Haut</p>' } },
      footers: { default: { html: '<p>Bas</p>' } },
    };
    const { layout: read } = await roundTrip('<p>a</p>', { layout });
    expect(read.page).toEqual(layout.page);
    expect(read.headers?.default?.html).toContain('Haut');
    expect(read.footers?.default?.html).toContain('Bas');
  });
});
