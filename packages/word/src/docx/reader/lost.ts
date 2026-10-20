import type { DocxLostObject } from '../types';
import type { ConverterContext } from './types';

/**
 * ⚠️ Stub de phase 0, remplacé par le lot L25. Ne détecte rien. L25 reconnaît dans le
 * corps les zones de texte (`w:txbxContent`, `wps:txbx`), formes (`wps:wsp`, `v:shape`),
 * SmartArt (`dgm:`), graphiques (`c:chart`), équations (`m:oMath`), commentaires
 * (`w:commentRangeStart`), révisions (`w:ins`, `w:del` : texte inséré conservé, texte
 * supprimé retiré), champs autres que fusion/PAGE/NUMPAGES/TOC, objets incorporés
 * (`w:object`), et pose un `DocxLostObject` plus un avertissement `object-lost`.
 */
export function detectLost(_element: Element, _ctx: ConverterContext): DocxLostObject | null {
  return null;
}
