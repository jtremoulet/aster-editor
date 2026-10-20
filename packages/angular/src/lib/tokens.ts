import { InjectionToken } from '@angular/core';
import type { UploadHandler } from '@aster-editor/core';

/**
 * Hook d'upload d'image fourni par l'application (service HTTP, stockage, CDN…).
 * Optionnel : s'il est présent et qu'aucun `upload` n'est passé par `provideAster`
 * ni par l'input `config`, le composant le branche sur `AsterOptions.upload`.
 * Sans handler, les images sont insérées en data URL base64.
 */
export const ASTER_UPLOAD_HANDLER = new InjectionToken<UploadHandler>('ASTER_UPLOAD_HANDLER');
