import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx';
import { jsonToHtml } from './json-to-html';
import { toDocumentXml, toZipEntries } from './testing/sample';
import type { DocxExportOptions } from './types';

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/** Entrées du zip d'un export, avec un accès sûr par nom. */
async function entriesOf(
  html: string,
  options: DocxExportOptions = {},
): Promise<(name: string) => string> {
  const entries = await toZipEntries(await exportDocx(html, options));
  return (name) => {
    const entry = entries.get(name);
    if (entry === undefined) throw new Error(`entrée ${name} absente`);
    return entry;
  };
}

describe('fidélité Word — en-têtes et pieds de page', () => {
  it('écrit header1.xml depuis un texte et footer1.xml avec PAGE / NUMPAGES', async () => {
    const entry = await entriesOf('<p>corps</p>', {
      header: 'Confidentiel',
      footer: { text: 'Aster', align: 'right', pageNumbers: 'x-of-y' },
    });
    const header = entry('word/header1.xml');
    expect(header).toContain('<w:t xml:space="preserve">Confidentiel</w:t>');
    expect(header).not.toContain('<w:jc');
    const footer = entry('word/footer1.xml');
    expect(footer).toContain('<w:t xml:space="preserve">Aster</w:t>');
    expect(footer).toContain('<w:instrText xml:space="preserve">PAGE</w:instrText>');
    expect(footer).toContain('<w:instrText xml:space="preserve">NUMPAGES</w:instrText>');
    expect(footer).toContain('<w:t xml:space="preserve"> / </w:t>');
    expect(count(footer, '<w:jc w:val="right"/>')).toBe(2);
    const document = entry('word/document.xml');
    expect(document).toContain('<w:headerReference w:type="default"');
    expect(document).toContain('<w:footerReference w:type="default"');
  });

  it('accepte du HTML inline (gras, lien, variable) et un alignement centré', async () => {
    const entry = await entriesOf('<p>corps</p>', {
      header: {
        html: '<strong>Nebula</strong> — <a href="https://example.com">site</a> {{client}}',
        align: 'center',
      },
      footer: { pageNumbers: true },
      variables: { mode: 'resolve', values: { client: 'ACME' } },
    });
    const header = entry('word/header1.xml');
    expect(header).toContain('<w:b/>');
    expect(header).toContain('<w:hyperlink');
    expect(header).toContain('>site</w:t>');
    expect(header).toContain('ACME</w:t>');
    expect(header).toContain('<w:jc w:val="center"/>');
    const footer = entry('word/footer1.xml');
    expect(footer).toContain('PAGE</w:instrText>');
    expect(footer).not.toContain('NUMPAGES');
    expect(footer).toContain('<w:jc w:val="center"/>');
  });

  it('respecte l’alignement propre d’un paragraphe HTML et assainit le texte', async () => {
    const entry = await entriesOf('<p>corps</p>', {
      header: { html: '<p style="text-align:right">droite</p><p>défaut</p>', align: 'center' },
      footer: `pied\u0001\nligne 2`,
    });
    const header = entry('word/header1.xml');
    expect(count(header, '<w:jc w:val="right"/>')).toBe(1);
    expect(count(header, '<w:jc w:val="center"/>')).toBe(1);
    const footer = entry('word/footer1.xml');
    expect(footer).toContain('>pied</w:t>');
    expect(footer).toContain('<w:br/>');
    expect(footer).toContain('>ligne 2</w:t>');
  });

  it('n’émet ni en-tête ni pied pour une option vide', async () => {
    const entries = await toZipEntries(
      await exportDocx('<p>a</p>', { header: '   ', footer: { html: '' } }),
    );
    expect(entries.has('word/header1.xml')).toBe(false);
    expect(entries.has('word/footer1.xml')).toBe(false);
  });
});

