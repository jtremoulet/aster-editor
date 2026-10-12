import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ImportPage } from './import.page';

describe('ImportPage', () => {
  it('monte la zone de dépôt, le champ fichier et un aster-editor', async () => {
    TestBed.configureTestingModule({ imports: [ImportPage] });
    const fixture = TestBed.createComponent(ImportPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.demo-dropzone')).not.toBeNull();
    const fileInput = host.querySelector('input[type="file"]');
    expect(fileInput?.getAttribute('accept')).toBe('.docx');
    expect(fileInput?.getAttribute('aria-label')).toContain('.docx');
    expect(host.querySelector('aster-editor .aster-toolbar')).not.toBeNull();
    expect(host.querySelector('.demo-notice')?.textContent).toContain('Coller depuis Word');
  });

  it('refuse un fichier qui n’est pas un .docx sans toucher à l’éditeur', async () => {
    TestBed.configureTestingModule({ imports: [ImportPage] });
    const fixture = TestBed.createComponent(ImportPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const drop = new Event('drop', { cancelable: true }) as DragEvent;
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(drop, 'dataTransfer', { value: { files: [file] } });
    const host = fixture.nativeElement as HTMLElement;
    host.querySelector('.demo-dropzone')?.dispatchEvent(drop);
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('.demo-error')?.textContent).toContain('notes.txt');
  });
});
