import { selectAll, unwrap } from '../dom-utils';
import type { PastePass } from '../types';

/** Balises sans contenu utile pour l'éditeur, qu'elles viennent du `<head>` ou du corps. */
const DROPPED_TAGS = ['xml', 'style', 'script', 'meta', 'link', 'title', 'head'];

/**
 * Supprime les balises des namespaces Office : `<o:p>`, `<w:sdt>`, `<v:shape>`, `<m:oMath>`…
 * Le parseur HTML les crée comme des éléments au nom préfixé ; on les déballe pour
 * garder le texte (`<o:p>&nbsp;</o:p>` devient un simple insécable, traité plus tard),
 * sauf les blocs `<xml>` et les feuilles de style que l'on jette avec leur contenu.
 */
export const stripOfficeNamespaces: PastePass = (doc) => {
  for (const element of selectAll(doc, DROPPED_TAGS.join(','))) {
    element.parentNode?.removeChild(element);
  }
  const namespaced = Array.from(doc.getElementsByTagName('*')).filter((element) =>
    element.localName.includes(':'),
  );
  // Déballage des plus profonds en premier pour ne pas détacher un parent avant son enfant.
  for (const element of namespaced.reverse()) {
    unwrap(element);
  }
};
