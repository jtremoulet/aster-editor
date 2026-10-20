import { describe, expect, it } from 'vitest';
import { toDocumentXml } from './testing/sample';

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('buildDocx — mapping XML', () => {
  it('pose l’alignement des paragraphes et des titres', async () => {
    const { xml } = await toDocumentXml(
      '<p style="text-align:center">a</p><h2 style="text-align: right">b</h2><p style="text-align:justify">c</p><p>d</p>',
    );
    expect(count(xml, '<w:jc w:val="center"/>')).toBe(1);
    expect(count(xml, '<w:jc w:val="right"/>')).toBe(1);
    expect(count(xml, '<w:jc w:val="both"/>')).toBe(1);
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
  });

  it('traduit les marques inline en propriétés de run', async () => {
    const { xml } = await toDocumentXml(
      '<p><strong>g</strong><em>i</em><u>u</u><s>s</s><sub>sub</sub><sup>sup</sup><code>c</code><mark>m</mark>' +
        '<span style="color:#00ff00;font-family:Arial;font-size:12pt">st</span>' +
        '<b style="font-style:italic;text-decoration:underline line-through">bi</b></p>',
    );
    expect(xml).toContain('<w:b/>');
    expect(xml).toContain('<w:i/>');
    expect(xml).toContain('<w:u w:val="single"/>');
    expect(xml).toContain('<w:strike/>');
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('<w:rStyle w:val="Code"/>');
    expect(xml).toContain('w:ascii="Consolas"');
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
    expect(xml).toContain('<w:color w:val="00FF00"/>');
    expect(xml).toContain('w:ascii="Arial"');
    expect(xml).toContain('<w:sz w:val="24"/>');
  });

  it('lit gras/italique/exposant/fond depuis les styles CSS', async () => {
    const { xml } = await toDocumentXml(
      '<p><span style="font-weight:700;vertical-align:super;background:yellow">x</span>' +
        '<span style="font-weight:bold;vertical-align:sub;font-size:large">y</span></p>',
    );
    expect(count(xml, '<w:b/>')).toBe(2);
    expect(xml).toContain('<w:vertAlign w:val="superscript"/>');
    expect(xml).toContain('<w:vertAlign w:val="subscript"/>');
    expect(xml).toContain('<w:highlight w:val="yellow"/>');
  });

  it('regroupe un lien en ExternalHyperlink avec le style Hyperlink et ignore les schémas interdits', async () => {
    const { xml } = await toDocumentXml(
      '<p>Voir <a href="https://example.com">le <strong>site</strong></a> et <a href="javascript:alert(1)">ko</a></p>',
    );
    expect(count(xml, '<w:hyperlink')).toBe(1);
    expect(count(xml, '<w:rStyle w:val="Hyperlink"/>')).toBe(2);
    expect(xml).toContain('<w:t xml:space="preserve">ko</w:t>');
  });

  it('numérote les listes imbriquées avec une instance par liste et le bon format', async () => {
    const { xml } = await toDocumentXml(
      '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li></ul>' +
        '<ol type="a"><li><p>d</p><p>suite</p></li></ol><ol type="I"><li>e</li></ol><ol type="A"><li>f</li></ol><ol type="i"><li>g</li></ol>',
    );
    expect(count(xml, '<w:ilvl w:val="0"/>')).toBe(5);
    expect(count(xml, '<w:ilvl w:val="1"/>')).toBe(1);
    expect(count(xml, '<w:ilvl w:val="2"/>')).toBe(1);
    // Le second paragraphe du li n'est pas numéroté mais indenté.
    expect(count(xml, '<w:numPr>')).toBe(7);
    expect(xml).toContain('<w:ind w:left="720"/>');
    expect(xml).toContain('<w:t xml:space="preserve">suite</w:t>');
  });

  it('stylise citation, bloc de code et filet', async () => {
    const { xml } = await toDocumentXml(
      '<blockquote>citation nue</blockquote><blockquote><p>a</p><p>b</p></blockquote>' +
        '<pre>ligne 1\n\nligne 3\n</pre><hr>',
    );
    expect(count(xml, '<w:pStyle w:val="Quote"/>')).toBe(3);
    expect(count(xml, '<w:pStyle w:val="HTMLPreformatted"/>')).toBe(3);
    expect(xml).toContain('<w:t xml:space="preserve">ligne 3</w:t>');
    expect(xml).toContain('<w:pBdr><w:bottom w:val="single"');
  });

  it('produit une table 100 % avec en-tête, fusion horizontale et verticale', async () => {
    const { xml } = await toDocumentXml(
      '<table><tr><th>H1</th><th>H2</th></tr><tr><td colspan="2">wide</td></tr>' +
        '<tr><td rowspan="2">tall</td><td>x</td></tr><tr><td>y</td></tr><tr></tr></table>',
    );
    // 100 % s'écrit en cinquantièmes de pour cent dans OOXML.
    expect(xml).toContain('<w:tblW w:type="pct" w:w="5000"/>');
    expect(count(xml, '<w:tblHeader/>')).toBe(1);
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
    expect(xml).toContain('<w:vMerge w:val="restart"/>');
    expect(xml).toContain('<w:vMerge w:val="continue"/>');
    // Les cellules d'en-tête sont en gras.
    expect(count(xml, '<w:b/>')).toBe(2);
  });

  it('gère une table vide, une table dans une citation et une cellule vide', async () => {
    const { xml } = await toDocumentXml(
      '<table></table><blockquote><table><tr><td></td><td><p>a</p><p>b</p></td></tr></table></blockquote>',
    );
    expect(count(xml, '<w:tbl>')).toBe(2);
    expect(xml).not.toContain('<w:pStyle w:val="Quote"/>');
    expect(xml).toContain('<w:t xml:space="preserve">b</w:t>');
  });

  it('traverse les conteneurs, regroupe les inline nus et ignore les éléments sans équivalent', async () => {
    const { xml, warnings } = await toDocumentXml(
      '<div>texte nu <b>gras</b><p>bloc</p>suite</div><section><article>profond</article></section>' +
        '<iframe src="x"></iframe><video></video><p>fin<script>1</script></p><!-- commentaire -->',
    );
    expect(xml).toContain('<w:t xml:space="preserve">texte nu </w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">suite</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">profond</w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">fin</w:t>');
    expect(xml).not.toContain('>1<');
    expect(warnings).toEqual([
      { code: 'unsupported-element', message: expect.stringContaining('<iframe>') },
      { code: 'unsupported-element', message: expect.stringContaining('<video>') },
    ]);
  });

  it('applique les règles de blancs HTML et conserve les sauts de ligne', async () => {
    const { xml } = await toDocumentXml('<p>\n  a   <em> b </em>  c\n</p><p>x<br>y</p><p>   </p>');
    expect(xml).toContain('<w:t xml:space="preserve">a </w:t>');
    expect(xml).toContain('<w:t xml:space="preserve">b </w:t>');
    // L'espace finale (ici le `\n` réduit) est conservée : `<p>Titre : </p>` est du contenu (R27).
    expect(xml).toContain('<w:t xml:space="preserve">c </w:t>');
    expect(xml).toContain('<w:br/>');
    // Le troisième `<p>` ne contient que des blancs : il devient un paragraphe vide `<w:p/>`.
    expect(count(xml, '<w:p>') + count(xml, '<w:p/>')).toBe(3);
  });

  it('rend un document avec un paragraphe vide quand le HTML est vide, et honore titre, auteur et Letter', async () => {
    const { xml } = await toDocumentXml('', { title: 'T', creator: 'C', pageSize: 'LETTER' });
    expect(count(xml, '<w:p/>')).toBe(1);
    expect(xml).toContain('w:w="12240"');
    expect(xml).toContain('w:h="15840"');
    const a4 = await toDocumentXml('<p>a</p>');
    expect(a4.xml).toContain('w:w="11906"');
  });

  it('conserve les espaces insécables et Unicode, seuls les blancs HTML sont réduits (X-2)', async () => {
    const nbsp = String.fromCharCode(160);
    const emSpace = String.fromCharCode(0x2003);
    const { xml } = await toDocumentXml(
      `<p>a&nbsp;&nbsp;b</p><p>${nbsp}tête</p><p>Bonjour&nbsp;!</p><p>${nbsp}</p><p>x${emSpace}${emSpace}y  z</p>`,
    );
    expect(xml).toContain(`>a${nbsp}${nbsp}b</w:t>`);
    expect(xml).toContain(`>${nbsp}tête</w:t>`);
    expect(xml).toContain(`>Bonjour${nbsp}!</w:t>`);
    // Un paragraphe qui ne contient qu'un NBSP n'est pas vide.
    expect(xml).toContain(`>${nbsp}</w:t>`);
    expect(xml).toContain(`>x${emSpace}${emSpace}y z</w:t>`);
  });

  it('retire les <br> terminaux d’un paragraphe qui a d’autre contenu (M-3)', async () => {
    const { xml } = await toDocumentXml(
      '<p>a<br></p><p>b<br><br></p><p><br></p><p><br><br></p><p>c<br>d</p>',
    );
    // `a` et `b` : plus aucun saut ; `<p><br></p>` et `<p><br><br></p>` gardent les leurs ; `c<br>d` en garde un.
    expect(count(xml, '<w:br/>')).toBe(4);
    expect(xml).toContain('>a</w:t></w:r></w:p>');
    expect(xml).toContain('>b</w:t></w:r></w:p>');
    expect(xml).toContain('>c</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">d</w:t>');
  });

  it('isole par des sauts de ligne un bloc égaré en contexte inline (M-5)', async () => {
    // Le `<p>` intermédiaire sépare les deux `span` en deux paragraphes distincts.
    const { xml } = await toDocumentXml(
      '<span>x<div>y</div>z</span><p>sep</p><span><div>seul</div></span>',
    );
    expect(count(xml, '<w:br/>')).toBe(2);
    expect(xml).toContain('>x</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">y</w:t>');
    expect(xml).toContain('>y</w:t></w:r><w:r><w:br/></w:r><w:r><w:t xml:space="preserve">z</w:t>');
    // Un bloc seul ne produit ni saut en tête ni saut terminal.
    expect(xml).toContain('<w:p><w:r><w:t xml:space="preserve">seul</w:t></w:r></w:p>');
  });

  it('numérote un li qui commence par une sous-liste ou un titre', async () => {
    const { xml } = await toDocumentXml(
      '<ul><li><ul><li>inner</li></ul></li><li><h2>Titre</h2><p>après</p></li><li>  </li></ul>',
    );
    expect(count(xml, '<w:numPr>')).toBe(4);
    expect(xml).toContain('<w:pStyle w:val="Heading2"/>');
  });
});
