import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { importDocx } from '../import-docx';
import { relsPathOf, resolveTarget } from './package';

const FIXTURES = join(import.meta.env.ASTER_FIXTURES, 'docx');

async function fixture(name: string): Promise<ArrayBuffer> {
  const buffer = await readFile(join(FIXTURES, name));
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

describe('lecteur OOXML (squelette de phase 0)', () => {
  it('résout les chemins de relations et de cibles', () => {
    expect(relsPathOf('word/document.xml')).toBe('word/_rels/document.xml.rels');
    expect(relsPathOf('document.xml')).toBe('_rels/document.xml.rels');
    expect(resolveTarget('word/document.xml', 'media/image1.png')).toBe('word/media/image1.png');
    expect(resolveTarget('word/document.xml', '../docProps/core.xml')).toBe('docProps/core.xml');
    expect(resolveTarget('word/document.xml', '/word/styles.xml')).toBe('word/styles.xml');
  });

  it('lit le corps en mode styled : texte, titres, gabarit et mise en page', async () => {
    const buffer = await fixture('01-headings-lists.docx');
    const result = await importDocx(buffer, { fidelity: 'styled' });
    expect(result.html).toMatch(/<h1[ >]|<h2[ >]|<p[ >]/);
    expect(result.html).not.toBe('');
    expect(result.template).toBe(buffer);
    expect(result.layout).toEqual(expect.any(Object));
    expect(result.lost).toEqual([]);
  });

  it('rend le même texte que le chemin sémantique sur une fixture simple', async () => {
    const buffer = await fixture('01-headings-lists.docx');
    const styled = await importDocx(buffer, { fidelity: 'styled' });
    const semantic = await importDocx(buffer, { fidelity: 'semantic' });
    const textOf = (html: string): string => html.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
    expect(textOf(styled.html)).toBe(textOf(semantic.html));
  });

  it('conserve les variables sur le chemin styled', async () => {
    const buffer = await fixture('08-variables-braces.docx');
    const styled = await importDocx(buffer, { fidelity: 'styled' });
    const semantic = await importDocx(buffer, { fidelity: 'semantic' });
    expect(styled.variables.map((v) => v.name)).toEqual(semantic.variables.map((v) => v.name));
    expect(styled.html).toContain('data-aster-variable=');
  });

  it('le chemin sémantique renseigne aussi gabarit, mise en page vide et objets perdus', async () => {
    const buffer = await fixture('01-headings-lists.docx');
    const result = await importDocx(buffer);
    expect(result.template).toBe(buffer);
    expect(result.layout).toEqual({});
    expect(result.lost).toEqual([]);
  });
});
