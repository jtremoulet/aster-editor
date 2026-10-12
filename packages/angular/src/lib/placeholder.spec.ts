import { describe, expect, it } from 'vitest';
import { ASTER_ANGULAR_PLACEHOLDER } from '../public-api';

/** Test de phase 0 : vérifie que la chaîne de test Angular + Vitest fonctionne. Remplacé par le lot L5. */
describe('@aster-editor/angular placeholder', () => {
  it('expose la surface publique', () => {
    expect(ASTER_ANGULAR_PLACEHOLDER).toBe(true);
  });
});
