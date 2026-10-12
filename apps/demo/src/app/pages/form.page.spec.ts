import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { FormPage } from './form.page';

describe('FormPage', () => {
  it('monte un aster-editor lié au contrôle body et reflète l’état du formulaire', async () => {
    TestBed.configureTestingModule({ imports: [FormPage] });
    const fixture = TestBed.createComponent(FormPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
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
});
