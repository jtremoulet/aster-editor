import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocx, documentXml, headerXml, run, W_NS } from './minimal-docx';
import {
  mergeFieldName,
  preprocessVariables,
  transformVariablesXml,
  type CollectedVariable,
  type PreprocessVariablesOptions,
} from './variables';

const BOTH: PreprocessVariablesOptions = { mergeFields: true, contentControls: true };
const BOLD = '<w:rPr><w:b/></w:rPr>';

/** Applique la transformation sur un corps et renvoie le XML du corps, ou null si inchangé. */
function transform(
  body: string,
  options: PreprocessVariablesOptions = BOTH,
): { body: string | null; variables: Map<string, CollectedVariable> } {
  const variables = new Map<string, CollectedVariable>();
  const out = transformVariablesXml(documentXml(body), options, variables);
  if (out === null) return { body: null, variables };
  const start = out.indexOf('<w:body>') + '<w:body>'.length;
  return { body: out.slice(start, out.indexOf('</w:body>')), variables };
}

const simpleField = (name: string, result = `«${name}»`): string =>
  `<w:fldSimple w:instr=" MERGEFIELD ${name} ">${run(result)}</w:fldSimple>`;

const complexField = (instr: string, result: string, resultRPr = ''): string =>
  '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
  `<w:r><w:instrText xml:space="preserve">${instr}</w:instrText></w:r>` +
  '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
  run(result, resultRPr) +
  '<w:r><w:fldChar w:fldCharType="end"/></w:r>';

const sdt = (props: string, content: string): string =>
  `<w:sdt><w:sdtPr>${props}</w:sdtPr><w:sdtContent>${content}</w:sdtContent></w:sdt>`;

describe('mergeFieldName', () => {
  it('lit le nom d’un MERGEFIELD, options ignorées, insensible à la casse', () => {
    expect(mergeFieldName(' MERGEFIELD Nom ')).toBe('Nom');
    expect(mergeFieldName(' MERGEFIELD DateEcheance \\* MERGEFORMAT ')).toBe('DateEcheance');
    expect(mergeFieldName('mergefield x')).toBe('x');
  });

  it('normalise un nom entre guillemets et refuse les autres instructions', () => {
    expect(mergeFieldName(' MERGEFIELD "Nom complet" ')).toBe('nom_complet');
    expect(mergeFieldName(' HYPERLINK "https://example.com" ')).toBeNull();
    expect(mergeFieldName(' PAGE ')).toBeNull();
    expect(mergeFieldName(' MERGEFIELD "???" ')).toBeNull();
  });
});

describe('transformVariablesXml : champs simples', () => {
  it('remplace un fldSimple MERGEFIELD par un run {{nom}} en gardant le w:rPr du résultat', () => {
    const { body, variables } = transform(
      `<w:p>${run('Bonjour ')}<w:fldSimple w:instr=" MERGEFIELD Nom ">${run('«Nom»', BOLD)}</w:fldSimple>${run('.')}</w:p>`,
    );
    expect(body).toBe(
      `<w:p>${run('Bonjour ')}<w:r>${BOLD}<w:t xml:space="preserve">{{Nom}}</w:t></w:r>${run('.')}</w:p>`,
    );
    expect([...variables]).toEqual([['Nom', {}]]);
  });

  it('laisse intacts HYPERLINK, PAGE et les autres fldSimple', () => {
    const body = `<w:p><w:fldSimple w:instr=" HYPERLINK &quot;https://a.fr&quot; ">${run('a.fr')}</w:fldSimple><w:fldSimple w:instr=" PAGE ">${run('1')}</w:fldSimple></w:p>`;
    expect(transform(body).body).toBeNull();
  });

  it('ne touche à rien quand mergeFields est désactivé', () => {
    expect(
      transform(`<w:p>${simpleField('Nom')}</w:p>`, { ...BOTH, mergeFields: false }).body,
    ).toBeNull();
  });
});

