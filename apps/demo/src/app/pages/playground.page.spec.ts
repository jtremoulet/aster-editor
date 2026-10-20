import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PlaygroundPage } from './playground.page';

describe('PlaygroundPage', () => {
  it('monte un aster-editor avec la toolbar full et le contenu d’exemple', async () => {
    TestBed.configureTestingModule({ imports: [PlaygroundPage] });
    const fixture = TestBed.createComponent(PlaygroundPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('aster-editor')).not.toBeNull();
    expect(host.querySelector('.aster-toolbar')).not.toBeNull();
    expect(host.querySelector('.aster-content h1')?.textContent).toContain('Bienvenue');
    expect(host.querySelector('.demo-counts')?.textContent).toMatch(/\d+ mots/);
  });

  it('coche l’option courante des sélecteurs et suit le changement', async () => {
    TestBed.configureTestingModule({ imports: [PlaygroundPage] });
    const fixture = TestBed.createComponent(PlaygroundPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const selects = host.querySelectorAll<HTMLSelectElement>('.demo-controls select');
    expect(selects.length).toBe(3);
    expect(Array.from(selects).map((select) => select.value)).toEqual(['light', 'fr', 'full']);

    const theme = selects[0];
    if (!theme) {
      throw new Error('theme select missing');
    }
    theme.value = 'night';
    theme.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(theme.querySelector<HTMLOptionElement>('option[value="night"]')?.selected).toBe(true);
    expect(host.querySelector('.aster')?.getAttribute('data-theme')).toBe('night');
  });

  it('affiche le HTML du document au clic sur « HTML »', async () => {
    TestBed.configureTestingModule({ imports: [PlaygroundPage] });
    const fixture = TestBed.createComponent(PlaygroundPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector<HTMLButtonElement>('.demo-button')?.click();
    fixture.detectChanges();
    expect(host.querySelector('.demo-output')?.textContent).toContain('<h1>Bienvenue');
  });
});
