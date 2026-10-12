import type { PastePass } from '../types';

/** Commentaires conditionnels standards : `<!--[if gte mso 9]>…<![endif]-->`. */
const DOWNLEVEL_HIDDEN = /<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi;

/**
 * Marqueurs « downlevel-revealed » : `<![if !supportLists]>` et `<![endif]>`. Ce ne sont
 * pas des commentaires HTML valides, les parseurs les transforment en commentaires
 * bogus ; on les retire au niveau texte pour ne pas en dépendre.
 */
const DOWNLEVEL_REVEALED = /<!\[(?:if[^\]]*|endif)\]>/gi;

/**
 * Nettoyage texte des commentaires conditionnels, à appliquer AVANT le parsing.
 * Word y cache du XML de réglages et des balises VML : leur contenu n'a aucune valeur
 * pour l'éditeur, on le jette intégralement. Les marqueurs « revealed » n'enveloppent
 * que du contenu utile (puces, sauts de ligne), on ne garde que le contenu.
 */
export function stripConditionalCommentsText(html: string): string {
  return html.replace(DOWNLEVEL_HIDDEN, '').replace(DOWNLEVEL_REVEALED, '');
}

/**
 * Passe DOM : supprime tous les nœuds commentaire restants, dont les `StartFragment` /
 * `EndFragment` et les éventuels commentaires conditionnels que le parseur aurait
 * reconstruits. Après cette passe, il n'y a plus aucun commentaire dans le document.
 */
export const stripConditionalComments: PastePass = (doc) => {
  const walker = doc.createTreeWalker(doc, 128 /* NodeFilter.SHOW_COMMENT */);
  const comments: Node[] = [];
  let current = walker.nextNode();
  while (current) {
    comments.push(current);
    current = walker.nextNode();
  }
  for (const comment of comments) {
    comment.parentNode?.removeChild(comment);
  }
};
