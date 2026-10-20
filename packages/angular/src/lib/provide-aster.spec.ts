import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ASTER_CONFIG, provideAster } from './provide-aster';
import { ASTER_UPLOAD_HANDLER } from './tokens';

describe('provideAster', () => {
  it('expose la configuration via ASTER_CONFIG', () => {
    const config = { locale: 'en', theme: 'night' } as const;
    TestBed.configureTestingModule({ providers: [provideAster(config)] });
    expect(TestBed.inject(ASTER_CONFIG)).toBe(config);
  });

  it('les tokens sont optionnels : rien de fourni, rien d’injecté', () => {
    TestBed.configureTestingModule({});
    expect(TestBed.inject(ASTER_CONFIG, null)).toBeNull();
    expect(TestBed.inject(ASTER_UPLOAD_HANDLER, null)).toBeNull();
  });
});
