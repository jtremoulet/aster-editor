import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
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

async function mountPage(): Promise<{
  fixture: ComponentFixture<TemplatePage>;
  host: HTMLElement;
}> {
  TestBed.configureTestingModule({ imports: [TemplatePage] });
  const fixture = TestBed.createComponent(TemplatePage);
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

/** Les neuf noms distincts de `08-variables-braces.docx` (`date_signature` y figure deux fois). */
const SAMPLE_VARIABLE_COUNT = 9;

describe('TemplatePage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('monte la zone de dépôt, le bouton d’exemple, les onglets et un aster-editor sans formulaire', async () => {
    const { host } = await mountPage();
    expect(host.querySelector('.demo-dropzone')).not.toBeNull();
    expect(host.querySelector('input[type="file"]')?.getAttribute('accept')).toBe('.docx');
    expect(buttonByText(host, "Charger l'exemple").disabled).toBe(false);
    expect(host.querySelectorAll('[role="tab"]').length).toBe(2);
    expect(host.querySelector('aster-editor .aster-toolbar')).not.toBeNull();
    expect(host.querySelector('.demo-variables')).toBeNull();
    expect(buttonByText(host, 'Télécharger résolu').disabled).toBe(true);
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
    const bytes = await readFixture('fixtures/docx/08-variables-braces.docx');
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      blob: async () => new Blob([bytes]),
    } as Response);
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
});
