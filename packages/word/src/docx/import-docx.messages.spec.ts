import { describe, expect, it, vi } from 'vitest';
import { importDocx } from './import-docx';

/**
 * mammoth est mocké ici car les fixtures synthétiques ne déclenchent aucun message :
 * on vérifie uniquement la traduction `result.messages` → `DocxImportWarning`. Chemin
 * `fidelity: 'semantic'` explicite : le défaut (`styled`, 0.6) n'appelle jamais mammoth.
 */
vi.mock('mammoth', () => {
  const convertToHtml = vi.fn(async () => ({
    value: '<p>Contenu</p>',
    messages: [
      { type: 'warning', message: "Unrecognised paragraph style: 'Note' (Style ID: Note)" },
      { type: 'error', message: 'Image illisible', error: new Error('boom') },
    ],
  }));
  const images = { dataUri: {}, imgElement: vi.fn(() => ({})) };
  return { default: { convertToHtml, images }, convertToHtml, images };
});

/** Buffer minimal portant la signature zip, suffisant puisque mammoth est mocké. */
const ZIP_LIKE = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0]).buffer as ArrayBuffer;

describe('importDocx — messages mammoth', () => {
  it('traduit chaque message mammoth en avertissement de code mammoth', async () => {
    const { html, warnings } = await importDocx(ZIP_LIKE, { fidelity: 'semantic' });
    expect(html).toBe('<p>Contenu</p>');
    expect(warnings).toEqual([
      {
        code: 'mammoth',
        message: "warning: Unrecognised paragraph style: 'Note' (Style ID: Note)",
      },
      { code: 'mammoth', message: 'error: Image illisible' },
    ]);
  });

  it('passe la style map Aster suivie des règles utilisateur à mammoth', async () => {
    const mammoth = await import('mammoth');
    await importDocx(ZIP_LIKE, {
      fidelity: 'semantic',
      styleMap: ["p[style-name='Note'] => aside:fresh"],
    });
    const call = vi.mocked(mammoth.convertToHtml).mock.lastCall;
    const styleMap = call?.[1]?.styleMap;
    expect(Array.isArray(styleMap)).toBe(true);
    expect(styleMap?.at(-1)).toBe("p[style-name='Note'] => aside:fresh");
    expect(styleMap).toContain("p[style-name='Titre 1'] => h1:fresh");
  });
});
