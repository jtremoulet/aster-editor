/**
 * Assainissement du HTML des en-têtes et pieds de la vue page (session 3, L26 ; extrait de
 * `page-view.ts` en F30, R30-13, API inchangée : `page-view.ts` réexporte tout). Le core
 * n'avait pas de sanitiseur : celui-ci est volontairement minimal, allowlist stricte de
 * balises et d'attributs, URL et `style` filtrés, profondeur plafonnée.
 */

/** Balises conservées par l'assainissement des en-têtes et pieds. */
const ALLOWED_TAGS: ReadonlySet<string> = new Set([
  'p',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'div',
  'span',
  'strong',
  'b',
  'em',
  'i',
  'u',
  's',
  'sub',
  'sup',
  'code',
  'br',
  'a',
  'img',
  'ul',
  'ol',
  'li',
  'table',
  'thead',
  'tbody',
  'tr',
  'td',
  'th',
  'hr',
]);

/** Balises supprimées avec leur contenu (tout le reste est « déballé »). */
const DROPPED_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'template',
  'noscript',
  'svg',
  'math',
  'form',
  'input',
  'button',
  'textarea',
  'select',
  'link',
  'meta',
  'base',
]);

/** Attributs conservés (plus tout `data-*`). */
const ALLOWED_ATTRIBUTES: ReadonlySet<string> = new Set([
  'style',
  'class',
  'href',
  'src',
  'alt',
  'title',
  'width',
  'height',
  'colspan',
  'rowspan',
  'type',
  'start',
  'target',
  'rel',
]);

/** Schémas d'URL acceptés dans `href` / `src` (plus `data:image/` pour `src` seulement). */
const ALLOWED_URL_SCHEMES: ReadonlySet<string> = new Set(['http', 'https', 'mailto', 'tel']);

/** Caractères de contrôle et blancs ASCII (U+0000 à U+0020), ignorés par les parseurs d'URL. */
// eslint-disable-next-line no-control-regex -- c'est précisément la plage à retirer.
const URL_NOISE_PATTERN = /[\u0000- ]/g;

/**
 * Vrai si une URL d'attribut `href`/`src` est acceptable : ancre, chemin relatif, ou schéma
 * de l'allowlist. Les parseurs d'URL ignorent les caractères de contrôle et les blancs
 * ASCII (`java\tscript:` est lu `javascript:`), pas une regex : ils sont retirés **avant**
 * le test, comme le fait DOMPurify (R23-01). Un `\` vaut `/` pour les schémas spéciaux
 * (`\\evil` → `//evil`) et les URL relatives au protocole (`//evil`) sont refusées.
 */
function isSafeUrl(name: string, value: string): boolean {
  const stripped = value.replace(URL_NOISE_PATTERN, '').replace(/\\/g, '/').toLowerCase();
  if (stripped === '' || stripped.startsWith('#')) {
    return true;
  }
  if (stripped.startsWith('//')) {
    return false;
  }
  if (stripped.startsWith('/')) {
    return true;
  }
  const scheme = /^([a-z][a-z0-9+.-]*):/.exec(stripped)?.[1];
  if (scheme === undefined) {
    return true;
  }
  if (ALLOWED_URL_SCHEMES.has(scheme)) {
    return true;
  }
  return name === 'src' && stripped.startsWith('data:image/');
}

/**
 * Vrai si une valeur de `style` ne charge ni n'exécute rien. Le CSS décode les échappements
 * (`\75rl(` est lu `url(`, CSS Syntax L3 §4.3.7) et ignore les commentaires : tout `\` est
 * refusé (Word n'en produit jamais) et les commentaires sont retirés avant de chercher les
 * fonctions qui chargent une ressource (`url(`, `image-set(`, `image(`, `src(`, `element(`)
 * ou exécutent du code (`expression(`, `-moz-binding`, `behavior`) (R23-08).
 */
