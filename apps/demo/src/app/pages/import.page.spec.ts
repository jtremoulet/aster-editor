import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ImportPage } from './import.page';

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

async function mountPage(): Promise<{ fixture: ComponentFixture<ImportPage>; host: HTMLElement }> {
  TestBed.configureTestingModule({ imports: [ImportPage] });
  const fixture = TestBed.createComponent(ImportPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, host: fixture.nativeElement as HTMLElement };
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

/** Simule la sélection d'une fidélité dans le `<select>`. */
function selectFidelity(host: HTMLElement, value: string): void {
  const select = host.querySelector<HTMLSelectElement>('select');
  if (!select) {
    throw new Error('select missing');
  }
  select.value = value;
  select.dispatchEvent(new Event('change'));
}

describe('ImportPage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monte la zone de dépôt, le champ fichier, le sélecteur de fidélité et un aster-editor', async () => {
    const { host } = await mountPage();
    expect(host.querySelector('.demo-dropzone')).not.toBeNull();
    const fileInput = host.querySelector('input[type="file"]');
    expect(fileInput?.getAttribute('accept')).toBe('.docx');
    expect(fileInput?.getAttribute('aria-label')).toContain('.docx');
    expect(host.querySelector('aster-editor .aster-toolbar')).not.toBeNull();
    expect(host.querySelector('.demo-notice')?.textContent).toContain('Coller depuis Word');
    const options = Array.from(host.querySelectorAll('select option')).map((o) => o.textContent);
    expect(options).toEqual(['styled', 'semantic']);
    expect(host.querySelector<HTMLSelectElement>('select')?.value).toBe('styled');
    expect(buttonByText(host, "Charger l'exemple stylé").disabled).toBe(false);
    expect(host.querySelector('.demo-layout')).toBeNull();
  });

  it('refuse un fichier qui n’est pas un .docx sans toucher à l’éditeur', async () => {
    const { fixture, host } = await mountPage();
    const drop = new Event('drop', { cancelable: true }) as DragEvent;
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
    host.querySelector('.demo-dropzone')?.dispatchEvent(drop);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.demo-error')?.textContent).toContain('notes.txt');
  });

  it('charge l’exemple stylé et affiche la mise en page lue (format, orientation, marges)', async () => {
    const bytes = await readFixture('fixtures/docx/13-styles-nommes.docx');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob([bytes]),
    } as Response);
    const { fixture, host } = await mountPage();

    buttonByText(host, "Charger l'exemple stylé").click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(host.querySelector('.demo-layout')).not.toBeNull();
      },
      { timeout: 10_000 },
    );
    expect(fetchSpy).toHaveBeenCalledWith('samples/13-styles-nommes.docx');
    expect(host.querySelector('.demo-dropzone')?.textContent).toContain('13-styles-nommes.docx');
    const lines = Array.from(host.querySelectorAll('.demo-layout__item')).map(
      (item) =>
        `${item.querySelector('dt')?.textContent} = ${item.querySelector('dd')?.textContent}`,
    );
    expect(lines).toContain('Format = A4');
    expect(lines).toContain('Orientation = portrait');
    expect(lines.some((line) => line.startsWith('Marge haute = ') && line.endsWith(' mm'))).toBe(
      true,
    );
    expect(host.querySelector('aster-editor .ProseMirror [data-docx-style]')).not.toBeNull();
  }, 15_000);

  it('en mode semantic, l’import passe par mammoth : pas de mise en page ni de style Word', async () => {
    const bytes = await readFixture('fixtures/docx/13-styles-nommes.docx');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob([bytes]),
    } as Response);
    const { fixture, host } = await mountPage();
    selectFidelity(host, 'semantic');
    fixture.detectChanges();

    buttonByText(host, "Charger l'exemple stylé").click();
    await vi.waitFor(
      () => {
        fixture.detectChanges();
        expect(host.querySelector('.demo-dropzone')?.textContent).toContain('Importé');
      },
      { timeout: 10_000 },
    );
    expect(host.querySelector('.demo-layout')).toBeNull();
    expect(host.querySelector('aster-editor .ProseMirror [data-docx-style]')).toBeNull();
    expect(host.querySelector('aster-editor .ProseMirror')?.textContent?.length).toBeGreaterThan(0);
  }, 15_000);
});
