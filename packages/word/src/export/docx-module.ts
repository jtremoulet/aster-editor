import type * as DocxNamespace from 'docx';

/**
 * Espace de noms de la lib `docx`, tel que résolu par l'import dynamique. Tout le
 * convertisseur reçoit ce module en paramètre plutôt que de l'importer statiquement :
 * la lib pèse lourd et ne doit entrer dans le bundle que si `exportDocx` est appelé.
 * L'import ci-dessus est de type uniquement, il ne produit aucun code.
 */
export type DocxModule = typeof DocxNamespace;

/**
 * Charge `docx` à la demande. Le paquet est ESM natif (`index.mjs`), mais certains
 * bundlers enveloppent un CJS dans `default` : on replie dessus si l'espace de noms
 * n'expose pas `Document`.
 */
export async function loadDocx(): Promise<DocxModule> {
  const mod: DocxModule & { default?: DocxModule } = await import('docx');
  return typeof mod.Document === 'function' ? mod : (mod.default ?? mod);
}
