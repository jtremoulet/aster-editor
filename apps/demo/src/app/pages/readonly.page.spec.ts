import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ReadonlyPage } from './readonly.page';

describe('ReadonlyPage', () => {
  it('monte un aster-editor figé, sans toolbar, avec le contenu d’exemple', async () => {
    TestBed.configureTestingModule({ imports: [ReadonlyPage] });
    const fixture = TestBed.createComponent(ReadonlyPage);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('aster-editor')).not.toBeNull();
    expect(host.querySelector('.aster-toolbar')).toBeNull();
    expect(host.querySelector('.aster')?.getAttribute('data-theme')).toBe('night');
    const content = host.querySelector('.aster-content .ProseMirror');
    expect(content?.getAttribute('contenteditable')).toBe('false');
    expect(content?.querySelector('table')).not.toBeNull();
  });
});
