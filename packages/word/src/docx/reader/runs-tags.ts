import { escapeAttr, pt, styleAttr } from './html.js';
import type { ResolvedRunProps } from './types.js';
import { cssFontFamily } from './units.js';

/**
 * Balises HTML d'un run résolu et accumulateur qui fusionne les textes voisins aux mêmes
 * balises. Module de `runs.ts` (ré-exporté par lui) : découpage L45, aucune logique
 * modifiée.
 */

/** Balises ouvrantes et fermantes d'un run, dans l'ordre fixe du contrat. */
export interface RunTags {
  readonly open: string;
  readonly close: string;
}

function decorationAttr(style: string): string {
  return style === 'solid' ? '' : ` style="text-decoration-style: ${style}"`;
}

/**
 * Balises d'un run : `<strong><em><u><s><sup|sub><span style data-docx-run-style>`. Les
 * marques booléennes sont écrites dès qu'elles sont vraies ; les propriétés valuées
 * seulement si elles diffèrent de `baseline` (les `docDefaults`).
 */
export function renderRunTags(props: ResolvedRunProps, baseline: ResolvedRunProps): RunTags {
  const differs = <K extends keyof ResolvedRunProps>(key: K): ResolvedRunProps[K] | undefined =>
    props[key] !== undefined && props[key] !== baseline[key] ? props[key] : undefined;
  const fontSize = differs('fontSizePt');
  const fontFamily = differs('fontFamily');
  const spacing = differs('letterSpacingPt');
  const caps = differs('caps');
  const style = styleAttr([
    // Ordre des déclarations = celui que le core sérialise (attributs de `textStyle`), pour
    // que `setHTML(getHTML())` dans l'éditeur rende exactement ce HTML. La police est
    // citée quand elle contient un espace (`"Wingdings 2"`) : le core relit la valeur
    // telle quelle (`getStyleProperty`) et la ré-émet à l'identique, guillemets compris.
    ['background-color', differs('highlight')],
    ['color', differs('color')],
    ['font-family', fontFamily === undefined ? undefined : cssFontFamily(fontFamily)],
    ['font-size', fontSize === undefined ? undefined : pt(fontSize)],
    ['letter-spacing', spacing === undefined ? undefined : pt(spacing)],
    ['text-transform', caps === 'all' ? 'uppercase' : undefined],
    ['font-variant', caps === 'small' ? 'small-caps' : undefined],
  ]);
  const runStyle = props.runStyle ? ` data-docx-run-style="${escapeAttr(props.runStyle)}"` : '';
  const open: string[] = [];
  const close: string[] = [];
  const wrap = (tag: string, attrs = ''): void => {
    open.push(`<${tag}${attrs}>`);
    close.unshift(`</${tag}>`);
  };
  // Du plus extérieur au plus intérieur : l'imbrication est celle du schéma du core
  // (`<span><strong><em><s><u><sup>`), sans quoi l'aller-retour dans l'éditeur réordonne.
  if (style || runStyle) wrap('span', `${style}${runStyle}`);
  if (props.bold) wrap('strong');
  if (props.italic) wrap('em');
  if (props.strike) wrap('s', decorationAttr(props.strike));
  if (props.underline) wrap('u', decorationAttr(props.underline));
  if (props.superscript) wrap('sup');
  else if (props.subscript) wrap('sub');
  return { open: open.join(''), close: close.join('') };
}

/** Accumule le HTML inline en fusionnant les textes voisins portés par les mêmes balises. */
export class InlineWriter {
  private readonly out: string[] = [];
  private current: { tags: RunTags; parts: string[] } | null = null;

  text(tags: RunTags, html: string): void {
    if (html === '') return;
    if (!this.current || this.current.tags.open !== tags.open) {
      this.flush();
      this.current = { tags, parts: [] };
    }
    this.current.parts.push(html);
  }

  raw(html: string): void {
    this.flush();
    if (html !== '') this.out.push(html);
  }

  private flush(): void {
    if (!this.current) return;
    const { tags, parts } = this.current;
    this.out.push(tags.open + parts.join('') + tags.close);
    this.current = null;
  }

  result(): string {
    this.flush();
    return this.out.join('');
  }
}
