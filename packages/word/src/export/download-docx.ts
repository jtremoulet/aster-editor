/** Extension ajoutée si le nom fourni n'en a pas. */
const DOCX_EXTENSION = '.docx';

/** Nom de fichier sûr : caractères interdits remplacés, `.docx` garanti, `document.docx` par défaut. */
export function normalizeDocxFilename(filename: string | undefined): string {
  const base = (filename ?? '')
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\.docx$/i, '');
  return `${base === '' ? 'document' : base}${DOCX_EXTENSION}`;
}

/**
 * Déclenche le téléchargement d'un `Blob` .docx dans le navigateur via un lien
 * `<a download>` éphémère. À appeler depuis un gestionnaire d'événement utilisateur
 * (clic) pour ne pas être bloqué par le navigateur. Hors navigateur, lève une erreur
 * explicite plutôt que d'échouer silencieusement.
 */
export function downloadDocx(blob: Blob, filename?: string): void {
  if (
    typeof document === 'undefined' ||
    typeof URL === 'undefined' ||
    typeof URL.createObjectURL !== 'function'
  ) {
    throw new Error('downloadDocx: nécessite un navigateur (document et URL.createObjectURL)');
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = normalizeDocxFilename(filename);
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    // Révocation différée : certains navigateurs lisent l'URL après le retour de `click()`.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
