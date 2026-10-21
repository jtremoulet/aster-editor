import { TABLE_LOOK_FLAGS, type TableLook, type TableLookFlag } from '../api';

/**
 * Drapeaux `w:tblLook` d'un tableau (`TableLayoutAttrs.look`, session 4, vague 3) :
 * analyse et sérialisation de l'attribut `data-docx-look="firstRow firstColumn noVBand"`.
 * L'éditeur n'interprète pas ces drapeaux : ils relient le tableau au style conditionnel
 * de son gabarit Word, l'export les réécrit en `w:tblLook`. Module de `table-layout.ts`,
 * séparé pour tenir la limite de 400 lignes.
 */

/** Attribut HTML des drapeaux `w:tblLook` d'une table. */
export const TABLE_LOOK_ATTRIBUTE = 'data-docx-look';

/** Vrai pour l'un des six noms d'ECMA-376 §17.4.56, casse exacte. */
export function isTableLookFlag(value: unknown): value is TableLookFlag {
  return typeof value === 'string' && (TABLE_LOOK_FLAGS as readonly string[]).includes(value);
}

/**
 * Lit `data-docx-look` : drapeaux séparés par des blancs, les inconnus (ou d'une autre
 * casse) ignorés, les doublons fusionnés. `null` sans aucun drapeau connu : l'attribut
 * absent, vide ou illisible vaut « pas de `w:tblLook` ».
 */
export function parseTableLook(value: string | null | undefined): TableLook | null {
  if (!value) {
    return null;
  }
  const look: { -readonly [K in TableLookFlag]?: boolean } = {};
  for (const token of value.trim().split(/\s+/)) {
    if (isTableLookFlag(token)) {
      look[token] = true;
    }
  }
  return Object.keys(look).length > 0 ? look : null;
}

/**
 * Sérialise un jeu de drapeaux : ceux à vrai, dans l'ordre de `TABLE_LOOK_FLAGS`, séparés
 * par un espace. `null` pour un jeu vide, absent ou qui n'est pas un objet : l'attribut
 * n'est alors pas émis. `setHTML(getHTML())` redonne exactement la même valeur.
 */
export function tableLookValue(look: unknown): string | null {
  if (look === null || typeof look !== 'object') {
    return null;
  }
  const record = look as Record<string, unknown>;
  const flags = TABLE_LOOK_FLAGS.filter((flag) => record[flag] === true);
  return flags.length > 0 ? flags.join(' ') : null;
}

/** Jeu de drapeaux normalisé : `parseTableLook(tableLookValue(look))`, `null` sans drapeau. */
export function sanitizeTableLook(look: unknown): TableLook | null {
  return parseTableLook(tableLookValue(look));
}
