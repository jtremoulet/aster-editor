import type { Mark } from '@tiptap/core';
import { Link } from '@tiptap/extension-link';
import type { LinkPolicy } from '../api';

/** Politique de liens entièrement renseignée, dérivée de `LinkPolicy` et des défauts. */
export interface ResolvedLinkPolicy {
  readonly allowedProtocols: readonly string[];
  readonly defaultTarget: '_blank' | '_self';
  readonly rel: string;
  readonly autolink: boolean;
}

/**
 * Défauts : seuls les protocoles web usuels passent. `javascript:` et `data:` sont
 * rejetés par construction puisque absents de la liste, pas par une liste noire
 * qu'on oublierait de compléter.
 */
export const DEFAULT_LINK_POLICY: ResolvedLinkPolicy = {
  allowedProtocols: ['http', 'https', 'mailto', 'tel'],
  defaultTarget: '_blank',
  rel: 'noopener noreferrer',
  autolink: true,
};

/** Fusionne la politique de l'intégrateur avec les défauts. */
export function resolveLinkPolicy(policy?: LinkPolicy): ResolvedLinkPolicy {
  return {
    allowedProtocols: policy?.allowedProtocols ?? DEFAULT_LINK_POLICY.allowedProtocols,
    defaultTarget: policy?.defaultTarget ?? DEFAULT_LINK_POLICY.defaultTarget,
    rel: policy?.rel ?? DEFAULT_LINK_POLICY.rel,
    autolink: policy?.autolink ?? DEFAULT_LINK_POLICY.autolink,
  };
}

/**
 * Caractères de contrôle, espaces et invisibles que les navigateurs ignorent dans
 * une URL : une tabulation ou un retour à la ligne glissés dans le mot javascript
 * doivent quand même aboutir au schéma javascript. S'y ajoutent les invisibles
 * Unicode sans largeur (trait d'union conditionnel, gluon de mots, séparateur de
 * voyelles mongol, sélecteurs invisibles). La classe contient donc des caractères
 * de contrôle par construction, d'où l'exemption ESLint ci-dessous. Elle est
 * construite depuis une chaîne ASCII pure : un séparateur de ligne Unicode écrit
 * en dur dans un littéral regex casse le fichier à la réécriture.
 */
const URL_NOISE = new RegExp(
  // eslint-disable-next-line no-control-regex -- plage de contrôle intentionnelle, voir ci-dessus
  '[\\u0000-\\u0020\\u007f-\\u009f\\u00ad\\u180e\\u200b-\\u200d\\u2028\\u2029\\u2060-\\u2064\\ufeff]',
  'g',
);
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
/** Entités HTML qu'un attaquant glisse dans un schéma : numériques et `&colon;`. */
const NUMERIC_ENTITY = /&#(x[0-9a-f]+|\d+);?/gi;
const COLON_ENTITY = /&colon;/gi;

/**
 * Décode les entités numériques et `&colon;` d'une URL. Le DOM les a déjà décodées
 * au parsing d'un attribut `href`, mais une URL passée en argument à `link.set`,
 * elle, arrive brute : `java&#115;cript:` doit aboutir au schéma javascript.
 */
function decodeEntities(value: string): string {
  return value
    .replace(NUMERIC_ENTITY, (whole, code: string) => {
      const hex = code.startsWith('x') || code.startsWith('X');
      const point = hex ? Number.parseInt(code.slice(1), 16) : Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : whole;
    })
    .replace(COLON_ENTITY, ':');
}

/**
 * Extrait le schéma d'une URL, en minuscules, ou `null` si l'URL est relative.
 * Une URL sans deux-points, ou dont le premier segment n'est pas un schéma valide
 * (`foo/bar:baz`), est relative. Les entités sont décodées d'abord ; s'il reste
 * un `&` dans le segment de schéma (`java&amp;script:`), ce segment est rendu tel
 * quel : il ne peut pas figurer dans une liste blanche, donc l'URL est rejetée.
 */
