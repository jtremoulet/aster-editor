import { describe, expect, it } from 'vitest';
import { toDocumentXml } from './testing/sample';

/** Nombre d'occurrences d'une sous-chaîne. */
function count(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('largeurs de colonnes à l’export', () => {
  it('colwidth complet → grille DXA, cellules à largeur fixe et disposition fixe', async () => {
    const { xml } = await toDocumentXml(
      '<table><tr><td colwidth="100">a</td><td colwidth="200">b</td></tr><tr><td>c</td><td>d</td></tr></table>',
    );
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="4500"/>');
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    expect(xml).toContain('<w:gridCol w:w="1500"/>');
    expect(xml).toContain('<w:gridCol w:w="3000"/>');
    // Les cellules sans largeur propre héritent de celle de leur colonne.
    expect(count(xml, '<w:tcW w:type="dxa" w:w="1500"/>')).toBe(2);
    expect(count(xml, '<w:tcW w:type="dxa" w:w="3000"/>')).toBe(2);
  });

  it('lit style="width" et l’attribut width, et une cellule fusionnée somme ses colonnes', async () => {
    const { xml } = await toDocumentXml(
      '<table><tr><td style="width: 120px">a</td><td width="80">b</td></tr>' +
        '<tr><td colspan="2" colwidth="120,80">c</td></tr></table>',
    );
    expect(xml).toContain('<w:gridCol w:w="1800"/>');
    expect(xml).toContain('<w:gridCol w:w="1200"/>');
    expect(xml).toContain('<w:tcW w:type="dxa" w:w="3000"/>');
    expect(xml).toContain('<w:gridSpan w:val="2"/>');
  });

  it('reste à 100 % quand une colonne est inconnue, la cellule connue gardant sa largeur', async () => {
    const { xml } = await toDocumentXml(
      '<table><tr><td colwidth="100">a</td><td>b</td></tr></table>',
    );
    expect(xml).toContain('<w:tblW w:type="pct" w:w="5000"/>');
    expect(xml).not.toContain('<w:tblLayout');
    expect(xml).toContain('<w:tcW w:type="dxa" w:w="1500"/>');
    expect(count(xml, '<w:tcW')).toBe(1);
  });

  it('prend les largeurs de colgroup en repli et tient compte des rowspan', async () => {
    const { xml } = await toDocumentXml(
      '<table><colgroup><col style="width:50px"><col width="60"></colgroup>' +
        '<tr><td rowspan="2" colwidth="100">a</td><td>b</td></tr><tr><td>c</td></tr></table>',
    );
    // La cellule l'emporte sur colgroup pour la première colonne, colgroup renseigne la seconde.
    expect(xml).toContain('<w:gridCol w:w="1500"/>');
    expect(xml).toContain('<w:gridCol w:w="900"/>');
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
    // `c` est en seconde colonne, sous `b`, malgré le rowspan de `a`.
    expect(count(xml, '<w:tcW w:type="dxa" w:w="900"/>')).toBe(2);
  });

  it('réduit à l’échelle une table plus large que la zone de texte', async () => {
    const { xml } = await toDocumentXml(
      '<table><tr><td colwidth="800">a</td><td colwidth="800">b</td></tr></table>',
    );
    // A4 portrait, marges 2,54 cm : 601 px utiles (9026 twips arrondis au pixel), partagés à parts égales.
    expect(xml).toContain('<w:tblW w:type="dxa" w:w="9016"/>');
    expect(count(xml, '<w:gridCol w:w="4508"/>')).toBe(2);
    expect(xml).toContain('<w:tblLayout w:type="fixed"/>');
  });

  it('ignore un colwidth incohérent avec le colspan et un pourcentage', async () => {
    const { xml } = await toDocumentXml(
      '<table><tr><td colspan="2" colwidth="100">a</td></tr><tr><td style="width:50%">b</td><td>c</td></tr></table>',
    );
    expect(xml).toContain('<w:tblW w:type="pct" w:w="5000"/>');
    expect(xml).not.toContain('<w:tcW');
  });
});
