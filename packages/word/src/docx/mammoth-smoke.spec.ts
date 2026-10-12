import { describe, expect, it } from 'vitest';

/**
 * Smoke test de phase 0 : mammoth se charge en import dynamique et convertit un
 * buffer vide en erreur propre plutôt qu'en crash de module.
 */
describe('mammoth', () => {
  it('se charge en import dynamique et expose convertToHtml', async () => {
    const mammoth = await import('mammoth');
    expect(typeof mammoth.convertToHtml).toBe('function');
    await expect(mammoth.convertToHtml({ arrayBuffer: new ArrayBuffer(0) })).rejects.toBeDefined();
  });
});
