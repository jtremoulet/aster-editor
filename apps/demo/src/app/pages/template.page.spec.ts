import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AsterEditorComponent } from '@aster-editor/angular';
import type { DocxImportResult, FidelityReport } from '@aster-editor/angular';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TemplatePage } from './template.page';

/**
 * Lit une fixture `.docx` du dépôt. Même recette que le spec du composant : import dynamique
 * à spécificateur variable (le tsconfig de spec n'a pas les types `node`, le test tourne
 * pourtant dans Node) et racine du monorepo retrouvée depuis `process.cwd()`.
 */
async function readFixture(pathFromRoot: string): Promise<Uint8Array<ArrayBuffer>> {
  const fsModule = 'node:fs';
  const processModule = 'node:process';
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string): Uint8Array;
    existsSync(path: string): boolean;
  };
  const process = (await import(/* @vite-ignore */ processModule)) as { cwd(): string };
  let root = process.cwd();
  for (let i = 0; i < 4 && !fs.existsSync(`${root}/fixtures`); i += 1) {
    root = `${root}/..`;
  }
  return new Uint8Array(fs.readFileSync(`${root}/${pathFromRoot}`));
}

/** `fetch` simulé : une fixture par URL d'exemple, 404 sinon. */
async function mockSamples(names: readonly string[]): Promise<ReturnType<typeof vi.spyOn>> {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const name of names) {
    files.set(`samples/${name}`, await readFixture(`fixtures/docx/${name}`));
  }
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const bytes = files.get(String(input));
    return (
      bytes
        ? { ok: true, status: 200, blob: async () => new Blob([bytes]) }
        : { ok: false, status: 404 }
    ) as Response;
  });
}

interface MountedPage {
  fixture: ComponentFixture<TemplatePage>;
  host: HTMLElement;
  /** Éditeur principal (le premier `<aster-editor>` de la page). */
  main: AsterEditorComponent;
}

async function mountPage(): Promise<MountedPage> {
  TestBed.configureTestingModule({ imports: [TemplatePage] });
  const fixture = TestBed.createComponent(TemplatePage);
  fixture.detectChanges();
  await fixture.whenStable();
  const main = fixture.debugElement.query(By.directive(AsterEditorComponent))
    .componentInstance as AsterEditorComponent;
  return { fixture, host: fixture.nativeElement as HTMLElement, main };
}

/** Tous les `<aster-editor>` de la page, dans l'ordre du DOM (principal, en-tête, pied). */
function editors(fixture: ComponentFixture<TemplatePage>): AsterEditorComponent[] {
  return fixture.debugElement
    .queryAll(By.directive(AsterEditorComponent))
    .map((element) => element.componentInstance as AsterEditorComponent);
}