describe('fidélité Word — sauts de page', () => {
  it('traduit div/hr data-page-break en w:br page et page-break-before en pageBreakBefore', async () => {
    const { xml } = await toDocumentXml(
      '<p>a</p><div data-page-break></div><p>b</p><hr data-page-break><p style="page-break-before: always">c</p>' +
        '<h2 style="break-before: page">d</h2><p data-page-break>e</p><hr>',
    );
    expect(count(xml, '<w:br w:type="page"/>')).toBe(2);
    expect(count(xml, '<w:pageBreakBefore/>')).toBe(3);
    // Le `<hr data-page-break>` n'est pas un filet, le `<hr>` final en est un.
    expect(count(xml, '<w:pBdr>')).toBe(1);
    expect(xml).toContain('>e</w:t>');
  });

  it('sérialise un nœud JSON pageBreak', () => {
    expect(jsonToHtml({ type: 'doc', content: [{ type: 'pageBreak' }] })).toBe(
      '<div data-page-break></div>',
    );
  });
});

describe('fidélité Word — table des matières', () => {
  it('insère le champ TOC en tête, prérempli, avec mise à jour à l’ouverture', async () => {
    const entry = await entriesOf('<h1>Un</h1><p>texte</p><h2>Un.un</h2><h4>profond</h4>', {
      toc: { title: 'Sommaire', levels: 2 },
    });
    const document = entry('word/document.xml');
    expect(document).toContain('<w:fldChar w:fldCharType="begin" w:dirty="true"/>');
    expect(document).toContain('TOC \\h \\o &quot;1-2&quot;</w:instrText>');
    expect(document).toContain('<w:pStyle w:val="TOCHeading"/>');
    expect(document.indexOf('Sommaire')).toBeLessThan(document.indexOf('>Un</w:t>'));
    // Entrées préremplies par docx depuis les titres, dans la plage demandée.
    expect(document).toContain('<w:pStyle w:val="TOC1"/>');
    expect(document).toContain('<w:pStyle w:val="TOC2"/>');
    expect(document).not.toContain('<w:pStyle w:val="TOC4"/>');
    expect(entry('word/settings.xml')).toContain('<w:updateFields/>');
    expect(entry('word/styles.xml')).toContain('w:styleId="TOCHeading"');
  });

  it('toc: true vaut trois niveaux sans titre', async () => {
    const entry = await entriesOf('<h1>Un</h1>', { toc: true });
    const document = entry('word/document.xml');
    expect(document).toContain('TOC \\h \\o &quot;1-3&quot;</w:instrText>');
    expect(document).not.toContain('TOCHeading');
  });

  it('toc: false ne change rien', async () => {
    const entry = await entriesOf('<h1>Un</h1>', { toc: false });
    expect(entry('word/document.xml')).not.toContain('instrText');
    expect(entry('word/settings.xml')).not.toContain('updateFields');
  });
});

