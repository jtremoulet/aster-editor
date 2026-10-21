import { allNamed, childNamed, textOf, wordAttribute } from '../preprocess/xml-utils.js';
import type { DocxLostKind, DocxLostObject } from '../types.js';
import type { ConverterContext } from './types.js';

/**
 * Détection des objets Word que l'éditeur ne représente pas. Deux points d'entrée, même
 * logique : `detectLost` au niveau bloc (appelé par `index.ts` pour tout enfant du corps
 * qui n'est ni `p`, ni `tbl`, ni `sdt`) et `detectLostInline` au niveau run (à appeler
 * par L24 pour `m:oMath`, `w:object`, `w:commentReference`, `w:ins`, `w:del`,
 * `w:fldSimple` inconnu…). Les dessins (`w:drawing`, `w:pict`, ou leur enveloppe
 * `mc:AlternateContent`) passent d'abord par `ctx.images.drawing`, qui délègue ici quand
 * ils ne contiennent pas d'image.
 *
 * Rien n'est retiré du DOM : on classe, on extrait le texte de remplacement et un détail
 * lisible, l'appelant pousse l'objet dans `ctx.lost` et l'avertissement `object-lost`.
 */

/** Instructions de champ que le lecteur sait rendre (fusion, numéros de page, sommaire, liens). */
const KNOWN_FIELDS: ReadonlySet<string> = new Set([
  'MERGEFIELD',
  'PAGE',
  'NUMPAGES',
  'TOC',
  'HYPERLINK',
]);

/** Formes VML (`v:…`) sans image : formes perdues. */
const VML_SHAPES: ReadonlySet<string> = new Set([
  'shape',
  'rect',
  'oval',
  'roundrect',
  'line',
  'polyline',
  'arc',
  'curve',
  'group',
]);

/** Éléments de révision Word, signalés une seule fois par document. */
const REVISION_ELEMENTS: ReadonlySet<string> = new Set([
  'ins',
  'del',
  'moveFrom',
  'moveTo',
  'moveFromRangeStart',
  'moveToRangeStart',
]);

function hasDescendant(element: Element, localName: string): boolean {
  return element.getElementsByTagNameNS('*', localName).length > 0;
}

/**
 * Contenu retenu d'un `mc:AlternateContent` (forme que Word 2010+ écrit pour toute zone
 * de texte ou forme `wps`) : premier élément du `mc:Choice`, sinon du `mc:Fallback`.
 * `null` si l'élément n'est pas un `AlternateContent` ou s'il est vide.
 */
export function alternateContentChoice(element: Element): Element | null {
  if (element.localName !== 'AlternateContent') return null;
  return (
    childNamed(element, 'Choice')?.firstElementChild ??
    childNamed(element, 'Fallback')?.firstElementChild ??
    null
  );
}

/** Vrai si le dessin porte une image : `pic:pic` (DrawingML) ou `v:imagedata` (VML). */
export function hasPicture(element: Element): boolean {
  return hasDescendant(element, 'pic') || hasDescendant(element, 'imagedata');
}