function buttonByText(host: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(host.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  if (!button) {
    throw new Error(`button « ${text} » missing`);
  }
  return button;
}

/** Dépose un fichier sur la zone de dépôt. */
function dropFile(host: HTMLElement, file: File): void {
  const drop = new Event('drop', { cancelable: true }) as DragEvent;
  Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
  host.querySelector('.demo-dropzone')?.dispatchEvent(drop);
}

/** Attend que l'import affiché dans la zone de dépôt porte ce nom de fichier. */
async function waitForImport(
  fixture: ComponentFixture<TemplatePage>,
  host: HTMLElement,
  name: string,
): Promise<void> {
  await vi.waitFor(
    () => {
      fixture.detectChanges();
      expect(host.querySelector('.demo-dropzone')?.textContent).toContain(`Importé : ${name}`);
    },
    { timeout: 10_000 },
  );
}

/** Les neuf noms distincts de `08-variables-braces.docx` (`date_signature` y figure deux fois). */
const SAMPLE_VARIABLE_COUNT = 9;
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Résultat d'import minimal, pour les tests qui n'ont pas besoin d'un vrai `.docx`. */
const FAKE_IMPORT: DocxImportResult = {
  html: '<p>Corps</p>',
  warnings: [],
  variables: [],
  layout: { page: { size: 'A4', orientation: 'portrait' } },
  template: new ArrayBuffer(8),
  lost: [],
};

const FAKE_REPORT: FidelityReport = {
  score: 0.9876,
  properties: [
    { name: 'paragraph.text', group: 'text', total: 12, kept: 12, lost: 0, examples: [] },
    {
      name: 'run.fontFamily',
      group: 'run-format',
      total: 10,
      kept: 8,
      lost: 2,
      examples: [{ where: 'paragraphe 3', expected: 'Arial', actual: 'Calibri' }],
    },
  ],
  identicalParts: ['word/styles.xml', 'word/numbering.xml'],
  changedParts: [{ path: 'word/header1.xml', summary: 'ajoutée' }],
  lost: [],
  notes: [],
};

describe('TemplatePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monte la zone de dépôt, les deux exemples, la vue page active, les onglets et un aster-editor sans formulaire', async () => {
    const { host, main } = await mountPage();
    expect(host.querySelector('.demo-dropzone')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('.docx');
    expect(buttonByText(host, "Charger l'exemple").disabled).toBe(false);
    expect(buttonByText(host, "Charger l'exemple stylé").disabled).toBe(false);
    expect(host.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(host.querySelector('aster-editor .aster-toolbar')).not.toBeNull();
    expect(host.querySelector('.demo-variables')).toBeNull();
    expect(host.querySelector('.demo-header-footer')).toBeNull();
    expect(buttonByText(host, 'Télécharger résolu').disabled).toBe(true);
    expect(buttonByText(host, 'Télécharger (gabarit)').disabled).toBe(true);
    expect(buttonByText(host, 'Rapport de fidélité').disabled).toBe(true);

    const pageView = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(pageView?.checked).toBe(true);
    expect(main.editor()?.element.classList.contains('aster--page-view')).toBe(true);
  });

  it('la case « Vue page » retire et remet la vue page de l’éditeur', async () => {
    const { fixture, host, main } = await mountPage();
    const pageView = host.querySelector<HTMLInputElement>('input[type="checkbox"]');
    if (!pageView) {
      throw new Error('checkbox missing');
    }
    pageView.checked = false;
    pageView.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(main.editor()?.element.classList.contains('aster--page-view')).toBe(false);
    pageView.checked = true;
    pageView.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(main.editor()?.element.classList.contains('aster--page-view')).toBe(true);
  });

  it('affiche une erreur si l’exemple est introuvable', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 404 } as Response);
    const { fixture, host } = await mountPage();
    buttonByText(host, "Charger l'exemple").click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.demo-error')?.textContent).toContain('404');
    });
  });

  it('charge l’exemple, génère le formulaire, applique une valeur et rend l’aperçu résolu', async () => {
    const fetchSpy = await mockSamples(['08-variables-braces.docx']);
    const { fixture, host } = await mountPage();

    buttonByText(host, "Charger l'exemple").click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(host.querySelectorAll('.demo-variables input').length).toBe(SAMPLE_VARIABLE_COUNT);
      },
      { timeout: 10_000 },
    );
    expect(fetchSpy).toHaveBeenCalledWith('samples/08-variables-braces.docx');
    expect(host.querySelector('.demo-dropzone')?.textContent).toContain('08-variables-braces.docx');
    expect(host.querySelector('.demo-variables__status')?.textContent).toContain(
      `${SAMPLE_VARIABLE_COUNT} variables sans valeur`,
    );
    expect(buttonByText(host, 'Télécharger résolu').disabled).toBe(false);
    expect(buttonByText(host, 'Télécharger (gabarit)').disabled).toBe(false);

    const lieu = host.querySelector<HTMLInputElement>('.demo-variables input[name="lieu"]');
    if (!lieu) {
      throw new Error('champ lieu missing');
    }
    lieu.value = 'Montpellier';
    lieu.dispatchEvent(new Event('input'));
    buttonByText(host, 'Appliquer').click();
    fixture.detectChanges();
    expect(host.querySelector('.demo-variables__status')?.textContent).toContain(
      `${SAMPLE_VARIABLE_COUNT - 1} variables sans valeur`,
    );

    buttonByText(host, 'Résolu').click();
    fixture.detectChanges();
    const resolved = host.querySelector('.demo-resolved .ProseMirror');
    expect(resolved?.textContent).toContain('Fait à Montpellier');
    expect(resolved?.textContent).toContain('{{client.nom}}');
    expect(resolved?.querySelector('[data-aster-variable]')).toBeNull();
  }, 15_000);

  it('charge l’exemple stylé : vue page aux dimensions lues, en-tête et pied éditables, export dans le gabarit', async () => {
    await mockSamples(['16-sections.docx']);
    const { fixture, host, main } = await mountPage();

    buttonByText(host, "Charger l'exemple stylé").click();
    await waitForImport(fixture, host, '16-sections.docx');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.demo-header-footer')).not.toBeNull();
    });

    // La vue page par section (L44) : l'hôte porte la section 1 (A4, en-tête « Rapport »),
    // le saut de section porte la section 2 (Letter paysage) ; le résumé suit `layout.page`
    // (dernière section). Le pied de l'hôte est celui de la dernière section.
    const sheet = main.editor()?.element;
    expect(sheet?.style.getPropertyValue('--aster-page-width')).toBe('210mm');
    expect(sheet?.querySelector('hr[data-section-break]')?.getAttribute('style') ?? '').toContain(
      '279.4mm',
    );
    expect(sheet?.querySelector('.aster-page-header')?.textContent).toContain('Rapport');
    expect(sheet?.querySelector('.aster-page-footer')?.textContent).toContain(
      'Section 2 — pied par défaut',
    );
    expect(host.querySelector('.demo-layout-summary')?.textContent).toContain('Letter, landscape');

    // Le panneau « En-tête / Pied » est initialisé depuis ce que l'hôte affiche : en-tête de
    // la première section, pied de la dernière.
    const [, header, footer] = editors(fixture);
    expect(header?.getHTML()).toContain('Rapport');
    expect(footer?.getHTML()).toContain('Section 2 — pied par défaut');

    // Modifier l'en-tête se répercute sur la vue page de l'éditeur principal (section 1) ;
    // `layout.headers` (dernière section, contrat) reste celui de la section 2.
    header?.editor()?.setHTML('<p>Nouvel en-tête</p>', true);
    fixture.detectChanges();
    expect(sheet?.querySelector('.aster-page-header')?.textContent).toBe('Nouvel en-tête');
    expect(main.layout()?.sections?.[0]?.headers?.default?.html).toBe('<p>Nouvel en-tête</p>');
    expect(main.layout()?.headers?.default?.html).toContain('Section 2 — en-tête par défaut');
    expect(main.layout()?.footers?.default?.html).toContain('Section 2 — pied par défaut');
    expect(main.layout()?.page?.size).toBe('Letter');

    // Modifier le pied va dans la dernière section et au premier niveau (invariant).
    footer?.editor()?.setHTML('<p>Nouveau pied</p>', true);
    fixture.detectChanges();
    expect(sheet?.querySelector('.aster-page-footer')?.textContent).toBe('Nouveau pied');
    expect(main.layout()?.footers?.default?.html).toBe('<p>Nouveau pied</p>');
    expect(main.layout()?.sections?.at(-1)?.footers?.default?.html).toBe('<p>Nouveau pied</p>');

    // Export dans le gabarit : gabarit importé et mise en page éditée transmis.
    const exportSpy = vi.spyOn(main, 'exportDocx').mockResolvedValue(new Blob(['docx']));
    const createObjectURL = vi.fn(() => 'blob:aster');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL }));
    buttonByText(host, 'Télécharger (gabarit)').click();
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1));
    expect(exportSpy).toHaveBeenCalledTimes(1);
    const options = exportSpy.mock.calls[0]?.[0];
    expect(options?.template).toBe(main.importedTemplate());
    expect(options?.variables?.mode).toBe('fields');
    expect(options?.layout?.sections?.[0]?.headers?.default?.html).toBe('<p>Nouvel en-tête</p>');
    expect(options?.layout?.footers?.default?.html).toBe('<p>Nouveau pied</p>');

    // Les exports existants restent des exports neufs (pas de gabarit).
    buttonByText(host, 'Télécharger modèle').click();
    await vi.waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(2));
    expect(exportSpy.mock.calls[1]?.[0]?.template).toBeUndefined();
    expect(exportSpy.mock.calls[1]?.[0]?.layout?.sections?.[0]?.headers?.default?.html).toBe(
      '<p>Nouvel en-tête</p>',
    );
    vi.unstubAllGlobals();
  }, 20_000);

  it('rend le rapport de fidélité (score, tableau, parties) avec compareWithTemplate simulé', async () => {
    const { fixture, host, main } = await mountPage();
    vi.spyOn(main, 'importDocx').mockResolvedValue(FAKE_IMPORT);
    const compare = vi.spyOn(main, 'compareWithTemplate').mockResolvedValue(FAKE_REPORT);

    dropFile(host, new File(['x'], 'faux.docx', { type: DOCX_MIME }));
    await waitForImport(fixture, host, 'faux.docx');
    expect(buttonByText(host, 'Rapport de fidélité').disabled).toBe(false);
    expect(host.querySelector('.demo-fidelity')).toBeNull();

    buttonByText(host, 'Rapport de fidélité').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.demo-fidelity')).not.toBeNull();
    });
    expect(compare).toHaveBeenCalledTimes(1);
    expect(host.querySelector('.demo-fidelity__score')?.textContent).toContain('98.8 %');
    expect(host.querySelector('.demo-fidelity__score')?.classList.contains('is-ok')).toBe(true);
    const rows = Array.from(host.querySelectorAll('.demo-fidelity__table tbody tr'));
    expect(rows.length).toBe(2);
    expect(rows[0]?.textContent).toContain('text');
    expect(rows[0]?.textContent).toContain('paragraph.text');
    expect(rows[0]?.textContent).toContain('12 / 12');
    expect(rows[0]?.classList.contains('is-lost')).toBe(false);
    expect(rows[1]?.classList.contains('is-lost')).toBe(true);
    expect(rows[1]?.textContent).toContain('8 / 10');
    expect(rows[1]?.textContent).toContain('paragraphe 3');
    expect(rows[1]?.textContent).toContain('Arial');
    expect(host.querySelector('.demo-fidelity .demo-panel__hint')?.textContent).toContain(
      '2 parties',
    );
    expect(host.querySelector('.demo-fidelity__parts')?.textContent).toContain('word/header1.xml');
  });

  it('signale l’absence de gabarit quand compareWithTemplate rend null', async () => {
    const { fixture, host, main } = await mountPage();
    vi.spyOn(main, 'importDocx').mockResolvedValue(FAKE_IMPORT);
    vi.spyOn(main, 'compareWithTemplate').mockResolvedValue(null);
    dropFile(host, new File(['x'], 'faux.docx', { type: DOCX_MIME }));
    await waitForImport(fixture, host, 'faux.docx');
    buttonByText(host, 'Rapport de fidélité').click();
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.demo-error')?.textContent).toContain('Aucun gabarit');
    });
    expect(host.querySelector('.demo-fidelity')).toBeNull();
  });

  it('liste les objets non représentables du document importé (fixture 17)', async () => {
    const bytes = await readFixture('fixtures/docx/17-objets-perdus.docx');
    const { fixture, host } = await mountPage();
    expect(host.querySelector('.demo-lost')).toBeNull();
    dropFile(host, new File([bytes], '17-objets-perdus.docx', { type: DOCX_MIME }));
    await waitForImport(fixture, host, '17-objets-perdus.docx');
    await vi.waitFor(() => {
      fixture.detectChanges();
      expect(host.querySelector('.demo-lost')).not.toBeNull();
    });
    const items = Array.from(host.querySelectorAll('.demo-lost li')).map((li) => li.textContent);
    expect(items.length).toBeGreaterThan(0);
    expect(items.some((text) => text?.includes('textbox (body) — Zone de texte 1'))).toBe(true);
    expect(items.some((text) => text?.includes('Texte dans la zone de texte'))).toBe(true);
    expect(items.some((text) => text?.includes('shape'))).toBe(true);
  }, 15_000);
});
