import type { DocxPackage, NoteRegistry, ReaderOptions } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Les appels de note sont rendus en
 * exposant sans note associée, et aucune liste finale n'est produite.
 */
export async function createNoteRegistry(
  _pkg: DocxPackage,
  _options: ReaderOptions,
): Promise<NoteRegistry> {
  return {
    reference(id) {
      return `<sup data-footnote-ref="${id}">${id}</sup>`;
    },
    async render() {
      return '';
    },
  };
}