export function extractScheme(href: string): string | null {
  const cleaned = decodeEntities(href).replace(URL_NOISE, '');
  const match = SCHEME_PATTERN.exec(cleaned);
  if (match?.[1]) {
    return match[1].toLowerCase();
  }
  const colon = cleaned.indexOf(':');
  if (colon < 0) {
    return null;
  }
  const candidate = cleaned.slice(0, colon);
  // Un `/`, `?` ou `#` avant le deux-points : URL relative avec requête ou ancre. Le `#`
  // d'une entité non décodée (`&#…;`) ne compte pas, c'est justement ce qu'on traque.
  const relative = /[/?]|(?<!&)#/.test(candidate);
  return relative || !candidate.includes('&') ? null : candidate.toLowerCase();
}

/**
 * Vrai si l'URL est acceptable selon la politique : relative, ou avec un schéma de
 * la liste blanche. Utilisé par `link.set`, par le parsing HTML et par l'autolink.
 */
export function isAllowedHref(href: string, policy: ResolvedLinkPolicy): boolean {
  const scheme = extractScheme(href);
  if (scheme === null) {
    return true;
  }
  return policy.allowedProtocols.some((protocol) => protocol.toLowerCase() === scheme);
}

/** Une data URL d'image : seul type MIME `data:` toléré dans un `<img>`. */
const DATA_IMAGE_PATTERN = /^data:image\//i;

/**
 * Vrai si une source d'image est acceptable : mêmes règles que les liens, plus
 * `blob:` (aperçu local) et `data:image/…` (repli d'upload). Une `data:text/html`
 * ou tout autre type MIME est rejeté comme le serait `javascript:`.
 */
export function isAllowedImageSrc(src: string, policy: ResolvedLinkPolicy): boolean {
  const scheme = extractScheme(src);
  if (scheme === 'blob') {
    return true;
  }
  if (scheme === 'data') {
    return DATA_IMAGE_PATTERN.test(decodeEntities(src).replace(URL_NOISE, ''));
  }
  return isAllowedHref(src, policy);
}

/**
 * Extension Link configurée avec la politique Aster.
 *
 * - `isAllowedUri` branche la politique sur le parsing (HTML collé ou `setHTML`),
 *   le rendu, les commandes et l'autolink de Tiptap : un `<a href="javascript:…">`
 *   est dégradé en texte simple.
 * - L'attribut `rel` est forcé à la valeur de la politique dès que `target="_blank"`,
 *   sans quoi un lien collé garderait une cible ouvrable sans `noopener`.
 * - `openOnClick: false` : dans un éditeur, cliquer un lien sert à le modifier.
 */
export function createLinkExtension(policy: ResolvedLinkPolicy): Mark {
  return Link.extend({
    addAttributes() {
      return {
        ...this.parent?.(),
        rel: {
          default: null,
          parseHTML: (element: HTMLElement) => element.getAttribute('rel'),
          renderHTML: (attributes: Record<string, unknown>) => {
            if (attributes.target === '_blank') {
              return { rel: policy.rel };
            }
            return typeof attributes.rel === 'string' && attributes.rel !== ''
              ? { rel: attributes.rel }
              : {};
          },
        },
      };
    },
  }).configure({
    openOnClick: false,
    autolink: policy.autolink,
    linkOnPaste: true,
    protocols: [...policy.allowedProtocols],
    // Tiptap fusionne `configure` en profondeur avec ses défauts : `{}` laisserait
    // `target: '_blank'` et un `rel` à tous les liens, parsés compris. On annule
    // explicitement, la cible vient de `link.set` et le `rel` de notre attribut.
    HTMLAttributes: { target: null, rel: null },
    isAllowedUri: (url) => isAllowedHref(url, policy),
    shouldAutoLink: () => policy.autolink,
  });
}