describe('fidélité Word — numérotation et styles des titres', () => {
  it('lie une numérotation 1. / 1.1. aux styles Heading1..n', async () => {
    const entry = await entriesOf('<h1>Un</h1><h2>Deux</h2><h3>Trois</h3>', {
      numberedHeadings: { levels: 2 },
    });
    const numbering = entry('word/numbering.xml');
    expect(numbering).toContain('<w:pStyle w:val="Heading1"/>');
    expect(numbering).toContain('<w:pStyle w:val="Heading2"/>');
    expect(numbering).not.toContain('<w:pStyle w:val="Heading3"/>');
    expect(numbering).toContain('<w:lvlText w:val="%1."/>');
    expect(numbering).toContain('<w:lvlText w:val="%1.%2."/>');
    const styles = entry('word/styles.xml');
    const heading1 = styles.slice(styles.indexOf('w:styleId="Heading1"'));
    expect(heading1.slice(0, heading1.indexOf('</w:style>'))).toContain('<w:numPr>');
    // Les défauts de docx sont conservés quand seule la numérotation est demandée.
    expect(heading1.slice(0, heading1.indexOf('</w:style>'))).toContain(
      '<w:color w:val="2E74B5"/>',
    );
    const heading3 = styles.slice(styles.indexOf('w:styleId="Heading3"'));
    expect(heading3.slice(0, heading3.indexOf('</w:style>'))).not.toContain('<w:numPr>');
  });

  it('format legal : 1 / 1.1 / 1.1.1 sans point final', async () => {
    const entry = await entriesOf('<h1>Un</h1>', { numberedHeadings: { format: 'legal' } });
    const numbering = entry('word/numbering.xml');
    expect(numbering).toContain('<w:lvlText w:val="%1"/>');
    expect(numbering).toContain('<w:lvlText w:val="%1.%2.%3"/>');
    expect(numbering).toContain('<w:isLgl/>');
  });

  it('surcharge couleur, taille, gras et police d’un titre sans toucher aux autres', async () => {
    const entry = await entriesOf('<h1>Un</h1><h2>Deux</h2>', {
      headingStyles: { h1: { color: '#123456', sizePt: 20, bold: true, font: 'Georgia' } },
      numberedHeadings: true,
    });
    const styles = entry('word/styles.xml');
    const heading1 = styles.slice(styles.indexOf('w:styleId="Heading1"'));
    const block = heading1.slice(0, heading1.indexOf('</w:style>'));
    expect(block).toContain('<w:color w:val="123456"/>');
    expect(block).toContain('<w:sz w:val="40"/>');
    expect(block).toContain('<w:b/>');
    expect(block).toContain('w:ascii="Georgia"');
    const heading2 = styles.slice(styles.indexOf('w:styleId="Heading2"'));
    expect(heading2.slice(0, heading2.indexOf('</w:style>'))).toContain(
      '<w:color w:val="2E74B5"/>',
    );
  });

  it('accepte une couleur RRGGBB nue et ignore une couleur illisible', async () => {
    const entry = await entriesOf('<h1>Un</h1>', {
      headingStyles: { h1: { color: 'abcdef' }, h2: { color: 'pas-une-couleur', italics: true } },
    });
    const styles = entry('word/styles.xml');
    expect(styles).toContain('<w:color w:val="ABCDEF"/>');
    const heading2 = styles.slice(styles.indexOf('w:styleId="Heading2"'));
    const block = heading2.slice(0, heading2.indexOf('</w:style>'));
    expect(block).toContain('<w:color w:val="2E74B5"/>');
    expect(block).toContain('<w:i/>');
  });
});

describe('fidélité Word — mise en page, langue et police', () => {
  it('A4 paysage avec marges en mm', async () => {
    const { xml } = await toDocumentXml('<p>a</p>', {
      page: { orientation: 'landscape', margins: { top: 20, bottom: 20, left: 15, right: 15 } },
    });
    expect(xml).toContain('<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/>');
    expect(xml).toContain('<w:pgMar w:top="1134" w:right="850" w:bottom="1134" w:left="850"');
  });

  it('page.size prime sur pageSize et le portrait reste sans orient', async () => {
    const { xml } = await toDocumentXml('<p>a</p>', {
      pageSize: 'A4',
      page: { size: 'LETTER' },
    });
    expect(xml).toContain('<w:pgSz w:w="12240" w:h="15840" w:orient="portrait"/>');
    expect(xml).toContain('<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"');
  });

  it('plafonne les images à la largeur utile en paysage', async () => {
    const { xml } = await toDocumentXml('<p>a</p>', {
      page: { orientation: 'landscape', margins: { top: -1 } },
    });
    // Une marge négative garde le défaut.
    expect(xml).toContain('w:top="1440"');
    expect(xml).toContain('w:orient="landscape"');
  });

  it('écrit la langue, la police et la taille par défaut dans docDefaults', async () => {
    const entry = await entriesOf('<p>a</p>', {
      lang: 'fr-FR',
      defaultFont: { family: 'Arial', sizePt: 12 },
    });
    const styles = entry('word/styles.xml');
    const defaults = styles.slice(
      styles.indexOf('<w:docDefaults>'),
      styles.indexOf('</w:docDefaults>'),
    );
    expect(defaults).toContain('<w:lang w:val="fr-FR"/>');
    expect(defaults).toContain('w:ascii="Arial"');
    expect(defaults).toContain('<w:sz w:val="24"/>');
  });

  it('n’écrit aucune propriété par défaut sans option', async () => {
    const entry = await entriesOf('<p>a</p>');
    const styles = entry('word/styles.xml');
    const defaults = styles.slice(
      styles.indexOf('<w:docDefaults>'),
      styles.indexOf('</w:docDefaults>'),
    );
    expect(defaults).not.toContain('<w:lang');
    expect(defaults).not.toContain('w:ascii=');
  });
});
