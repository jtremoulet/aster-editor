import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exportDocx } from '../index.js';
import { importDocx } from './import-docx.js';
import { buildDocx, documentXml, headerXml, run, W_NS } from './preprocess/minimal-docx.js';
import { normalizeHtml } from './testing/dom.js';

/** Charge une fixture .docx en `ArrayBuffer` détaché du pool de buffers Node. */
function loadFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/${name}.docx`);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

/** Attendu du chemin par défaut (stylé, 0.6), ou du chemin `semantic` (mammoth, 0.4.x). */
function loadExpected(name: string, fidelity: 'styled' | 'semantic' = 'styled'): string {
  const dir = fidelity === 'semantic' ? 'expected/semantic' : 'expected';
  return readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/${dir}/${name}.html`, 'utf8');
}

describe('importDocx : variables', () => {
  describe('08-variables-braces', () => {
    it('détecte {{nom}} dans titre, marques, liste, table, et recolle un {{ coupé sur deux runs', async () => {
      const result = await importDocx(loadFixture('08-variables-braces'));
      expect(result.variables).toEqual([
        { name: 'client.nom' },
        { name: 'prestataire' },
        { name: 'client.representant' },
        { name: 'date_signature' },
        { name: 'prestation' },
        { name: 'duree_jours' },
        { name: 'montant_ht' },
        { name: 'tva' },
        { name: 'lieu' },
      ]);
      expect(result.html).toContain(
        '<strong><span data-aster-variable="prestataire">{{prestataire}}</span></strong>',
      );
      expect(result.html).toContain('accolades { seules } et un {{ incomplet.');
      expect(result.warnings).toEqual([]);
    });

    it('correspond au HTML stylé attendu (chemin par défaut)', async () => {
      const { html } = await importDocx(loadFixture('08-variables-braces'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('08-variables-braces')));
    });

    it('fidelity: semantic correspond au HTML sémantique attendu, mêmes variables', async () => {
      const result = await importDocx(loadFixture('08-variables-braces'), {
        fidelity: 'semantic',
      });
      expect(normalizeHtml(result.html)).toBe(
        normalizeHtml(loadExpected('08-variables-braces', 'semantic')),
      );
      expect(result.variables.map((variable) => variable.name)).toEqual(
        (await importDocx(loadFixture('08-variables-braces'))).variables.map((v) => v.name),
      );
    });

    it('garde {{nom}} en texte quand braces est désactivé', async () => {
      const result = await importDocx(loadFixture('08-variables-braces'), {
        variables: { detect: ['mergeFields', 'contentControls'] },
      });
      expect(result.html).not.toContain('data-aster-variable');
      expect(result.html).toContain('{{client.nom}}');
      expect(result.variables).toEqual([]);
    });
  });

  describe('09-variables-mergefields', () => {
    it('convertit les champs en puces ; seul le résultat qui n’est pas un placeholder «nom» devient une valeur', async () => {
      const result = await importDocx(loadFixture('09-variables-mergefields'));
      expect(result.variables).toEqual([
        { name: 'Nom' },
        { name: 'NumeroFacture' },
        { name: 'Montant' },
        // Le résultat « 12/03/2026 » est entre guillemets français : placeholder Word, pas une valeur.
        { name: 'DateEcheance' },
        { name: 'Signataire' },
      ]);
      expect(result.html).not.toContain('«');
      expect(result.warnings).toEqual([]);
    });

    it('correspond au HTML stylé attendu (chemin par défaut)', async () => {
      const { html } = await importDocx(loadFixture('09-variables-mergefields'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('09-variables-mergefields')));
    });

    it('fidelity: semantic correspond au HTML sémantique attendu', async () => {
      const { html } = await importDocx(loadFixture('09-variables-mergefields'), {
        fidelity: 'semantic',
      });
      expect(normalizeHtml(html)).toBe(
        normalizeHtml(loadExpected('09-variables-mergefields', 'semantic')),
      );
    });

    it('garde le résultat des champs quand mergeFields est désactivé (lecteur stylé)', async () => {
      const result = await importDocx(loadFixture('09-variables-mergefields'), {
        variables: { detect: ['braces'] },
      });
      expect(result.variables).toEqual([]);
      // Le lecteur stylé rend le résultat affiché par Word, sans en faire une variable.
      expect(result.html).toContain('Madame, Monsieur «Nom», votre facture');
      expect(result.html).not.toContain('data-aster-variable');
    });

    it('perd les champs comme mammoth seul quand mergeFields est désactivé (semantic)', async () => {
      const result = await importDocx(loadFixture('09-variables-mergefields'), {
        fidelity: 'semantic',
        variables: { detect: ['braces'] },
      });
      expect(result.variables).toEqual([]);
      expect(result.html).toContain('Madame, Monsieur , votre facture');
    });
  });

  describe('10-variables-content-controls', () => {
    it('convertit les contrôles en puces avec libellé et valeur saisie, sans le texte de remplissage', async () => {
      const result = await importDocx(loadFixture('10-variables-content-controls'));
      expect(result.variables).toEqual([
        { name: 'nom_complet', label: 'Nom complet', value: 'Jean Dupont' },
        { name: 'objet', label: 'Objet', value: 'le présent document' },
        { name: 'date', label: 'Date' },
      ]);
      expect(result.html).not.toContain('Cliquez ici');
      expect(result.warnings).toEqual([]);
    });

    it('correspond au HTML stylé attendu (chemin par défaut)', async () => {
      const { html } = await importDocx(loadFixture('10-variables-content-controls'));
      expect(normalizeHtml(html)).toBe(
        normalizeHtml(loadExpected('10-variables-content-controls')),
      );
    });

    it('fidelity: semantic correspond au HTML sémantique attendu', async () => {
      const { html } = await importDocx(loadFixture('10-variables-content-controls'), {
        fidelity: 'semantic',
      });
      expect(normalizeHtml(html)).toBe(
        normalizeHtml(loadExpected('10-variables-content-controls', 'semantic')),
      );
    });

    it('ne touche à rien avec detect: []', async () => {
      const result = await importDocx(loadFixture('10-variables-content-controls'), {
        variables: { detect: [] },
      });
      expect(result.variables).toEqual([]);
      expect(result.html).toContain('Je soussigné Jean Dupont');
    });
  });

  describe('documents construits', () => {
    it('applique un motif personnalisé, et {{nom}} seulement pour les variables issues des champs', async () => {
      const docx = await buildDocx(
        `<w:p>${run('Bonjour [prenom], ')}<w:fldSimple w:instr=" MERGEFIELD Nom ">${run('«Nom»')}</w:fldSimple>${run(' et {{ignore}}')}</w:p>`,
      );
      const result = await importDocx(docx, { variables: { pattern: /\[([a-z_]+)\]/g } });
      expect(result.html).toBe(
        '<p>Bonjour <span data-aster-variable="prenom">{{prenom}}</span>, <span data-aster-variable="Nom">{{Nom}}</span> et {{ignore}}</p>',
      );
      expect(result.variables).toEqual([{ name: 'prenom' }, { name: 'Nom' }]);
    });

    it('remonte les variables d’un en-tête, absentes du HTML que mammoth ne rend pas', async () => {
      const docx = await buildDocx(`<w:p>${run('Corps {{a}}')}</w:p>`, {
        'word/header1.xml': headerXml(
          `<w:p><w:fldSimple w:instr=" MERGEFIELD Societe ">${run('«Societe»')}</w:fldSimple></w:p>`,
        ),
      });
      const result = await importDocx(docx);
      expect(result.html).toBe('<p>Corps <span data-aster-variable="a">{{a}}</span></p>');
      expect(result.variables).toEqual([{ name: 'a' }, { name: 'Societe' }]);
    });

    it('importe sans prétraitement et avertit quand une partie XML est illisible', async () => {
      const docx = await buildDocx(`<w:p>${run('Corps {{a}}')}</w:p>`, {
        'word/header1.xml': '<w:hdr><w:p><w:sdt>',
      });
      const result = await importDocx(docx);
      expect(result.html).toBe('<p>Corps <span data-aster-variable="a">{{a}}</span></p>');
      expect(result.variables).toEqual([{ name: 'a' }]);
      expect(result.warnings).toEqual([
        { code: 'variables-preprocess-failed', message: expect.stringContaining('illisible') },
      ]);
    });

    it('réimporte un export en mode fields avec ses valeurs connues (aller-retour)', async () => {
      const html =
        '<p>Bonjour <span data-aster-variable="nom" data-label="Nom">{{nom}}</span>, de ' +
        '<span data-aster-variable="societe">{{societe}}</span> ({{ville}}).</p>';
      const blob = await exportDocx(html, {
        variables: { mode: 'fields', values: { nom: 'Alice', societe: 'ACME & Cie' } },
      });
      const expectedVariables = [
        { name: 'nom', value: 'Alice' },
        { name: 'societe', value: 'ACME & Cie' },
        { name: 'ville' },
      ];
      const expectedBody =
        'Bonjour <span data-aster-variable="nom">{{nom}}</span>, de ' +
        '<span data-aster-variable="societe">{{societe}}</span> ' +
        '(<span data-aster-variable="ville">{{ville}}</span>).';
      // Chemin par défaut (stylé) : le paragraphe porte son style Word, les puces sont les mêmes.
      const styled = await importDocx(await blob.arrayBuffer());
      expect(styled.variables).toEqual(expectedVariables);
      expect(styled.html).toBe(`<p data-docx-style="Normal">${expectedBody}</p>`);
      expect(styled.warnings).toEqual([]);
      // Chemin mammoth : HTML nu, mêmes variables.
      const semantic = await importDocx(await blob.arrayBuffer(), { fidelity: 'semantic' });
      expect(semantic.variables).toEqual(expectedVariables);
      expect(semantic.html).toBe(`<p>${expectedBody}</p>`);
      expect(semantic.warnings).toEqual([]);
    });

    it('n’avertit pas sur le style PlaceholderText d’un contrôle au texte de remplissage (I-5)', async () => {
      const styles =
        `<?xml version="1.0" encoding="UTF-8"?><w:styles xmlns:w="${W_NS}">` +
        '<w:style w:type="character" w:styleId="PlaceholderText"><w:name w:val="Placeholder Text"/></w:style>' +
        '</w:styles>';
      const placeholder = run('Cliquez ici', '<w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr>');
      const docx = await buildDocx(
        `<w:p>${run('Le ')}<w:sdt><w:sdtPr><w:tag w:val="date"/><w:showingPlcHdr/></w:sdtPr>` +
          `<w:sdtContent>${placeholder}</w:sdtContent></w:sdt></w:p>`,
        { 'word/styles.xml': styles },
      );
      const result = await importDocx(docx);
      expect(result.warnings).toEqual([]);
      expect(result.html).toBe('<p>Le <span data-aster-variable="date">{{date}}</span></p>');
      expect(result.variables).toEqual([{ name: 'date' }]);
    });

    it('lit un corps nommé document2.xml, désigné par _rels/.rels (I-2)', async () => {
      const docx = await buildDocx(`<w:p>${run('leurre')}</w:p>`, {
        '_rels/.rels':
          '<?xml version="1.0" encoding="UTF-8"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document2.xml"/>' +
          '</Relationships>',
        'word/document2.xml': documentXml(
          `<w:p>${run('Bonjour ')}<w:fldSimple w:instr=" MERGEFIELD Nom ">${run('«Nom»')}</w:fldSimple></w:p>`,
        ),
      });
      const result = await importDocx(docx);
      expect(result.html).toBe('<p>Bonjour <span data-aster-variable="Nom">{{Nom}}</span></p>');
      expect(result.variables).toEqual([{ name: 'Nom' }]);
    });

    it('remonte les {{nom}} tapés dans un en-tête après ceux du corps, seulement avec braces (I-7)', async () => {
      const docx = await buildDocx(`<w:p>${run('Corps {{a}}')}</w:p>`, {
        'word/header1.xml': headerXml(`<w:p>${run('{{societe}} — {{a}}')}</w:p>`),
      });
      const result = await importDocx(docx);
      expect(result.variables).toEqual([{ name: 'a' }, { name: 'societe' }]);
      const without = await importDocx(docx, {
        variables: { detect: ['mergeFields', 'contentControls'] },
      });
      expect(without.variables).toEqual([]);
    });
  });
});
