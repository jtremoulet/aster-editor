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
