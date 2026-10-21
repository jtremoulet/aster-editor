import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { buildDocx, documentXml, headerXml, run, W_NS } from './minimal-docx.js';
import {
  collectBracesInXml,
  mergeFieldName,
  preprocessVariables,
  transformVariablesXml,
  type CollectedVariable,
  type PreprocessVariablesOptions,
  type XmlCodec,
} from './variables.js';

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

  it('garde tel quel un nom entre guillemets déjà valide, normalise seulement un nom invalide (I-6)', () => {
    expect(mergeFieldName(' MERGEFIELD "Prénom" ')).toBe('Prénom');
    expect(mergeFieldName(' MERGEFIELD "NumeroFacture" ')).toBe('NumeroFacture');
    expect(mergeFieldName(' MERGEFIELD "Prénom du client" ')).toBe('prenom_du_client');
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

  it('laisse intact un contrôle lié à une donnée du document (w:dataBinding : propriété « Titre » de Word, L53)', () => {
    // Forme exacte d'Insertion → QuickPart → Propriété du document → Titre (Word en français) :
    // alias localisé, tag vide, liaison vers `dc:title`, espace réservé affiché.
    const bound =
      '<w:alias w:val="Titre"/><w:tag w:val=""/><w:id w:val="2"/>' +
      '<w:dataBinding w:prefixMappings="xmlns:ns0=\'http://purl.org/dc/elements/1.1/\'" w:xpath="/ns0:title[1]" w:storeItemID="{X}"/>' +
      '<w:text/><w:showingPlcHdr/>';
    const body = `<w:p>${run('Titre : ')}${sdt(bound, run('[Titre]'))}</w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBeNull();
    expect([...variables]).toEqual([]);
    // Même avec un tag, la liaison l'emporte : Word remplit ce contrôle, pas l'intégrateur.
    const tagged = `<w:p>${sdt(bound.replace('w:val=""', 'w:val="titre"'), run('x'))}</w:p>`;
    expect(transform(tagged).body).toBeNull();
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

  it('traite un contrôle imbriqué avant son conteneur ; sorti du document, il n’est plus listé (I-9)', () => {
    const inner = sdt('<w:tag w:val="inner"/>', run('x'));
    const body = `<w:p>${sdt('<w:tag w:val="outer"/>', `${run('a ')}${inner}`)}</w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBe('<w:p><w:r><w:t xml:space="preserve">{{outer}}</w:t></w:r></w:p>');
    expect([...variables]).toEqual([['outer', { value: 'a {{inner}}' }]]);
  });

  it('garde une variable imbriquée qui apparaît aussi ailleurs, et retire un champ englobé par un bloc (I-9)', () => {
    const inner = sdt('<w:tag w:val="inner"/>', run('x'));
    const twice = `<w:p>${sdt('<w:tag w:val="outer"/>', inner)}</w:p><w:p>${inner}</w:p>`;
    expect([...transform(twice).variables.keys()]).toEqual(['outer', 'inner']);
    const block = sdt('<w:tag w:val="bloc"/>', `<w:p>${simpleField('Interne')}</w:p>`);
    expect([...transform(block).variables]).toEqual([['bloc', { value: '{{Interne}}' }]]);
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

  it('lève sur un XML illisible qui porte une balise à transformer', () => {
    expect(() => transformVariablesXml('<w:document><w:p><w:sdt>', BOTH, new Map())).toThrow(
      /illisible/,
    );
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

describe('I-1 : inline ou bloc décidé par le parent du contrôle', () => {
  const table = `<w:tbl><w:tr><w:tc><w:p>${run('cellule')}</w:p></w:tc></w:tr></w:tbl>`;

  it('laisse intact un sdt qui enveloppe une table, sans rien émettre sous w:body', () => {
    const { body, variables } = transform(sdt('<w:tag w:val="tableau"/>', table));
    expect(body).toBeNull();
    expect(variables.size).toBe(0);
  });

  it('laisse intact un sdt de bloc sans paragraphe direct (runs orphelins)', () => {
    expect(transform(sdt('<w:tag w:val="seul"/>', run('texte'))).body).toBeNull();
  });

  it('laisse intact un sdt de bloc qui mêle paragraphes et table : jamais jeter une table', () => {
    const mixed = sdt('<w:tag w:val="mixte"/>', `<w:p>${run('intro')}</w:p>${table}`);
    expect(transform(mixed).body).toBeNull();
  });

  it('reste inline sous un lien ou une marque de révision d’un paragraphe', () => {
    const body =
      `<w:p><w:hyperlink w:anchor="top">${sdt('<w:tag w:val="lien"/>', run('x'))}</w:hyperlink>` +
      `<w:ins w:id="1">${sdt('<w:tag w:val="ajout"/>', run('y'))}</w:ins></w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBe(
      '<w:p><w:hyperlink w:anchor="top"><w:r><w:t xml:space="preserve">{{lien}}</w:t></w:r></w:hyperlink>' +
        '<w:ins w:id="1"><w:r><w:t xml:space="preserve">{{ajout}}</w:t></w:r></w:ins></w:p>',
    );
    expect([...variables.keys()]).toEqual(['lien', 'ajout']);
  });
});

describe('I-2 : parties localisées par les relations du paquet', () => {
  const REL_TYPE = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const rels = (entries: string): string =>
    '<?xml version="1.0" encoding="UTF-8"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    `${entries}</Relationships>`;

  it('lit le corps dans _rels/.rels (document2.xml) et ses en-têtes dans ses propres relations', async () => {
    const input = await buildDocx(`<w:p>${run('leurre')}</w:p>`, {
      '_rels/.rels': rels(
        `<Relationship Id="rId1" Type="${REL_TYPE}/officeDocument" Target="/word/document2.xml"/>`,
      ),
      'word/document2.xml': documentXml(`<w:p>${simpleField('Corps')}</w:p>`),
      'word/_rels/document2.xml.rels': rels(
        `<Relationship Id="rId1" Type="${REL_TYPE}/header" Target="entete.xml"/>` +
          `<Relationship Id="rId2" Type="${REL_TYPE}/hyperlink" Target="https://x.io" TargetMode="External"/>` +
          `<Relationship Id="rId3" Type="${REL_TYPE}/footer" Target="../word/pied.xml"/>`,
      ),
      'word/entete.xml': headerXml(`<w:p>${simpleField('Entete')}</w:p>`),
      'word/pied.xml': headerXml(`<w:p>${simpleField('Pied')}</w:p>`),
      'word/header1.xml': headerXml(`<w:p>${simpleField('Orphelin')}</w:p>`),
    });
    const result = await preprocessVariables(input, BOTH);
    expect([...result.variables.keys()]).toEqual(['Corps', 'Entete', 'Pied']);
    const zip = await JSZip.loadAsync(result.buffer);
    expect(await zip.file('word/document2.xml')?.async('string')).toContain('{{Corps}}');
    expect(await zip.file('word/document.xml')?.async('string')).toContain('leurre');
    expect(await zip.file('word/entete.xml')?.async('string')).toContain('{{Entete}}');
    expect(await zip.file('word/pied.xml')?.async('string')).toContain('{{Pied}}');
    expect(await zip.file('word/header1.xml')?.async('string')).toContain('MERGEFIELD Orphelin');
  });

  it('se replie sur word/document.xml quand la relation officeDocument est absente ou illisible', async () => {
    const input = await buildDocx(`<w:p>${simpleField('Corps')}</w:p>`, {
      '_rels/.rels': '<Relationships><Relationship',
    });
    const result = await preprocessVariables(input, BOTH);
    expect([...result.variables.keys()]).toEqual(['Corps']);
  });
});

describe('valeur connue d’un champ de fusion (réimport d’un export fields)', () => {
  it('garde le résultat du champ, sauf vide ou placeholder «nom» / « nom » / {{nom}}', () => {
    const { variables } = transform(
      `<w:p>${simpleField('a', 'ACME')}${simpleField('b')}${simpleField('c', '« c »')}` +
        `${simpleField('d', '{{d}}')}${simpleField('e', '')}${complexField(' MERGEFIELD f ', 'Alice')}` +
        `${complexField(' MERGEFIELD "Nom complet" ', '«Nom complet»')}</w:p>`,
    );
    expect([...variables]).toEqual([
      ['a', { value: 'ACME' }],
      ['b', {}],
      ['c', {}],
      ['d', {}],
      ['e', {}],
      ['f', { value: 'Alice' }],
      ['nom_complet', {}],
    ]);
  });
});

describe('I-3 / I-11 : budgets', () => {
  it('reste linéaire sur 2 000 begin jamais fermés dans un paragraphe (< 500 ms)', () => {
    const begin =
      '<w:r><w:fldChar w:fldCharType="begin"/></w:r>' +
      '<w:r><w:instrText xml:space="preserve"> MERGEFIELD x </w:instrText></w:r>';
    const xml = documentXml(`<w:p>${begin.repeat(2000)}</w:p>`);
    const started = performance.now();
    expect(transformVariablesXml(xml, BOTH, new Map())).toBeNull();
    expect(performance.now() - started).toBeLessThan(500);
  });

  it('ne parse pas une partie sans balise à transformer', () => {
    const parser = new DOMParser();
    const serializer = new XMLSerializer();
    let parsed = 0;
    const codec: XmlCodec = {
      parse: (xml) => {
        parsed += 1;
        return parser.parseFromString(xml, 'application/xml');
      },
      serialize: (doc) => serializer.serializeToString(doc),
    };
    const plain = documentXml(`<w:p>${run('{{saisi}}')}</w:p>`);
    expect(transformVariablesXml(plain, BOTH, new Map(), codec)).toBeNull();
    const control = documentXml(`<w:p>${sdt('<w:tag w:val="x"/>', run('x'))}</w:p>`);
    const fieldsOnly = { ...BOTH, contentControls: false };
    expect(transformVariablesXml(control, fieldsOnly, new Map(), codec)).toBeNull();
    expect(parsed).toBe(0);
    expect(transformVariablesXml(control, BOTH, new Map(), codec)).toContain('{{x}}');
    expect(parsed).toBe(1);
  });

  it('prétraite 5 000 paragraphes sans champ en moins de 100 ms', async () => {
    const paragraph = `<w:p>${run('Paragraphe de texte ordinaire, sans champ ni contrôle.')}</w:p>`;
    const input = await buildDocx(paragraph.repeat(5000));
    const started = performance.now();
    const result = await preprocessVariables(input, BOTH);
    expect(performance.now() - started).toBeLessThan(100);
    expect(result.changed).toBe(false);
  });
});

describe('I-4 / I-5 / I-10 / I-13 : contrôles et robustesse', () => {
  it('garde libellé et valeur de la première apparition d’un tag dupliqué (I-4)', () => {
    const { variables } = transform(
      `<w:p>${sdt('<w:alias w:val="Premier"/><w:tag w:val="x"/>', run('un'))}` +
        `${sdt('<w:alias w:val="Second"/><w:tag w:val="x"/>', run('deux'))}</w:p>`,
    );
    expect([...variables]).toEqual([['x', { label: 'Premier', value: 'un' }]]);
  });

  it('ne reprend pas le style du texte de remplissage, seulement sdtPr > rPr (I-5)', () => {
    const placeholder = run('Cliquez ici', '<w:rPr><w:rStyle w:val="PlaceholderText"/></w:rPr>');
    const { body } = transform(
      `<w:p>${sdt(`<w:tag w:val="date"/>${BOLD}<w:showingPlcHdr/>`, placeholder)}</w:p>`,
    );
    expect(body).toBe(`<w:p><w:r>${BOLD}<w:t xml:space="preserve">{{date}}</w:t></w:r></w:p>`);
  });

  it('laisse intacte une case à cocher ; liste, combo et date donnent la valeur affichée (I-10)', () => {
    const w14 = 'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"';
    const checkbox =
      `<w:sdt ${w14}><w:sdtPr><w:tag w:val="ok"/><w14:checkbox><w14:checked w14:val="1"/></w14:checkbox></w:sdtPr>` +
      `<w:sdtContent>${run('☒')}</w:sdtContent></w:sdt>`;
    expect(transform(`<w:p>${checkbox}</w:p>`).body).toBeNull();
    const body =
      `<w:p>${sdt('<w:tag w:val="pays"/><w:dropDownList><w:listItem w:displayText="France" w:value="FR"/></w:dropDownList>', run('France'))}` +
      `${sdt('<w:tag w:val="ville"/><w:comboBox/>', run('Lyon'))}` +
      `${sdt('<w:tag w:val="le"/><w:date w:fullDate="2026-03-12T00:00:00Z"/>', run('12/03/2026'))}</w:p>`;
    const { body: out, variables } = transform(body);
    expect(out).toBe(
      '<w:p>' +
        ['pays', 'ville', 'le']
          .map((name) => `<w:r><w:t xml:space="preserve">{{${name}}}</w:t></w:r>`)
          .join('') +
        '</w:p>',
    );
    expect([...variables]).toEqual([
      ['pays', { value: 'France' }],
      ['ville', { value: 'Lyon' }],
      ['le', { value: '12/03/2026' }],
    ]);
  });

  it('conserve la déclaration XML derrière une marque BOM (I-13)', () => {
    const BOM = String.fromCharCode(0xfeff);
    const out = transformVariablesXml(
      `${BOM}${documentXml(`<w:p>${simpleField('Nom')}</w:p>`)}`,
      BOTH,
      new Map(),
    );
    expect(out).toMatch(/^<\?xml version="1\.0" encoding="UTF-8" standalone="yes"\?><w:document/);
    expect(out).toContain('{{Nom}}');
  });
});

describe('I-7 : {{nom}} tapés dans les en-têtes et pieds de page', () => {
  it('collecte les noms sans réécrire, un {{ coupé sur deux runs compris, jamais sur deux paragraphes', async () => {
    const input = await buildDocx(`<w:p>${run('Corps {{a}}')}</w:p>`, {
      'word/header1.xml': headerXml(
        `<w:p>${run('Réf. {{')}${run('dossier}} &amp; {{a}}')}</w:p>` +
          `<w:p>${run('{{')}</w:p><w:p>${run('coupe}}')}</w:p>`,
      ),
      'word/footer1.xml': headerXml(`<w:p>${run('Page {{page}} / {{ nombre }}')}</w:p>`),
    });
    const result = await preprocessVariables(input, { ...BOTH, braces: true });
    expect(result.changed).toBe(false);
    expect([...result.variables.keys()]).toEqual(['dossier', 'a', 'page', 'nombre']);
    const without = await preprocessVariables(input, BOTH);
    expect(without.variables.size).toBe(0);
  });

  it('applique le motif personnalisé et ignore un nom invalide', () => {
    const variables = new Map<string, CollectedVariable>();
    const xml = headerXml(`<w:p>${run('[client] [a b] [[x]] &lt;[tag]&gt;')}</w:p>`);
    collectBracesInXml(xml, /\[([^\]]+)\]/g, variables);
    expect([...variables.keys()]).toEqual(['client', 'tag']);
  });
});
