import {
  DOMSerializer,
  type DOMOutputSpec,
  type Mark,
  type Node as ProseMirrorNode,
  type Schema,
} from '@tiptap/pm/model';

/**
 * Sérialisation HTML d'un document avec les attributs `style` **tels que les extensions
 * les émettent**.
 *
 * Le `DOMSerializer` de ProseMirror pose `style` via `element.style.cssText`, et le moteur
 * CSS (navigateur ou jsdom) réécrit alors la valeur : couleurs en `rgb()`, `;` final,
 * longhands repliés en raccourcis (`margin: 6pt 6pt 36pt 0pt`, dans un ordre faux sous
 * jsdom). Le contrat de mise en page (`api/layout.ts`) fige une sérialisation exacte
 * (`#rrggbb`, ordre des déclarations) que le paquet `word` relit : on rend donc les
 * `DOMOutputSpec` nous-mêmes, avec `setAttribute('style', …)` verbatim. Tout le reste
 * (structure, trous de contenu, marques) suit la sémantique de `renderSpec`.
 */

interface Rendered {
  readonly dom: globalThis.Node;
  readonly contentDOM?: HTMLElement;
}

/** Vrai si la valeur est un nœud DOM (élément ou texte). */
function isDomNode(value: unknown): value is globalThis.Node {
  return typeof value === 'object' && value !== null && 'nodeType' in value;
}

/** Vrai si la valeur est un spec `{ dom, contentDOM? }` déjà rendu. */
function isRenderedSpec(value: unknown): value is Rendered {
  return typeof value === 'object' && value !== null && 'dom' in value && isDomNode(value.dom);
}

/** Vrai si le deuxième élément d'un spec tableau est un objet d'attributs. */
function isAttributes(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && !isDomNode(value);
}

/**
 * Tableaux `[string, …]` trouvés dans un objet d'attributs, à n'importe quelle profondeur :
 * même parcours que `suspiciousAttributes` de prosemirror-model. Un `toDOM` d'intégrateur
 * qui renvoie `node.attrs.payload` tel quel laisserait un document (JSON stocké, `.docx`)
 * décrire librement un `<img onerror>` : ProseMirror lève dans ce cas, nous aussi.
 */
const suspiciousArraysCache = new WeakMap<object, readonly unknown[]>();

function suspiciousArrays(attrs: Readonly<Record<string, unknown>>): readonly unknown[] {
  const cached = suspiciousArraysCache.get(attrs);
  if (cached) {
    return cached;
  }
  const found: unknown[] = [];
  const scan = (value: unknown): void => {
    if (typeof value !== 'object' || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      if (typeof value[0] === 'string') {
        found.push(value);
      } else {
        value.forEach(scan);
      }
      return;
    }
    Object.values(value).forEach(scan);
  };
  scan(attrs);
  suspiciousArraysCache.set(attrs, found);
  return found;
}

/** Message levé quand un spec est un tableau sorti tel quel des attributs (même texte que ProseMirror). */
export const SUSPICIOUS_SPEC_MESSAGE =
  'Using an array from an attribute object as a DOM spec. This may be an attempted cross site scripting attack';

/**
 * Rend un `DOMOutputSpec` en DOM, comme `DOMSerializer.renderSpec`, mais en posant chaque
 * attribut avec `setAttribute` (le `style` reste verbatim). Le trou `0` désigne le
 * `contentDOM`, un espace dans le nom de balise introduit un espace de noms XML.
 *
 * `blockArraysIn` : attributs du nœud ou de la marque rendu ; tout tableau de spec qui en
 * provient (identité) est refusé, comme le fait ProseMirror. Les deux autres gardes de
 * `renderSpec` sont portées aussi : un trou de contenu doit être seul dans son parent, et
 * il ne peut y en avoir qu'un par spec.
 */
