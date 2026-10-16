import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { importDocx } from './import-docx';
import { buildDocx, headerXml, run } from './preprocess/minimal-docx';
import { normalizeHtml } from './testing/dom';

/** Charge une fixture .docx en `ArrayBuffer` détaché du pool de buffers Node. */
function loadFixture(name: string): ArrayBuffer {
  const buffer = readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/${name}.docx`);
  return buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  ) as ArrayBuffer;
}

function loadExpected(name: string): string {
  return readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/expected/${name}.html`, 'utf8');
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

    it('correspond au HTML attendu', async () => {
      const { html } = await importDocx(loadFixture('08-variables-braces'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('08-variables-braces')));
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
    it('convertit les champs simples et le champ complexe en puces, sans valeur', async () => {
      const result = await importDocx(loadFixture('09-variables-mergefields'));
      expect(result.variables).toEqual([
        { name: 'Nom' },
        { name: 'NumeroFacture' },
        { name: 'Montant' },
        { name: 'DateEcheance' },
        { name: 'Signataire' },
      ]);
      expect(result.html).not.toContain('«');
      expect(result.warnings).toEqual([]);
    });

    it('correspond au HTML attendu', async () => {
      const { html } = await importDocx(loadFixture('09-variables-mergefields'));
      expect(normalizeHtml(html)).toBe(normalizeHtml(loadExpected('09-variables-mergefields')));
    });

    it('perd les champs comme mammoth seul quand mergeFields est désactivé', async () => {
      const result = await importDocx(loadFixture('09-variables-mergefields'), {
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

    it('correspond au HTML attendu', async () => {
      const { html } = await importDocx(loadFixture('10-variables-content-controls'));
      expect(normalizeHtml(html)).toBe(
        normalizeHtml(loadExpected('10-variables-content-controls')),
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
        'word/header1.xml': '<w:hdr><w:p>',
      });
      const result = await importDocx(docx);
      expect(result.html).toBe('<p>Corps <span data-aster-variable="a">{{a}}</span></p>');
      expect(result.variables).toEqual([{ name: 'a' }]);
      expect(result.warnings).toEqual([
        { code: 'variables-preprocess-failed', message: expect.stringContaining('illisible') },
      ]);
    });
  });
});
