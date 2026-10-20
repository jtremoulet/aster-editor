import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FormPage } from './form.page';

async function mountPage(): Promise<{ fixture: ComponentFixture<FormPage>; host: HTMLElement }> {
  TestBed.configureTestingModule({ imports: [FormPage] });
  const fixture = TestBed.createComponent(FormPage);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, host: fixture.nativeElement as HTMLElement };
}

describe('FormPage', () => {
  it('monte un aster-editor lié au contrôle body et reflète l’état du formulaire', async () => {
    const { fixture, host } = await mountPage();
    expect(host.querySelector('aster-editor')).not.toBeNull();
    const status = Array.from(host.querySelectorAll('.demo-status li'));
    expect(status.map((li) => li.classList.contains('is-on'))).toEqual([
      false,
      false,
      false,
      false,
    ]);

    const content = host.querySelector<HTMLElement>('.aster-content .ProseMirror');
    content?.dispatchEvent(new FocusEvent('blur'));
    fixture.detectChanges();
    expect(host.querySelector('.demo-error')?.textContent).toContain('vide');
  });

  it('n’affiche l’erreur du corps que si le corps lui-même est touché', async () => {
    const { fixture, host } = await mountPage();
    const title = host.querySelector<HTMLInputElement>('input[formControlName="title"]');
    expect(title).not.toBeNull();
    title?.dispatchEvent(new Event('blur'));
    fixture.detectChanges();
    expect(host.querySelector('.demo-status li:nth-child(2)')?.classList.contains('is-on')).toBe(
      true,
    );
    expect(host.querySelector('.demo-error')).toBeNull();

    host.querySelector('form')?.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.querySelector('.demo-error')?.textContent).toContain('vide');
  });

  it('nomme la zone de saisie via aria-labelledby sur le libellé « Corps »', async () => {
    const { host } = await mountPage();
    const content = host.querySelector<HTMLElement>('.aster-content .ProseMirror');
    const labelId = content?.getAttribute('aria-labelledby');
    expect(labelId).toBe('body-label');
    expect(host.querySelector(`#${labelId}`)?.textContent).toBe('Corps');
  });
});