export function renderRawSpec(
  doc: Document,
  spec: DOMOutputSpec,
  xmlNS: string | null = null,
  blockArraysIn: Readonly<Record<string, unknown>> | null = null,
): Rendered {
  if (typeof spec === 'string') {
    return { dom: doc.createTextNode(spec) };
  }
  if (isDomNode(spec)) {
    return { dom: spec };
  }
  if (isRenderedSpec(spec)) {
    return spec;
  }
  if (!Array.isArray(spec) || typeof spec[0] !== 'string') {
    throw new RangeError('Invalid array passed to renderRawSpec');
  }
  if (blockArraysIn && suspiciousArrays(blockArraysIn).includes(spec)) {
    throw new RangeError(SUSPICIOUS_SPEC_MESSAGE);
  }
  const [rawTag, ...rest] = spec as readonly [string, ...unknown[]];
  let tagName = rawTag;
  let namespace = xmlNS;
  const space = tagName.indexOf(' ');
  if (space > 0) {
    namespace = tagName.slice(0, space);
    tagName = tagName.slice(space + 1);
  }
  const dom = (
    namespace ? doc.createElementNS(namespace, tagName) : doc.createElement(tagName)
  ) as HTMLElement;
  let children: readonly unknown[] = rest;
  const [attrs] = rest;
  if (isAttributes(attrs)) {
    children = rest.slice(1);
    for (const [name, value] of Object.entries(attrs)) {
      if (value === null || value === undefined) {
        continue;
      }
      const nameSpace = name.indexOf(' ');
      if (nameSpace > 0) {
        dom.setAttributeNS(name.slice(0, nameSpace), name.slice(nameSpace + 1), String(value));
      } else {
        dom.setAttribute(name, String(value));
      }
    }
  }
  let contentDOM: HTMLElement | undefined;
  children.forEach((child) => {
    if (child === 0) {
      if (children.length > 1) {
        throw new RangeError('Content hole must be the only child of its parent node');
      }
      contentDOM = dom;
      return;
    }
    const rendered = renderRawSpec(doc, child as DOMOutputSpec, namespace, blockArraysIn);
    dom.appendChild(rendered.dom);
    if (rendered.contentDOM) {
      if (contentDOM) {
        throw new RangeError('Multiple content holes');
      }
      contentDOM = rendered.contentDOM;
    }
  });
  return contentDOM ? { dom, contentDOM } : { dom };
}

/** Un sérialiseur par schéma : le schéma est immuable, le sérialiseur aussi. */
const serializers = new WeakMap<Schema, DOMSerializer>();

/** Convertit un `Rendered` en `DOMOutputSpec` accepté par ProseMirror. */
function toSpec(rendered: Rendered): DOMOutputSpec {
  const dom = rendered.dom as Element;
  return rendered.contentDOM ? { dom, contentDOM: rendered.contentDOM } : dom;
}

/**
 * Sérialiseur dérivé de celui du schéma : chaque `toDOM` de nœud et de marque est rendu
 * par `renderRawSpec` avant d'être confié à ProseMirror, qui n'a plus qu'à assembler.
 */
export function createRawStyleSerializer(schema: Schema): DOMSerializer {
  const cached = serializers.get(schema);
  if (cached) {
    return cached;
  }
  const base = DOMSerializer.fromSchema(schema);
  const nodes: Record<string, (node: ProseMirrorNode) => DOMOutputSpec> = {};
  for (const [name, toDOM] of Object.entries(base.nodes)) {
    nodes[name] = (node) => toSpec(renderRawSpec(document, toDOM(node), null, node.attrs));
  }
  const marks: Record<string, (mark: Mark, inline: boolean) => DOMOutputSpec> = {};
  for (const [name, toDOM] of Object.entries(base.marks)) {
    marks[name] = (mark, inline) =>
      toSpec(renderRawSpec(document, toDOM(mark, inline), null, mark.attrs));
  }
  const serializer = new DOMSerializer(nodes, marks);
  serializers.set(schema, serializer);
  return serializer;
}

/**
 * HTML d'un document ProseMirror, équivalent de `editor.getHTML()` de Tiptap, avec les
 * `style` verbatim. C'est l'entrée de `normalizeOutputHtml` dans `AsterEditor.getHTML`.
 */
export function serializeDocumentHtml(doc: ProseMirrorNode): string {
  const fragment = createRawStyleSerializer(doc.type.schema).serializeFragment(doc.content);
  const container = document.implementation.createHTMLDocument().createElement('div');
  container.appendChild(fragment);
  return container.innerHTML;
}
