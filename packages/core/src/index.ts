/**
 * @aster-editor/core — point d'entrée public.
 *
 * Phase 0 : seuls les types du contrat et un stub `createEditor` sont exposés.
 * Le lot L1 remplace le stub par l'implémentation dans `editor/`.
 */
export * from './api';
export { createEditor } from './editor/create-editor';
export { fr } from './i18n/fr';
export { en } from './i18n/en';