/** Texte des paragraphes d'une zone de texte (`w:txbxContent`), un paragraphe par ligne. */
function textboxText(element: Element): string | undefined {
  const lines: string[] = [];
  for (const content of allNamed(element, 'txbxContent')) {
    for (const paragraph of allNamed(content, 'p')) {
      const text = textOf(paragraph).trim();
      if (text) lines.push(text);
    }
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}

/** Nom lisible d'un dessin : `wp:docPr name`, sinon identifiant VML. */
function drawingName(element: Element): string | undefined {
  const docPr = allNamed(element, 'docPr')[0];
  const name = docPr?.getAttribute('name');
  if (name) return name;
  for (const shape of Array.from(element.getElementsByTagNameNS('*', '*'))) {
    if (VML_SHAPES.has(shape.localName)) {
      const id = shape.getAttribute('id');
      if (id) return id;
    }
  }
  return undefined;
}

/** Mot-clé d'une instruction de champ (`DATE \@ "dd/MM/yyyy"` → `DATE`). */
function fieldKeyword(instruction: string): string {
  return (instruction.trim().split(/\s+/)[0] ?? '').toUpperCase();
}

function lost(
  ctx: ConverterContext,
  kind: DocxLostKind,
  detail?: string,
  text?: string,
): DocxLostObject {
  const object: { -readonly [K in keyof DocxLostObject]: DocxLostObject[K] } = {
    kind,
    where: ctx.where,
  };
  if (text) object.text = text;
  if (detail) object.detail = detail;
  return object;
}

/** Vrai si un objet de même nature et même détail est déjà signalé (commentaire, révision). */
function alreadyLost(ctx: ConverterContext, kind: DocxLostKind, detail?: string): boolean {
  return ctx.lost.some(
    (entry) => entry.kind === kind && (detail === undefined || entry.detail === detail),
  );
}

/**
 * Zone de texte contenue dans un dessin (`w:txbxContent`), avec son texte, que le dessin
 * porte ou non une image par ailleurs. `null` sans zone de texte. Sert à `images.ts` pour
 * signaler la zone d'un dessin dont l'image est rendue.
 */
export function textboxLost(element: Element, ctx: ConverterContext): DocxLostObject | null {
  if (!hasDescendant(element, 'txbxContent')) return null;
  return lost(ctx, 'textbox', drawingName(element) ?? 'zone de texte', textboxText(element));
}

/** Dessin DrawingML ou VML sans image : zone de texte, SmartArt, graphique, forme. */
function classifyDrawing(element: Element, ctx: ConverterContext): DocxLostObject | null {
  // Une image (`pic:pic`, `v:imagedata`) est du ressort d'`images.ts`, pas une perte. Un
  // `a:blip` seul (fond d'une forme, d'une zone de texte) n'en fait pas une image.
  if (hasPicture(element)) return null;
  const textbox = textboxLost(element, ctx);
  if (textbox) return textbox;
  const name = drawingName(element);
  if (hasDescendant(element, 'relIds') || hasDescendant(element, 'dataModel')) {
    return lost(ctx, 'smartart', name ?? 'SmartArt');
  }
  if (hasDescendant(element, 'chart')) return lost(ctx, 'chart', name ?? 'graphique');
  const isShape =
    hasDescendant(element, 'wsp') ||
    hasDescendant(element, 'wgp') ||
    Array.from(element.getElementsByTagNameNS('*', '*')).some((node) =>
      VML_SHAPES.has(node.localName),
    );
  if (isShape) return lost(ctx, 'shape', name ?? 'forme');
  return lost(ctx, 'unknown', name ?? element.localName);
}

/**
 * Classe un élément non représentable. `null` quand l'élément est en fait pris en charge
 * ailleurs (image, champ connu, fin de plage de commentaire) ou déjà signalé.
 */
function classify(element: Element, ctx: ConverterContext): DocxLostObject | null {
  const name = element.localName;
  switch (name) {
    case 'drawing':
    case 'pict':
      return classifyDrawing(element, ctx);
    case 'AlternateContent': {
      // Word 2010+ enveloppe zones de texte et formes : on classe le contenu retenu.
      const chosen = alternateContentChoice(element);
      return chosen ? classify(chosen, ctx) : lost(ctx, 'unknown', 'AlternateContent');
    }
    case 'txbxContent':
      return lost(ctx, 'textbox', 'zone de texte', textboxText(element.parentElement ?? element));
    case 'oMath':
    case 'oMathPara': {
      const text = textOf(element).trim();
      return lost(ctx, 'equation', 'équation', text || undefined);
    }
    case 'commentRangeStart':
    case 'commentReference': {
      const detail = `commentaire ${wordAttribute(element, 'id') || '?'}`;
      return alreadyLost(ctx, 'comment', detail) ? null : lost(ctx, 'comment', detail);
    }
    case 'commentRangeEnd':
      return null;
    case 'object': {
      const ole = allNamed(element, 'OLEObject')[0];
      const progId = ole?.getAttribute('ProgID');
      return lost(ctx, 'embedded-object', progId ? `objet ${progId}` : 'objet incorporé');
    }
    case 'fldSimple': {
      const keyword = fieldKeyword(wordAttribute(element, 'instr'));
      if (KNOWN_FIELDS.has(keyword)) return null;
      const text = textOf(element).trim();
      return lost(ctx, 'field', `champ ${keyword || '?'}`, text || undefined);
    }
    case 'instrText': {
      const keyword = fieldKeyword(element.textContent ?? '');
      return KNOWN_FIELDS.has(keyword) ? null : lost(ctx, 'field', `champ ${keyword || '?'}`);
    }
    case 'altChunk':
      return lost(ctx, 'unknown', 'contenu externe (altChunk)');
    default: {
      if (REVISION_ELEMENTS.has(name)) {
        return alreadyLost(ctx, 'revision')
          ? null
          : lost(ctx, 'revision', 'révisions (w:ins / w:del) non suivies');
      }
      const text = textOf(element).trim();
      return lost(ctx, 'unknown', name, text || undefined);
    }
  }
}

/**
 * Objet non représentable au niveau bloc (enfant direct de `w:body`, `w:tc`,
 * `w:sdtContent`…). `null` si l'élément est pris en charge ou déjà signalé ; l'appelant
 * pousse le résultat dans `ctx.lost` et ajoute l'avertissement `object-lost`.
 */
export function detectLost(element: Element, ctx: ConverterContext): DocxLostObject | null {
  return classify(element, ctx);
}

/**
 * Même détection au niveau run, pour L24 : `m:oMath`, `w:object`, `w:commentReference`,
 * `w:ins` / `w:del` (une fois par document), `w:fldSimple` / `w:instrText` d'un champ
 * inconnu (`DATE`, `IF`…). Pour `w:drawing` et `w:pict`, passer par `ctx.images.drawing`
 * qui appelle cette fonction quand le dessin n'est pas une image.
 */
export function detectLostInline(element: Element, ctx: ConverterContext): DocxLostObject | null {
  return classify(element, ctx);
}