describe('transformVariablesXml : champs complexes', () => {
  it('fusionne begin, instrText multi-runs, separate, résultat et end en un seul run', () => {
    const body =
      `<w:p>${run('Échéance : ')}` +
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGE</w:instrText></w:r>' +
      '<w:r><w:instrText xml:space="preserve">FIELD Date</w:instrText><w:instrText>Echeance </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      run('«12/03/2026»', BOLD) +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>' +
      `${run('.')}</w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBe(
      `<w:p>${run('Échéance : ')}<w:r>${BOLD}<w:t xml:space="preserve">{{DateEcheance}}</w:t></w:r>${run('.')}</w:p>`,
    );
    expect([...variables.keys()]).toEqual(['DateEcheance']);
  });

  it('prend le w:rPr du begin quand le résultat n’en a pas, et conserve les repères', () => {
    const body =
      '<w:p><w:bookmarkStart w:id="0" w:name="_x"/>' +
      `<w:r>${BOLD}<w:fldChar w:fldCharType="begin"/></w:r>` +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD Nom </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      run('«Nom»') +
      '<w:bookmarkEnd w:id="0"/>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    expect(transform(body).body).toBe(
      `<w:p><w:bookmarkStart w:id="0" w:name="_x"/><w:r>${BOLD}<w:t xml:space="preserve">{{Nom}}</w:t></w:r><w:bookmarkEnd w:id="0"/></w:p>`,
    );
  });

  it('gère un champ sans separate (jamais mis à jour par Word)', () => {
    const body =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD Nom </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    expect(transform(body).body).toBe(
      '<w:p><w:r><w:t xml:space="preserve">{{Nom}}</w:t></w:r></w:p>',
    );
  });

  it('laisse intacts PAGE, TOC, HYPERLINK complexes et un champ imbriqué dans un IF', () => {
    const page = complexField(' PAGE ', '3');
    const toc = complexField(' TOC \\o "1-3" ', 'Sommaire');
    const nested =
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> IF </w:instrText></w:r>' +
      complexField(' MERGEFIELD Nom ', '«Nom»') +
      '<w:r><w:instrText xml:space="preserve"> = "x" "oui" "non" </w:instrText></w:r>' +
      '<w:r><w:fldChar w:fldCharType="separate"/></w:r>' +
      run('non') +
      '<w:r><w:fldChar w:fldCharType="end"/></w:r>';
    const body = `<w:p>${page}${toc}</w:p><w:p>${nested}</w:p>`;
    const { body: out, variables } = transform(body);
    // Seul le MERGEFIELD imbriqué est remplacé ; l'enveloppe IF reste entière.
    expect(out).toContain(' PAGE ');
    expect(out).toContain(' TOC ');
    expect(out).toContain(' IF ');
    expect(out).toContain('{{Nom}}');
    expect(out).not.toContain('«Nom»');
    expect([...variables.keys()]).toEqual(['Nom']);
  });

  it('ne touche pas un champ qui ne se ferme pas dans son paragraphe', () => {
    const body =
      '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD Nom </w:instrText></w:r></w:p>' +
      '<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
    expect(transform(body).body).toBeNull();
  });
});

describe('transformVariablesXml : contrôles de contenu', () => {
  it('remplace un sdt avec tag par {{tag}} et collecte alias et valeur saisie', () => {
    const body = `<w:p>${run('Je soussigné ')}${sdt(
      '<w:alias w:val="Nom complet"/><w:tag w:val="nom_complet"/><w:id w:val="1"/>',
      run('Jean Dupont', BOLD),
    )}${run('.')}</w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBe(
      `<w:p>${run('Je soussigné ')}<w:r>${BOLD}<w:t xml:space="preserve">{{nom_complet}}</w:t></w:r>${run('.')}</w:p>`,
    );
    expect([...variables]).toEqual([
      ['nom_complet', { label: 'Nom complet', value: 'Jean Dupont' }],
    ]);
  });

  it('dérive le nom de l’alias quand le tag manque, et du tag normalisé s’il est invalide', () => {
    const alias = transform(`<w:p>${sdt('<w:alias w:val="Date de signature"/>', run('x'))}</w:p>`);
    expect(alias.body).toContain('{{date_de_signature}}');
    expect([...alias.variables]).toEqual([
      ['date_de_signature', { label: 'Date de signature', value: 'x' }],
    ]);
    const tag = transform(`<w:p>${sdt('<w:tag w:val="Numéro client"/>', run('7'))}</w:p>`);
    expect([...tag.variables]).toEqual([['numero_client', { value: '7' }]]);
  });

  it('ignore la valeur d’un contrôle qui affiche son texte de remplissage', () => {
    const body = `<w:p>${sdt(
      '<w:alias w:val="Date"/><w:tag w:val="date"/><w:showingPlcHdr/>',
      run('Cliquez ici pour saisir date.'),
    )}</w:p>`;
    expect(transform(body).variables.get('date')).toEqual({ label: 'Date' });
  });

  it('laisse intact un sdt sans tag ni alias, une table des matières, un groupe, une ligne de table', () => {
    const body =
      `<w:p>${sdt('<w:id w:val="1"/>', run('texte libre'))}</w:p>` +
      sdt(
        '<w:tag w:val="toc"/><w:docPartObj><w:docPartGallery w:val="Table of Contents"/></w:docPartObj>',
        '<w:p>' + run('Sommaire') + '</w:p>',
      ) +
      sdt('<w:tag w:val="grp"/><w:group/>', '<w:p>' + run('groupe') + '</w:p>') +
      `<w:tbl>${sdt('<w:tag w:val="ligne"/>', '<w:tr><w:tc><w:p>' + run('cellule') + '</w:p></w:tc></w:tr>')}</w:tbl>`;
    expect(transform(body).body).toBeNull();
  });

  it('transforme un contrôle de bloc en un paragraphe unique qui garde le w:pPr', () => {
    const body = sdt(
      '<w:tag w:val="adresse"/>',
      `<w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run('12 rue', BOLD)}</w:p><w:p>${run('Paris')}</w:p>`,
    );
    const { body: out, variables } = transform(body);
    expect(out).toBe(
      `<w:p><w:pPr><w:jc w:val="right"/></w:pPr><w:r>${BOLD}<w:t xml:space="preserve">{{adresse}}</w:t></w:r></w:p>`,
    );
    expect(variables.get('adresse')).toEqual({ value: '12 rue\nParis' });
  });

  it('traite un contrôle imbriqué avant son conteneur, collecte dans l’ordre du document', () => {
    const inner = sdt('<w:tag w:val="inner"/>', run('x'));
    const body = `<w:p>${sdt('<w:tag w:val="outer"/>', `${run('a ')}${inner}`)}</w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBe('<w:p><w:r><w:t xml:space="preserve">{{outer}}</w:t></w:r></w:p>');
    expect([...variables.keys()]).toEqual(['outer', 'inner']);
    expect(variables.get('outer')).toEqual({ value: 'a {{inner}}' });
  });

  it('ne touche à rien quand contentControls est désactivé', () => {
    const body = `<w:p>${sdt('<w:tag w:val="x"/>', run('x'))}</w:p>`;
    expect(transform(body, { ...BOTH, contentControls: false }).body).toBeNull();
  });

  it('prend le w:rPr déclaré dans w:sdtPr quand le contenu n’en a pas', () => {
    const body = `<w:p>${sdt(`<w:tag w:val="x"/>${BOLD}`, run('x'))}</w:p>`;
    expect(transform(body).body).toContain(
      `<w:r>${BOLD}<w:t xml:space="preserve">{{x}}</w:t></w:r>`,
    );
  });
});

describe('transformVariablesXml : robustesse', () => {
  it('conserve la déclaration XML et le reste du document tels quels', () => {
    const xml = documentXml(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Titre', BOLD)}</w:p><w:p>${simpleField('Nom')}</w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>`,
    );
    const out = transformVariablesXml(xml, BOTH, new Map());
    expect(out).toMatch(
      /^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?><w:document xmlns:w="http/,
    );
    expect(out).toContain(
      `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run('Titre', BOLD)}</w:p>`,
    );
    expect(out).toContain('<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr>');
  });

  it('lève sur un XML illisible', () => {
    expect(() => transformVariablesXml('<w:document><w:p>', BOTH, new Map())).toThrow(/illisible/);
  });

  it('accepte un codec injecté', () => {
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    let serialized = 0;
    const out = transformVariablesXml(
      documentXml(`<w:p>${simpleField('Nom')}</w:p>`),
      BOTH,
      new Map(),
      {
        parse: (xml) => parser.parseFromString(xml, 'application/xml'),
        serialize: (doc) => {
          serialized += 1;
          return serializer.serializeToString(doc);
        },
      },
    );
    expect(out).toContain('{{Nom}}');
    expect(serialized).toBe(1);
  });

  it('ignore l’espace de noms exact (OOXML strict) grâce au nom local', () => {
    const strict = `<w:document xmlns:w="http://purl.oclc.org/ooxml/wordprocessingml/main"><w:body><w:p>${simpleField('Nom')}</w:p></w:body></w:document>`;
    expect(transformVariablesXml(strict, BOTH, new Map())).toContain(
      '<w:t xml:space="preserve">{{Nom}}</w:t>',
    );
  });
});