function isSafeStyle(value: string): boolean {
  if (value.includes('\\')) {
    return false;
  }
  const stripped = value.replace(/\/\*[\s\S]*?\*\//g, '');
  return !/(?:url|image-set|image|src|element|expression)\s*\(|javascript:|-moz-binding|behavior\s*:/i.test(
    stripped,
  );
}

/** Filtre les attributs d'un élément en place : allowlist, jamais `on*`, URL et style sûrs. */
function sanitizeAttributes(element: Element): void {
  for (const attribute of [...element.attributes]) {
    const name = attribute.name.toLowerCase();
    const allowed =
      (ALLOWED_ATTRIBUTES.has(name) || name.startsWith('data-')) &&
      !name.startsWith('on') &&
      (name !== 'href' && name !== 'src' ? true : isSafeUrl(name, attribute.value)) &&
      (name !== 'style' || isSafeStyle(attribute.value));
    if (!allowed) {
      element.removeAttribute(attribute.name);
    }
  }
}

/**
 * Profondeur d'imbrication conservée par l'assainissement. Au-delà, un élément est réduit
 * à son texte : un fragment de 8 000 `<div>` imbriqués, possible depuis un `.docx`
 * hostile, ne produit plus qu'un arbre borné.
 */
export const MAX_SANITIZE_DEPTH = 64;

/** Sélecteur des balises supprimées avec leur contenu. */
const DROPPED_SELECTOR = [...DROPPED_TAGS].join(',');

/** Un parent à parcourir et la profondeur de ses enfants directs. */
interface SanitizeFrame {
  readonly parent: Node;
  readonly depth: number;
}

/**
 * Remplace un élément trop profond par son seul texte, balises interdites retirées
 * d'abord (leur contenu ne doit pas réapparaître en texte). Une seule passe sur le
 * sous-arbre, quelle que soit sa taille : le déballer niveau par niveau déplacerait le
 * sous-arbre à chaque niveau, ce qui est quadratique dans le DOM.
 */
function flattenToText(element: Element): void {
  for (const dropped of element.querySelectorAll(DROPPED_SELECTOR)) {
    dropped.remove();
  }
  const text = element.textContent;
  if (text === '') {
    element.remove();
  } else {
    element.replaceWith(document.createTextNode(text));
  }
}

/**
 * Parcourt les enfants d'un parent : commentaire et balise interdite supprimés, élément
 * trop profond réduit à son texte, balise inconnue déballée (ses enfants remontent et sont
 * examinés à leur tour), balise connue assainie puis empilée. Pile explicite plutôt que
 * récursion : la version récursive faisait déborder la pile d'appels sur un HTML
 * profondément imbriqué (R23-03). Le déballage ne se produit qu'au-dessus du plafond, le
 * coût total reste borné par `MAX_SANITIZE_DEPTH` fois la taille du fragment.
 */
function sanitizeTree(root: Node): void {
  const stack: SanitizeFrame[] = [{ parent: root, depth: 0 }];
  for (let frame = stack.pop(); frame !== undefined; frame = stack.pop()) {
    const { parent, depth } = frame;
    let child = parent.firstChild;
    while (child !== null) {
      const following = child.nextSibling;
      if (child.nodeType === Node.COMMENT_NODE) {
        child.remove();
        child = following;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        child = following;
        continue;
      }
      const element = child as Element;
      const tag = element.tagName.toLowerCase();
      if (DROPPED_TAGS.has(tag)) {
        element.remove();
        child = following;
        continue;
      }
      if (depth >= MAX_SANITIZE_DEPTH) {
        flattenToText(element);
        child = following;
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        // Déballé en place : ses enfants prennent sa position et sont examinés ensuite.
        const first = element.firstChild;
        element.replaceWith(...element.childNodes);
        child = first ?? following;
        continue;
      }
      sanitizeAttributes(element);
      stack.push({ parent: element, depth: depth + 1 });
      child = following;
    }
  }
}

/**
 * Assainit un fragment HTML d'en-tête ou de pied avant de l'injecter en `innerHTML` :
 * texte et balises inline/bloc simples uniquement (`p`, titres, `span`, marques, listes,
 * tables, `img`, `a`), attributs `style`, `class`, `data-*`, `href`/`src` sûrs. Jamais de
 * `<script>`, `<style>`, `<iframe>`, ni d'attribut `on*`. Les balises inconnues sont
 * déballées, leur texte conservé, et l'imbrication est plafonnée à `MAX_SANITIZE_DEPTH`.
 * Le core n'avait pas de sanitiseur : celui-ci est volontairement minimal, allowlist stricte.
 */
export function sanitizeHeaderFooterHtml(html: string): string {
  const template = document.createElement('template');
  template.innerHTML = html;
  sanitizeTree(template.content);
  return template.innerHTML;
}
