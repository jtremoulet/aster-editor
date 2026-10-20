import { describe, expect, it } from 'vitest';
import { exportDocx } from './export-docx';
import { parseFragment, roundTrip, toZipEntries } from './testing/sample';

/** Entrées `numbering.xml` et `document.xml` d'un export. */
async function numberingOf(html: string): Promise<{ numbering: string; document: string }> {
  const entries = await toZipEntries(await exportDocx(html));
  return {
    numbering: entries.get('word/numbering.xml') ?? '',
    document: entries.get('word/document.xml') ?? '',
  };
}

/** `numId` du paragraphe numéroté qui contient exactement `text`. */
function numIdOf(document: string, text: string): string {
  const paragraphs = document.split('<w:p>').filter((p) => p.includes(`>${text}</w:t>`));
  const numId = /<w:numId w:val="(\d+)"\/>/.exec(paragraphs[0] ?? '')?.[1];
  if (!numId) throw new Error(`paragraphe numéroté « ${text} » introuvable`);
  return numId;
}

/** `<w:num>` d'un `numId` donné. */
function numElement(numbering: string, numId: string): string {
  const match = new RegExp(`<w:num w:numId="${numId}">.*?</w:num>`).exec(numbering)?.[0];
  if (!match) throw new Error(`w:num ${numId} introuvable`);
  return match;
}

/** `abstractNumId` référencé par un `<w:num>`. */
function abstractNumIdOf(numbering: string, numId: string): string {
  const id = /<w:abstractNumId w:val="(\d+)"\/>/.exec(numElement(numbering, numId))?.[1];
  if (!id) throw new Error(`abstractNumId du num ${numId} introuvable`);
  return id;
}

/** Niveau `ilvl` d'un `<w:abstractNum>`. */
function levelOf(numbering: string, abstractNumId: string, level: number): string {
  const abstractNum = new RegExp(
    `<w:abstractNum w:abstractNumId="${abstractNumId}".*?</w:abstractNum>`,
  ).exec(numbering)?.[0];
  const lvl = new RegExp(`<w:lvl w:ilvl="${String(level)}".*?</w:lvl>`).exec(
    abstractNum ?? '',
  )?.[0];
  if (!lvl)
    throw new Error(`niveau ${String(level)} de l'abstractNum ${abstractNumId} introuvable`);
  return lvl;
}

describe('numérotation des listes — une référence par liste (X-3, X-4)', () => {
  it('honore <ol start> dans numbering.xml : w:start et startOverride du niveau 0', async () => {
    const { numbering, document } = await numberingOf(
      '<ol start="5"><li>a</li><li>b</li></ol><ol><li>c</li></ol>',
    );
    const numId = numIdOf(document, 'a');
    expect(numElement(numbering, numId)).toContain('<w:startOverride w:val="5"/>');
    expect(levelOf(numbering, abstractNumIdOf(numbering, numId), 0)).toContain(
      '<w:start w:val="5"/>',
    );
    // La liste suivante repart à 1 : elle a sa propre numérotation.
    const other = numIdOf(document, 'c');
    expect(other).not.toBe(numId);
    expect(numElement(numbering, other)).toContain('<w:startOverride w:val="1"/>');
  });

  it('pose le start d’un <ol> imbriqué sur son propre niveau', async () => {
    const { numbering, document } = await numberingOf(
      '<ul><li>x<ol start="3"><li>a</li></ol></li></ul>',
    );
    const numId = numIdOf(document, 'a');
    const abstractNumId = abstractNumIdOf(numbering, numId);
    expect(levelOf(numbering, abstractNumId, 1)).toContain('<w:start w:val="3"/>');
    expect(levelOf(numbering, abstractNumId, 0)).toContain('<w:start w:val="1"/>');
  });

  it('ignore un start invalide ou nul et repart à 1', async () => {
    const { numbering, document } = await numberingOf(
      '<ol start="0"><li>a</li></ol><ol start="abc"><li>b</li></ol>',
    );
    for (const text of ['a', 'b']) {
      const numId = numIdOf(document, text);
      expect(levelOf(numbering, abstractNumIdOf(numbering, numId), 0)).toContain(
        '<w:start w:val="1"/>',
      );
    }
  });

  it('donne un abstractNum distinct à deux sous-listes de même format (X-4)', async () => {
    const { numbering, document } = await numberingOf(
      '<ul><li>x<ol><li>a</li><li>b</li></ol></li><li>y<ol><li>c</li></ol></li></ul>',
    );
    const first = numIdOf(document, 'a');
    const second = numIdOf(document, 'c');
    expect(numIdOf(document, 'b')).toBe(first);
    expect(second).not.toBe(first);
    expect(abstractNumIdOf(numbering, second)).not.toBe(abstractNumIdOf(numbering, first));
    // Les puces parentes partagent une seule numérotation.
    expect(numIdOf(document, 'y')).toBe(numIdOf(document, 'x'));
    // Trois listes HTML, plus la numérotation à puces que `docx` déclare d'office.
    expect(numbering.split('<w:abstractNum ').length - 1).toBe(4);
  });

  it('ne déclare aucune numérotation sans liste, hors celle par défaut de docx', async () => {
    const { numbering } = await numberingOf('<p>a</p>');
    expect(numbering.split('<w:abstractNum ').length - 1).toBe(1);
    expect(numbering).not.toContain('aster-');
  });
});

