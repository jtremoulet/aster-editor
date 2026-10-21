import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../export/export-docx.js';
import { compareDocx } from './compare/compare-docx.js';
import { importDocx } from './import-docx.js';
import { buildDocx, headerXml, run as runXml } from './preprocess/minimal-docx.js';
import { normalizeHtml, parseFragment } from './testing/dom.js';

/**
 * Session 5, L53 (retour POC n° 1) : les champs Word d'un en-tête (`TITLE`, `DOCPROPERTY`,
 * `AUTHOR`, `DATE`, `PAGE`), un contrôle de contenu lié à une propriété du document
 * (`w:sdt` + `w:dataBinding`, `w:alias="Titre"`) et un champ complexe sans `separate` ne
 * deviennent jamais des variables : seuls `MERGEFIELD` et `{{nom}}` le deviennent. Fixture
 * 20 (`scripts/generate-fixtures-fields.ts`) et `.docx` minimaux.
 */

const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');

function fixture(name: string): ArrayBuffer {
  const buffer = readFileSync(join(FIXTURES, `${name}.docx`));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

function expected(name: string): string {
  return readFileSync(join(FIXTURES, 'expected', `${name}.html`), 'utf8');
}

/** Puces de variables d'un fragment HTML, dans l'ordre. */
function variableNames(html: string): string[] {
  return Array.from(parseFragment(html).querySelectorAll('[data-aster-variable]')).map(
    (element) => element.getAttribute('data-aster-variable') ?? '',
  );
}

/** Contrôle de contenu « Propriété du document » de Word (`w:dataBinding` vers `dc:title`). */
function boundTitleControl(content: string): string {
  return (
    '<w:sdt><w:sdtPr><w:alias w:val="Titre"/><w:tag w:val=""/><w:id w:val="7"/>' +
    '<w:dataBinding w:prefixMappings="xmlns:ns0=\'http://purl.org/dc/elements/1.1/\'" ' +
    'w:xpath="/ns0:title[1]" w:storeItemID="{00000000-0000-0000-0000-000000000000}"/>' +
    `<w:text/><w:showingPlcHdr/></w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`
  );
}

/** Lignes de l'en-tête et du corps de la fixture 20, telles que le lecteur les rend. */
const RENDERED_LINES = [
  'Champ TITLE : | DOCPROPERTY Title : Titre du document',
  'DOCPROPERTY Company : Aster Editor | AUTHOR : Auteur démo | DATE : 21/10/2026 | PAGE : ',
  'Propriété du document liée : [Titre]',
  'Champ complexe TITLE sans separate : ',
];

describe('20-champs-en-tete : champs, contrôle lié, fusion et {{nom}} en en-tête et dans le corps', () => {
  it('seuls MERGEFIELD et {{nom}} deviennent des variables ; les autres champs rendent leur résultat', async () => {
    const result = await importDocx(fixture('20-champs-en-tete'), { fidelity: 'styled' });
    expect(result.variables).toEqual([{ name: 'Nom' }, { name: 'Societe' }]);
    expect(variableNames(result.html)).toEqual(['Nom', 'Societe']);
    expect(result.html).toContain(
      'Fusion : <span data-aster-variable="Nom">{{Nom}}</span> | Société tapée : <span data-aster-variable="Societe">{{Societe}}</span>',
    );
    for (const line of RENDERED_LINES) {
      expect(result.html).toContain(`<p data-docx-style="Normal">${line}</p>`);
    }
    // Ni `{{Titre}}` ni `{{titre}}` : le contrôle lié rend son espace réservé en texte ordinaire.
    expect(result.html).not.toMatch(/\{\{titre\}\}/i);
    expect(normalizeHtml(result.html)).toBe(normalizeHtml(expected('20-champs-en-tete')));
  });

  it('l’en-tête rend les mêmes lignes, `{{Nom}}` et `{{Societe}}` en texte, jamais `{{Titre}}`', async () => {
    const result = await importDocx(fixture('20-champs-en-tete'), { fidelity: 'styled' });
    const header = result.layout.headers?.default?.html ?? '';
    expect(header).toBe(
      [
        ...RENDERED_LINES.slice(0, 3),
        'Fusion : {{Nom}} | Société tapée : {{Societe}}',
        RENDERED_LINES[3],
      ]
        .map((line) => `<p data-docx-style="Normal">${line}</p>`)
        .join(''),
    );
    expect(header).not.toMatch(/\{\{titre\}\}/i);
    expect(result.layout.sections?.[0]?.headers?.default?.html).toBe(header);
  });

  it('les champs hors fusion sont signalés comme objets perdus, pas comme variables', async () => {
    const result = await importDocx(fixture('20-champs-en-tete'), { fidelity: 'styled' });
    const fields = (where: 'body' | 'header'): string[] =>
      result.lost
        .filter((item) => item.where === where)
        .map((item) => `${item.kind}:${item.detail ?? ''}:${item.text ?? ''}`);
    const expectedFields = [
      'field:champ TITLE:',
      'field:champ DOCPROPERTY:Titre du document',
      'field:champ DOCPROPERTY:Aster Editor',
      'field:champ AUTHOR:Auteur démo',
      'field:champ DATE:21/10/2026',
    ];
    expect(fields('body')).toEqual(expectedFields);
    expect(fields('header')).toEqual(expectedFields);
    expect(result.lost).toHaveLength(10);
    expect(result.warnings.every((warning) => warning.code === 'object-lost')).toBe(true);
    expect(result.warnings.filter((w) => w.code !== 'object-lost')).toEqual([]);
  });

  it('export dans le gabarit sans modification : en-tête identique à l’octet, score 1', async () => {
    const original = fixture('20-champs-en-tete');
    const imported = await importDocx(original, { fidelity: 'styled' });
    const blob = await exportDocx(imported.html, {
      template: imported.template,
      layout: imported.layout,
    });
    const report = await compareDocx(original, await blob.arrayBuffer());
    expect(report.identicalParts).toContain('word/header1.xml');
    expect(report.changedParts).toEqual([]);
    expect(report.properties.filter((p) => p.lost > 0)).toEqual([]);
    expect(report.score).toBe(1);
  });

  it('mode resolve : {{Nom}} et {{Societe}} de l’en-tête résolus, les autres champs et le contrôle lié conservés', async () => {
    const imported = await importDocx(fixture('20-champs-en-tete'), { fidelity: 'styled' });
    const blob = await exportDocx(imported.html, {
      template: imported.template,
      layout: imported.layout,
      variables: { mode: 'resolve', values: { Nom: 'Dupont', Societe: 'ACME' } },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const header = (await zip.file('word/header1.xml')?.async('string')) ?? '';
    expect(header).toContain('Fusion : </w:t></w:r><w:r><w:t xml:space="preserve">Dupont</w:t>');
    expect(header).toContain('Société tapée : ACME');
    expect(header).not.toContain('{{');
    expect(header).not.toContain('MERGEFIELD');
    // Champs non-variables réécrits tels quels : instruction et résultat en cache.
    expect(header).toContain('<w:fldSimple w:instr="TITLE"/>');
    expect(header).toContain('<w:fldSimple w:instr="DOCPROPERTY Title \\* MERGEFORMAT">');
    expect(header).toContain('<w:fldSimple w:instr="AUTHOR">');
    expect(header).toContain('<w:instrText xml:space="preserve">PAGE</w:instrText>');
    expect(header).toContain('<w:instrText xml:space="preserve"> TITLE </w:instrText>');
    // Le contrôle lié reste un `w:sdt` avec sa liaison et son espace réservé.
    expect(header).toMatch(/<w:sdt><w:sdtPr><w:alias w:val="Titre"\/>[\s\S]*<w:dataBinding /);
    expect(header).toContain('<w:t>[Titre]</w:t></w:r></w:sdtContent></w:sdt>');
  });

  it('en-tête régénéré (HTML modifié) : les résultats des champs restent en texte, le reste du gabarit intact', async () => {
    const original = fixture('20-champs-en-tete');
    const imported = await importDocx(original, { fidelity: 'styled' });
    const html = `${imported.layout.headers?.default?.html ?? ''}<p>Ligne ajoutée</p>`;
    const headers = { default: { html } };
    const blob = await exportDocx(imported.html, {
      template: imported.template,
      layout: {
        ...imported.layout,
        headers,
        sections: imported.layout.sections?.map((section) => ({ ...section, headers })),
      },
    });
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const parts = await Promise.all(
      zip
        .file(/^word\/header\d*\.xml$/)
        .map(async (file) => [file.name, await file.async('string')]),
    );
    const regenerated = parts.find(([, xml]) => xml?.includes('Ligne ajoutée'));
    expect(regenerated).toBeDefined();
    const xml = regenerated?.[1] ?? '';
    // Résultats des champs conservés en texte ; les champs eux-mêmes ne sont pas réécrits.
    expect(xml).toContain('Titre du document');
    expect(xml).toContain('Auteur démo');
    expect(xml).toContain('21/10/2026');
    expect(xml).toContain('[Titre]');
    expect(xml).not.toContain('<w:fldSimple w:instr="TITLE"');
    expect(xml).not.toContain('<w:sdt>');
    // Mode `placeholders` : `{{Nom}}` et `{{Societe}}` restent en texte, jamais `{{Titre}}`.
    expect(xml).toContain('{{Nom}}');
    expect(xml).toContain('{{Societe}}');
    expect(xml).not.toMatch(/\{\{titre\}\}/i);
    // L'ancienne partie n'est pas touchée.
    const report = await compareDocx(original, await blob.arrayBuffer());
    expect(report.identicalParts).toContain('word/header1.xml');
    expect(report.identicalParts).toContain('word/styles.xml');
  });
});

describe('chemins candidats du retour n° 1 sur des .docx minimaux', () => {
  it('champ complexe TITLE sans separate : rien rendu, aucune variable, signalé perdu', async () => {
    const docx = await buildDocx(
      `<w:p>${runXml('Avant ')}` +
        '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText xml:space="preserve"> TITLE </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
        `${runXml(' après')}</w:p>`,
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe('<p>Avant  après</p>');
    expect(result.variables).toEqual([]);
    expect(result.lost).toEqual([{ kind: 'field', where: 'body', detail: 'champ TITLE' }]);
  });

  it('MERGEFIELD complexe sans separate ni résultat : variable sans valeur (comportement conservé)', async () => {
    const docx = await buildDocx(
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
        '<w:r><w:instrText xml:space="preserve"> MERGEFIELD Ref </w:instrText></w:r>' +
        '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>',
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe('<p><span data-aster-variable="Ref">{{Ref}}</span></p>');
    expect(result.variables).toEqual([{ name: 'Ref' }]);
  });

  it('fldSimple TITLE à résultat vide, DOCPROPERTY avec résultat : texte du résultat seul', async () => {
    const docx = await buildDocx(
      `<w:p>${runXml('A')}<w:fldSimple w:instr="TITLE"/>${runXml('B')}` +
        `<w:fldSimple w:instr=" DOCPROPERTY Company \\* MERGEFORMAT ">${runXml('Aster')}</w:fldSimple>${runXml('C')}</w:p>`,
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe('<p>ABAsterC</p>');
    expect(result.variables).toEqual([]);
  });

  it('contrôle lié à une propriété du document (w:dataBinding) : contenu rendu, jamais une variable', async () => {
    const docx = await buildDocx(
      `<w:p>${runXml('Titre : ')}${boundTitleControl(runXml('[Titre]'))}</w:p>` +
        `<w:p>${boundTitleControl(runXml('Mon document'))}</w:p>`,
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe('<p>Titre : [Titre]</p><p>Mon document</p>');
    expect(result.variables).toEqual([]);
    expect(result.lost).toEqual([]);
  });

  it('fldSimple imbriqué dans un contrôle lié : résultat du champ en texte, pas de variable', async () => {
    const docx = await buildDocx(
      `<w:p>${boundTitleControl(
        `<w:fldSimple w:instr=" DOCPROPERTY Title ">${runXml('Rapport')}</w:fldSimple>`,
      )}</w:p>`,
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe('<p>Rapport</p>');
    expect(result.variables).toEqual([]);
  });

  it('contrôle lié dans un en-tête : espace réservé en texte dans layout.headers, aucune variable', async () => {
    const R_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const docx = await buildDocx(
      `<w:p>${runXml('Corps')}</w:p>` +
        `<w:sectPr><w:headerReference xmlns:r="${R_NS}" w:type="default" r:id="rId9"/></w:sectPr>`,
      {
        'word/_rels/document.xml.rels':
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          `<Relationship Id="rId9" Type="${R_NS}/header" Target="header1.xml"/>` +
          '</Relationships>',
        'word/header1.xml': headerXml(
          `<w:p>${runXml('Titre : ')}${boundTitleControl(runXml('[Titre]'))}${runXml(' — ')}` +
            `<w:fldSimple w:instr=" MERGEFIELD Nom ">${runXml('«Nom»')}</w:fldSimple></w:p>`,
        ),
      },
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe('<p>Corps</p>');
    expect(result.layout.headers?.default?.html).toBe('<p>Titre : [Titre] — {{Nom}}</p>');
    expect(result.variables).toEqual([{ name: 'Nom' }]);
  });

  it('contrôle non lié avec alias seul : reste une variable (`w:alias` normalisé, fixture 10)', async () => {
    const docx = await buildDocx(
      '<w:p><w:sdt><w:sdtPr><w:alias w:val="Titre"/><w:id w:val="8"/><w:text/></w:sdtPr>' +
        `<w:sdtContent>${runXml('[Titre]')}</w:sdtContent></w:sdt></w:p>`,
    );
    const result = await importDocx(docx, { fidelity: 'styled' });
    expect(result.html).toBe(
      '<p><span data-aster-variable="Titre" data-label="Titre">{{Titre}}</span></p>',
    );
    expect(result.variables).toEqual([{ name: 'Titre', label: 'Titre', value: '[Titre]' }]);
  });
});
