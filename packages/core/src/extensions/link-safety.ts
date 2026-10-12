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
 * doivent quand même aboutir au schéma javascript. La classe contient donc des
 * caractères de contrôle par construction, d'où l'exemption ESLint ci-dessous.
 * Elle est construite depuis une chaîne ASCII pure : un séparateur de ligne
 * Unicode écrit en dur dans un littéral regex casse le fichier à la réécriture.
 */
const URL_NOISE = new RegExp(
  // eslint-disable-next-line no-control-regex -- plage de contrôle intentionnelle, voir ci-dessus
  '[\\u0000-\\u0020\\u007f-\\u009f\\u200b-\\u200d\\u2028\\u2029\\ufeff]',
  'g',
);
const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;

/**
 * Extrait le schéma d'une URL, en minuscules, ou `null` si l'URL est relative.
 * Une URL sans deux-points, ou dont le premier segment n'est pas un schéma valide
 * (`foo/bar:baz`), est relative.
 */
export function extractScheme(href: string): string | null {
  const match = SCHEME_PATTERN.exec(href.replace(URL_NOISE, ''));
  return match?.[1] ? match[1].toLowerCase() : null;
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

/**
 * Vrai si une source d'image est acceptable : mêmes règles que les liens, mais
 * `data:` et `blob:` sont tolérés puisque c'est le repli d'upload et l'aperçu local.
 */
export function isAllowedImageSrc(src: string, policy: ResolvedLinkPolicy): boolean {
  const scheme = extractScheme(src);
  if (scheme === 'data' || scheme === 'blob') {
    return true;
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
