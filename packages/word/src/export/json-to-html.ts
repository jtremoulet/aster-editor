import type { AsterDocument } from '@aster-editor/core';

/**
 * Sérialiseur minimal JSON ProseMirror → HTML, limité au schéma d'Aster (StarterKit,
 * tables, images, alignement, surlignage, indice/exposant, styles de texte, tâches).
 * Il évite d'instancier un éditeur pour exporter un document stocké en JSON ; pour
 * tout schéma étendu, passe par `editor.getHTML()` et donne le HTML à `exportDocx`.
 */

/** Échappe le texte pour un contenu ou une valeur d'attribut HTML. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Attribut `name="value"` si la valeur est définie et non vide. */
function attr(name: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  return ` ${name}="${escapeHtml(String(value))}"`;
}

/** Lit un attribut de nœud sans présumer de son type. */
function attrOf(node: AsterDocument, name: string): unknown {
  return node.attrs?.[name];
}

/** Déclaration `style` d'un `span` de la marque `textStyle`. */
function textStyleCss(attrs: Record<string, unknown> | undefined): string {
  if (!attrs) return '';
  const declarations: string[] = [];
  if (typeof attrs.color === 'string' && attrs.color) declarations.push(`color: ${attrs.color}`);
  if (typeof attrs.backgroundColor === 'string' && attrs.backgroundColor) {
    declarations.push(`background-color: ${attrs.backgroundColor}`);
  }
  if (typeof attrs.fontFamily === 'string' && attrs.fontFamily) {
    declarations.push(`font-family: ${attrs.fontFamily}`);
  }
  if (typeof attrs.fontSize === 'string' && attrs.fontSize) {
    declarations.push(`font-size: ${attrs.fontSize}`);
  }
  return declarations.join('; ');
}

/** Enveloppe `inner` dans la balise correspondant à une marque Tiptap. */
function wrapMark(mark: NonNullable<AsterDocument['marks']>[number], inner: string): string {
  const attrs = mark.attrs as Record<string, unknown> | undefined;
  switch (mark.type) {
    case 'bold':
      return `<strong>${inner}</strong>`;
    case 'italic':
      return `<em>${inner}</em>`;
    case 'underline':
      return `<u>${inner}</u>`;
    case 'strike':
      return `<s>${inner}</s>`;
    case 'code':
      return `<code>${inner}</code>`;
    case 'subscript':
      return `<sub>${inner}</sub>`;
    case 'superscript':
      return `<sup>${inner}</sup>`;
    case 'highlight':
      return `<mark${attr('style', attrs?.color ? `background-color: ${String(attrs.color)}` : '')}>${inner}</mark>`;
    case 'link':
      return `<a${attr('href', attrs?.href)}>${inner}</a>`;
    case 'textStyle':
      return `<span${attr('style', textStyleCss(attrs))}>${inner}</span>`;
    default:
      return inner;
  }
}

/** Attribut `style="text-align: …"` des blocs alignables. */
function alignStyle(node: AsterDocument): string {
  const align = attrOf(node, 'textAlign');
  return typeof align === 'string' && align !== '' && align !== 'left'
    ? attr('style', `text-align: ${align}`)
    : '';
}

/** Sérialise les enfants d'un nœud. */
function children(node: AsterDocument): string {
  return (node.content ?? []).map(serializeNode).join('');
}

/** Sérialise un nœud ProseMirror en HTML. Les types inconnus laissent passer leur contenu. */
function serializeNode(node: AsterDocument): string {
  switch (node.type) {
    case 'doc':
      return children(node);
    case 'text': {
      let html = escapeHtml(node.text ?? '');
      for (const mark of node.marks ?? []) html = wrapMark(mark, html);
      return html;
    }
    case 'paragraph':
      return `<p${alignStyle(node)}>${children(node)}</p>`;
    case 'heading': {
      const raw = Number(attrOf(node, 'level'));
      const level = Number.isInteger(raw) && raw >= 1 && raw <= 6 ? raw : 1;
      return `<h${String(level)}${alignStyle(node)}>${children(node)}</h${String(level)}>`;
    }
    case 'hardBreak':
      return '<br>';
    case 'bulletList':
    case 'taskList':
      return `<ul>${children(node)}</ul>`;
    case 'orderedList': {
      const start = attrOf(node, 'start');
      const type = attrOf(node, 'type');
      return `<ol${attr('start', start !== 1 ? start : '')}${attr('type', type)}>${children(node)}</ol>`;
    }
    case 'listItem':
    case 'taskItem':
      return `<li>${children(node)}</li>`;
    case 'blockquote':
      return `<blockquote>${children(node)}</blockquote>`;
    case 'codeBlock':
      return `<pre><code>${children(node)}</code></pre>`;
    case 'horizontalRule':
      return '<hr>';
    case 'image': {
      // `alt` toujours présent, même vide : c'est ce que le schéma image d'Aster garantit.
      const alt = ` alt="${escapeHtml(String(attrOf(node, 'alt') ?? ''))}"`;
      return `<img${attr('src', attrOf(node, 'src'))}${alt}${attr('title', attrOf(node, 'title'))}${attr('width', attrOf(node, 'width'))}${attr('height', attrOf(node, 'height'))}>`;
    }
    case 'table':
      return `<table><tbody>${children(node)}</tbody></table>`;
    case 'tableRow':
      return `<tr>${children(node)}</tr>`;
    case 'tableCell':
    case 'tableHeader': {
      const tag = node.type === 'tableHeader' ? 'th' : 'td';
      const colspan = attrOf(node, 'colspan');
      const rowspan = attrOf(node, 'rowspan');
      return `<${tag}${attr('colspan', colspan !== 1 ? colspan : '')}${attr('rowspan', rowspan !== 1 ? rowspan : '')}>${children(node)}</${tag}>`;
    }
    default:
      return node.text !== undefined ? escapeHtml(node.text) : children(node);
  }
}

/**
 * Convertit un document JSON ProseMirror en HTML prêt pour la conversion .docx. Un
 * document sans `type` est traité comme un `doc`.
 */
export function jsonToHtml(document: AsterDocument): string {
  return serializeNode(document.type === undefined ? { ...document, type: 'doc' } : document);
}
