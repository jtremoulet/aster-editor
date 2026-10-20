import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx';
import { jsonToHtml } from './json-to-html';
import { toDocumentXml, toZipEntries } from './testing/sample';
import type { DocxExportOptions } from './types';
import {
  DEFAULT_VARIABLE_PATTERN,
  quoteFieldName,
  resolveVariableSettings,
  splitVariables,
} from './variables';

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

/**
 * Fusionne les runs texte adjacents d'un paragraphe : une variable est émise dans son
 * propre run, et c'est le texte lu dans Word qui compte, pas le découpage.
 */
function mergeRuns(xml: string): string {
  return xml.replace(/<\/w:t><\/w:r><w:r>(?:<w:rPr>.*?<\/w:rPr>)?<w:t xml:space="preserve">/g, '');
}

const SPAN = '<p>Bonjour <span data-aster-variable="nom" data-label="Nom">{{nom}}</span> !</p>';

describe('variables à l’export', () => {
  describe('mode placeholders (défaut)', () => {
    it('laisse le texte {{nom}} tel quel, span ou texte brut', async () => {
      const { xml, warnings } = await toDocumentXml(`${SPAN}<p>Ville : {{ville}}</p>`);
      expect(mergeRuns(xml)).toContain('>Bonjour {{nom}} !</w:t>');
      expect(xml).toContain('>Ville : {{ville}}</w:t>');
      expect(xml).not.toContain('MERGEFIELD');
      expect(warnings).toEqual([]);
    });

    it('rend {{nom}} pour une puce vide', async () => {
      const { xml } = await toDocumentXml('<p><span data-aster-variable="nom"></span></p>');
      expect(xml).toContain('>{{nom}}</w:t>');
    });
  });

  describe('mode resolve', () => {
    const options: DocxExportOptions = {
      variables: { mode: 'resolve', values: { nom: 'Alice', ville: 'Montpellier' } },
    };

    it('substitue la valeur dans les spans et le texte brut', async () => {
      const { xml, warnings } = await toDocumentXml(`${SPAN}<p>Ville : {{ville}}.</p>`, options);
      expect(mergeRuns(xml)).toContain('>Bonjour Alice !</w:t>');
      expect(mergeRuns(xml)).toContain('>Ville : Montpellier.</w:t>');
      expect(xml).not.toContain('{{');
      expect(warnings).toEqual([]);
    });

    it('conserve les marques du span et de son contexte', async () => {
      const { xml } = await toDocumentXml(
        '<p><strong><span data-aster-variable="nom" style="color:#ff0000">{{nom}}</span></strong></p>',
        options,
      );
      expect(xml).toContain('<w:b/>');
      expect(xml).toContain('<w:color w:val="FF0000"/>');
      expect(xml).toContain('>Alice</w:t>');
    });

    it('laisse {{nom}} et avertit quand la valeur manque', async () => {
      const { xml, warnings } = await toDocumentXml(
        '<p>{{inconnue}} et <span data-aster-variable="autre">{{autre}}</span></p>',
        options,
      );
      expect(mergeRuns(xml)).toContain('>{{inconnue}} et {{autre}}</w:t>');
      expect(warnings).toEqual([
        { code: 'variable-unresolved', message: expect.stringContaining('{{inconnue}}') },
        { code: 'variable-unresolved', message: expect.stringContaining('{{autre}}') },
      ]);
    });

    it('ignore le texte des blocs et marques de code', async () => {
      const { xml, warnings } = await toDocumentXml(
        '<pre>{{nom}}</pre><p><code>{{nom}}</code></p>',
        options,
      );
      expect(count(xml, '>{{nom}}</w:t>')).toBe(2);
      expect(warnings).toEqual([]);
    });

    it('accepte un motif personnalisé', async () => {
      const { xml } = await toDocumentXml('<p>Cher [nom], bienvenue à {{ville}}</p>', {
        variables: { mode: 'resolve', values: { nom: 'Bob' }, pattern: /\[([a-z]+)\]/ },
      });
      expect(mergeRuns(xml)).toContain('>Cher Bob, bienvenue à {{ville}}</w:t>');
    });

    it('assainit la valeur injectée', async () => {
      const { xml } = await toDocumentXml(SPAN, {
        variables: { mode: 'resolve', values: { nom: `A\u0000B` } },
      });
      expect(mergeRuns(xml)).toContain('>Bonjour AB !</w:t>');
    });

    it('M-2 : garde les sauts de ligne et les blancs d’une valeur (donnée, pas HTML)', async () => {
      const { xml, warnings } = await toDocumentXml(
        '<p>Adresse : <span data-aster-variable="adresse">{{adresse}}</span> fin</p><p>{{adresse}}</p>',
        {
          variables: {
            mode: 'resolve',
            values: { adresse: ' 12 rue  Haute\r\n34000 Montpellier\n' },
          },
        },
      );
      expect(warnings).toEqual([]);
      // Avant : `\r\n` devenait un espace et les doubles blancs étaient réduits.
      expect(xml).toContain('>Adresse : </w:t>');
      expect(xml).toContain('> 12 rue  Haute</w:t>');
      expect(xml).toContain('>34000 Montpellier</w:t>');
      // Le texte HTML qui suit un saut suit les règles du HTML : son blanc de tête disparaît.
      expect(xml).toContain('>fin</w:t>');
      // Deux sauts dans la valeur, donc deux `<w:br/>` par occurrence, y compris le terminal.
      expect(count(xml, '<w:br/>')).toBe(4);
    });

    it('M-6 : accepte une valeur non chaîne (nombre, booléen) et ignore null', async () => {
      const values = { n: 42, ok: true, rien: null } as unknown as Record<string, string>;
      const { xml, warnings } = await toDocumentXml('<p>{{n}} {{ok}} {{rien}}</p>', {
        variables: { mode: 'resolve', values },
      });
      expect(mergeRuns(xml)).toContain('>42 true {{rien}}</w:t>');
      expect(warnings).toEqual([
        { code: 'variable-unresolved', message: expect.stringContaining('rien') },
      ]);
    });

    it('M-5 : ignore le drapeau sticky d’un motif personnalisé', async () => {
      const { xml, warnings } = await toDocumentXml('<p>Cher [nom], bonjour [nom]</p>', {
        variables: { mode: 'resolve', values: { nom: 'Bob' }, pattern: /\[([a-z]+)\]/y },
      });
      expect(mergeRuns(xml)).toContain('>Cher Bob, bonjour Bob</w:t>');
      expect(warnings).toEqual([]);
      expect(resolveVariableSettings({ pattern: /x/y }).pattern.flags).toBe('g');
    });
  });

  describe('mode fields', () => {
    it('émet un champ MERGEFIELD par variable, span ou texte brut', async () => {
      const { xml, warnings } = await toDocumentXml(`${SPAN}<p>Ville : {{ville}}</p>`, {
        variables: { mode: 'fields' },
      });
      expect(xml).toContain(
        '<w:fldSimple w:instr=" MERGEFIELD nom "><w:r><w:t xml:space="preserve">«nom»</w:t></w:r></w:fldSimple>',
      );
      expect(xml).toContain('<w:fldSimple w:instr=" MERGEFIELD ville ">');
      expect(xml).toContain('>Bonjour </w:t>');
      expect(xml).toContain('> !</w:t>');
      expect(warnings).toEqual([]);
    });

    it('écrit la valeur connue comme résultat du champ', async () => {
      const { xml } = await toDocumentXml(SPAN, {
        variables: { mode: 'fields', values: { nom: 'Alice' } },
      });
      expect(xml).toContain(
        '<w:fldSimple w:instr=" MERGEFIELD nom "><w:r><w:t xml:space="preserve">Alice</w:t></w:r></w:fldSimple>',
      );
      expect(xml).not.toContain('«nom»');
    });

    it('garde un champ dans un lien et dans un titre', async () => {
      const { xml } = await toDocumentXml(
        '<h1>Contrat {{ref}}</h1><p><a href="https://example.com">{{nom}}</a></p>',
        { variables: { mode: 'fields' } },
      );
      expect(xml).toContain('<w:pStyle w:val="Heading1"/>');
      expect(xml).toContain('<w:hyperlink');
      expect(count(xml, '<w:fldSimple')).toBe(2);
    });

    it('aller-retour exportDocx → zip : le champ est dans document.xml', async () => {
      const entries = await toZipEntries(await exportDocx(SPAN, { variables: { mode: 'fields' } }));
      expect(entries.get('word/document.xml')).toContain('w:instr=" MERGEFIELD nom "');
    });

    it('M-1 : cite un nom de champ avec blanc, guillemet ou backslash', async () => {
      const { xml } = await toDocumentXml(
        '<p><span data-aster-variable="Nom du client">x</span>' +
          '<span data-aster-variable=\'a"b\'>x</span><span data-aster-variable="c\\d">x</span>' +
          '<span data-aster-variable="simple">x</span></p>',
        { variables: { mode: 'fields', values: { 'Nom du client': 'ACME' } } },
      );
      expect(xml).toContain('w:instr=" MERGEFIELD &quot;Nom du client&quot; "');
      expect(xml).toContain('>ACME</w:t>');
      expect(xml).toContain('w:instr=" MERGEFIELD &quot;a\\&quot;b&quot; "');
      expect(xml).toContain('w:instr=" MERGEFIELD &quot;c\\\\d&quot; "');
      expect(xml).toContain('>«a&quot;b»</w:t>');
      expect(xml).toContain('w:instr=" MERGEFIELD simple "');
      expect(quoteFieldName('simple.name-1')).toBe('simple.name-1');
      expect(quoteFieldName('a b')).toBe('"a b"');
    });

    it('M-2 / M-6 : le résultat du champ tient sur une ligne et accepte un nombre', async () => {
      const values = { multi: 'ligne 1\r\nligne 2', n: 7 } as unknown as Record<string, string>;
      const { xml } = await toDocumentXml('<p>{{multi}} {{n}}</p>', {
        variables: { mode: 'fields', values },
      });
      expect(xml).toContain('>ligne 1 ligne 2</w:t>');
      expect(xml).toContain(
        '<w:fldSimple w:instr=" MERGEFIELD n "><w:r><w:t xml:space="preserve">7</w:t>',
      );
    });

    it('émet aussi un champ dans header.html', async () => {
      const entries = await toZipEntries(
        await exportDocx('<p>corps</p>', {
          header: { html: 'Client : {{client}}', align: 'right' },
          variables: { mode: 'fields', values: { client: 'ACME' } },
        }),
      );
      const header = entries.get('word/header1.xml') ?? '';
      expect(header).toContain('<w:fldSimple w:instr=" MERGEFIELD client ">');
      expect(header).toContain('>ACME</w:t>');
      expect(header).toContain('<w:jc w:val="right"/>');
    });
  });

  describe('splitVariables', () => {
    it('découpe sur le motif par défaut et tolère les blancs', () => {
      const settings = resolveVariableSettings({ mode: 'resolve' });
      expect(splitVariables('a {{ x }} b {{y.z-1}}', settings)).toEqual([
        { kind: 'text', text: 'a ' },
        { kind: 'variable', name: 'x', raw: '{{ x }}' },
        { kind: 'text', text: ' b ' },
        { kind: 'variable', name: 'y.z-1', raw: '{{y.z-1}}' },
      ]);
      expect(DEFAULT_VARIABLE_PATTERN.lastIndex).toBe(0);
    });

    it('rend le texte entier en placeholders et sans motif reconnu', () => {
      expect(splitVariables('{{a}}', resolveVariableSettings(undefined))).toEqual([
        { kind: 'text', text: '{{a}}' },
      ]);
      expect(splitVariables('rien', resolveVariableSettings({ mode: 'fields' }))).toEqual([
        { kind: 'text', text: 'rien' },
      ]);
    });

    it('ne boucle pas sur un motif qui capture la chaîne vide', () => {
      const settings = resolveVariableSettings({ mode: 'fields', pattern: /(x*)/ });
      expect(splitVariables('abc', settings)).toEqual([{ kind: 'text', text: 'abc' }]);
    });
  });

  it('sérialise le nœud JSON variable en puce du core', () => {
    expect(
      jsonToHtml({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'variable', attrs: { name: 'nom', label: 'Nom "x"' } }],
          },
        ],
      }),
    ).toBe('<p><span data-aster-variable="nom" data-label="Nom &quot;x&quot;">{{nom}}</span></p>');
  });
});
