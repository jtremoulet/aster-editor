import { selectAll, unwrap } from '../dom-utils.js';
import type { PastePass } from '../types.js';

/**
 * Balises sans contenu utile pour l'éditeur, qu'elles viennent du `<head>` ou du corps,
 * jetées avec leur contenu. Les secondes sont des vecteurs d'exécution ou d'inclusion
 * (`<template>` cache un sous-arbre que les passes DOM ne voient pas, `<iframe>`,
 * `<object>`, `<embed>`, `<form>`, `<svg>` et `<math>` acceptent des gestionnaires et
 * des URL actives) : aucun collage Word ou Google Docs légitime n'en contient (W-10).
 */
const DROPPED_TAGS = [
  'xml',
  'style',
  'script',
  'meta',
  'link',
  'title',
  'head',
  'template',
  'iframe',
  'object',
  'embed',
  'form',
  'noscript',
  'frame',
  'frameset',
  'svg',
  'math',
];

/**
 * Supprime les balises des namespaces Office : `<o:p>`, `<w:sdt>`, `<v:shape>`, `<m:oMath>`…
 * Le parseur HTML les crée comme des éléments au nom préfixé ; on les déballe pour
 * garder le texte (`<o:p>&nbsp;</o:p>` devient un simple insécable, traité plus tard),
 * sauf les blocs `<xml>`, les feuilles de style et les balises actives que l'on jette
 * avec leur contenu.
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
