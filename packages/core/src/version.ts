/**
 * Version du monorepo Aster (une seule pour tous les paquets), écrite par
 * `scripts/set-version.mjs` : ne pas la modifier à la main. Sert au support (« quelle
 * version tourne chez le client ? ») : `createAster` la pose en `data-aster-version` sur
 * l'hôte, et l'application peut l'afficher où elle veut.
 */
export const VERSION = '0.9.2';
