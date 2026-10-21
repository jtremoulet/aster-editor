import { wordAttribute } from '../preprocess/xml-utils.js';
import type { ConverterContext } from './types.js';

/**
 * Liens du lecteur : cible d'une instruction `HYPERLINK`, `href` sûr, relation d'un
 * `w:hyperlink`. Module de `runs.ts` (ré-exporté par lui) : découpage L45, aucune
 * logique modifiée.
 */

/** Jeton d'instruction de champ : chaîne entre guillemets ou mot. */
const FIELD_TOKEN = /"([^"]*)"|(\S+)/g;

/** Commutateurs de `HYPERLINK` qui prennent un argument, hors `\l` (traité à part). */
const HYPERLINK_SWITCHES_WITH_ARGUMENT: ReadonlySet<string> = new Set(['o', 't']);

/**
 * Cible d'une instruction `HYPERLINK` : la première chaîne (citée ou non) qui n'est pas
 * l'argument d'un commutateur est l'URL ; `\l "x"` ajoute le fragment `#x` (seul, c'est
 * un signet interne `#x`). `HYPERLINK "https://x.io/p" \l "sec2"` → `https://x.io/p#sec2`.
 * `null` pour un autre champ ou une instruction sans cible.
 */
export function hyperlinkTarget(instr: string): string | null {
  const tokens: { readonly value: string; readonly quoted: boolean }[] = [];
  for (const match of instr.matchAll(FIELD_TOKEN)) {
    tokens.push({ value: match[1] ?? match[2] ?? '', quoted: match[1] !== undefined });
  }
  const keyword = tokens[0];
  if (!keyword || keyword.quoted || keyword.value.toUpperCase() !== 'HYPERLINK') return null;
  let target: string | undefined;
  let fragment: string | undefined;
  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (!token.quoted && token.value.startsWith('\\')) {
      const name = token.value.slice(1).toLowerCase();
      if (name === 'l') {
        fragment = tokens[index + 1]?.value;
        index += 1;
      } else if (HYPERLINK_SWITCHES_WITH_ARGUMENT.has(name)) {
        index += 1;
      }
      continue;
    }
    target ??= token.value;
  }
  if (fragment) return `${target ?? ''}#${fragment}`;
  return target || null;
}

/** Protocoles autorisés dans un `href` produit par le lecteur. */
const SAFE_PROTOCOLS: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

/**
 * `href` sûr hors de l'éditeur : `http`, `https`, `mailto`, `tel`, les ancres `#…` et les
 * URL relatives passent ; tout autre protocole (`javascript:`, `data:`, `vbscript:`…)
 * retire le lien, le texte est conservé. Le protocole est lu après suppression des
 * caractères de contrôle et espaces, comme un navigateur le ferait (`java\tscript:`).
 */
export function safeHref(href: string | null): string | null {
  if (href === null) return null;
  const trimmed = href.trim();
  if (trimmed === '') return null;
  // eslint-disable-next-line no-control-regex -- les contrôles C0 sont précisément la cible.
  const probe = trimmed.replace(/[\u0000- \u007f]/g, '').toLowerCase();
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(probe);
  if (scheme && !SAFE_PROTOCOLS.has(scheme[1] ?? '')) return null;
  return trimmed;
}

/** Attribut par nom local quel que soit son préfixe (`r:id`, `w:anchor`). */
function attrByLocalName(element: Element, localName: string): string {
  for (const attr of Array.from(element.attributes)) {
    if (attr.localName === localName) return attr.value;
  }
  return '';
}

/** Cible d'un `w:hyperlink` : relation externe `r:id`, sinon ancre `w:anchor`, sinon `null`. */
export async function hyperlinkHref(
  hyperlink: Element,
  ctx: ConverterContext,
): Promise<string | null> {
  const id = attrByLocalName(hyperlink, 'id');
  if (id) {
    const rel = (await ctx.pkg.rels(ctx.part)).get(id);
    if (rel?.external) return rel.target;
  }
  const anchor = wordAttribute(hyperlink, 'anchor');
  return anchor ? `#${anchor}` : null;
}