describe('aller-retour des listes — comportement figé (X-3, M-1, M-2)', () => {
  it('perd le start à la réimportation : mammoth ne lit pas w:start (X-3)', async () => {
    // Attendu idéal : `<ol start="5">`. mammoth ignore `w:start`/`startOverride`, la
    // valeur n'est vérifiable que dans `numbering.xml` (voir le bloc XML ci-dessus).
    const { html } = await roundTrip('<ol start="5"><li>a</li><li>b</li></ol>');
    expect(html).toBe('<ol><li><p>a</p></li><li><p>b</p></li></ol>');
  });

  it('dégrade une liste dans une citation en paragraphes de citation (M-1)', async () => {
    // Attendu idéal : `<blockquote><ul>…</ul><p>fin</p></blockquote>`. Les paragraphes
    // portent à la fois le style `Quote` et une numérotation ; mammoth suit le style et
    // jette la liste. Ce test fige la dégradation pour détecter une régression.
    const { html, warnings } = await roundTrip(
      '<blockquote><ul><li>a</li><li>b</li></ul><p>fin</p></blockquote>',
    );
    const doc = parseFragment(html);
    expect(doc.querySelectorAll('ul, ol, li').length).toBe(0);
    expect(Array.from(doc.querySelectorAll('blockquote > p'), (p) => p.textContent)).toEqual([
      'a',
      'b',
      'fin',
    ]);
    expect(warnings).toEqual([]);
  });

  it('dégrade un li multi-paragraphes avec sous-liste en listes sœurs (M-2)', async () => {
    // Attendu idéal : `<ul><li><p>a</p><p>b</p><ul><li><p>c</p></li></ul><p>d</p></li><li><p>e</p></li></ul>`.
    // Les paragraphes suivants d'un li sont de simples paragraphes indentés (export Word
    // standard) : mammoth les sort de la liste et coupe celle-ci en morceaux.
    const { html, warnings } = await roundTrip(
      '<ul><li><p>a</p><p>b</p><ul><li><p>c</p></li></ul><p>d</p></li><li><p>e</p></li></ul>',
    );
    expect(html).toBe(
      '<ul><li><p>a</p></li></ul><p>b</p><ul><li><p></p><ul><li><p>c</p></li></ul></li></ul><p>d</p><ul><li><p>e</p></li></ul>',
    );
    expect(warnings).toEqual([]);
  });
});
