import { Extension, type Attribute } from '@tiptap/core';

/** Nom de l'extension qui porte les attributs de liste de mise en page. */
export const LIST_LAYOUT_EXTENSION_NAME = 'listLayout';

/** Attribut HTML qui relie une liste à la définition de numérotation du gabarit Word. */
export const DOCX_NUM_ID_ATTRIBUTE = 'data-docx-num-id';
/** Attribut HTML du caractère de puce d'une liste à puces. */
export const BULLET_ATTRIBUTE = 'data-bullet';

/** Attribut texte simple : lu et écrit tel quel, `null` si vide. */
function dataAttribute(name: string, htmlAttribute: string): Attribute {
  return {
    default: null,
    parseHTML: (element) => element.getAttribute(htmlAttribute) || null,
    renderHTML: (attributes) => {
      const value: unknown = attributes[name];
      return typeof value === 'string' && value !== '' ? { [htmlAttribute]: value } : {};
    },
  };
}

/**
 * Extension `ListLayout` : attributs de `ListLayoutAttrs` que Tiptap ne porte pas déjà.
 * `orderedList` a `type` et `start` nativement (`<ol type="a" start="3">`) ; on y ajoute
 * `docxNumId`. `bulletList` reçoit `bullet` (`data-bullet`) et `docxNumId`. Aucun n'est
 * interprété par l'éditeur : ils servent à l'export dans le gabarit Word.
 */
export const ListLayout = Extension.create({
  name: LIST_LAYOUT_EXTENSION_NAME,

  addGlobalAttributes() {
    return [
      {
        types: ['orderedList'],
        attributes: { docxNumId: dataAttribute('docxNumId', DOCX_NUM_ID_ATTRIBUTE) },
      },
      {
        types: ['bulletList'],
        attributes: {
          bullet: dataAttribute('bullet', BULLET_ATTRIBUTE),
          docxNumId: dataAttribute('docxNumId', DOCX_NUM_ID_ATTRIBUTE),
        },
      },
    ];
  },
});