describe('preprocessVariables', () => {
  it('réécrit document.xml et header1.xml, collecte dans l’ordre corps puis en-tête', async () => {
    const input = await buildDocx(`<w:p>${simpleField('Corps')}</w:p>`, {
      'word/header1.xml': headerXml(`<w:p>${sdt('<w:tag w:val="entete"/>', run('v'))}</w:p>`),
      'word/footer1.xml': headerXml(`<w:p>${run('rien')}</w:p>`),
    });
    const result = await preprocessVariables(input, BOTH);
    expect(result.changed).toBe(true);
    expect(result.buffer).not.toBe(input);
    expect([...result.variables]).toEqual([
      ['Corps', {}],
      ['entete', { value: 'v' }],
    ]);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(await zip.file('word/document.xml')?.async('string')).toContain('{{Corps}}');
    expect(await zip.file('word/header1.xml')?.async('string')).toContain('{{entete}}');
    expect(await zip.file('word/footer1.xml')?.async('string')).toContain('rien');
    expect(zip.file('[Content_Types].xml')).not.toBeNull();
  });

  it('renvoie l’entrée telle quelle sans champ ni contrôle, ou sans détection active', async () => {
    const plain = await buildDocx(`<w:p>${run('{{saisi}}')}</w:p>`);
    const untouched = await preprocessVariables(plain, BOTH);
    expect(untouched.changed).toBe(false);
    expect(untouched.buffer).toBe(plain);
    const garbage = new ArrayBuffer(3);
    const skipped = await preprocessVariables(garbage, {
      mergeFields: false,
      contentControls: false,
    });
    expect(skipped.buffer).toBe(garbage);
  });

  it('rend telle quelle une archive illisible, que mammoth rejettera lui-même', async () => {
    const garbage = new ArrayBuffer(8);
    const result = await preprocessVariables(garbage, BOTH);
    expect(result).toEqual({ buffer: garbage, variables: new Map(), changed: false });
  });

  it('fusionne les apparitions d’un même nom : première position, libellé et valeur complétés', () => {
    const variables = new Map<string, CollectedVariable>([['x', { label: 'Déjà là' }]]);
    transformVariablesXml(
      documentXml(
        `<w:p>${sdt('<w:tag w:val="x"/><w:showingPlcHdr/>', run('vide'))}${simpleField('y')}` +
          `${sdt('<w:alias w:val="Alias X"/><w:tag w:val="x"/>', run('valeur'))}${simpleField('x')}</w:p>` +
          `<w:p>${sdt('<w:alias w:val="Y"/><w:tag w:val="y"/>', run('vy'))}</w:p>`,
      ),
      BOTH,
      variables,
    );
    expect([...variables]).toEqual([
      ['x', { label: 'Déjà là', value: 'valeur' }],
      ['y', { label: 'Y', value: 'vy' }],
    ]);
  });

  it('collecte dans l’ordre du document, champs simples, complexes et contrôles mêlés', () => {
    const variables = new Map<string, CollectedVariable>();
    transformVariablesXml(
      documentXml(
        `<w:p>${sdt('<w:tag w:val="c"/>', run('x'))}${complexField(' MERGEFIELD b ', '«b»')}${simpleField('a')}</w:p>`,
      ),
      BOTH,
      variables,
    );
    expect([...variables.keys()]).toEqual(['c', 'b', 'a']);
  });

  it('traite la fixture 09 (sans footnotes.xml obligatoire) et la 10', async () => {
    const load = (name: string): ArrayBuffer => {
      const buffer = readFileSync(`${import.meta.env.ASTER_FIXTURES}docx/${name}.docx`);
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      ) as ArrayBuffer;
    };
    const merge = await preprocessVariables(load('09-variables-mergefields'), BOTH);
    expect([...merge.variables.keys()]).toEqual([
      'Nom',
      'NumeroFacture',
      'Montant',
      'DateEcheance',
      'Signataire',
    ]);
    const controls = await preprocessVariables(load('10-variables-content-controls'), BOTH);
    expect([...controls.variables]).toEqual([
      ['nom_complet', { label: 'Nom complet', value: 'Jean Dupont' }],
      ['objet', { label: 'Objet', value: 'le présent document' }],
      ['date', { label: 'Date' }],
    ]);
  });

  it('expose W_NS pour les tests qui construisent du XML', () => {
    expect(W_NS).toContain('wordprocessingml');
  });
});
