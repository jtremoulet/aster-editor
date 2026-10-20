import { childNamed, childrenNamed, wordAttribute } from '../preprocess/xml-utils';
import {
  applyParagraphProperties,
  applyRunProperties,
  cloneParagraph,
  emptyParagraph,
  finalizeParagraph,
  finalizeRun,
  mergeRunDelta,
  type MutableParagraph,
  type MutableRun,
} from './properties';
import {
  headingLevelOfName,
  readStyle,
  readStylesPart,
  readThemeFonts,
  type StyleDefinition,
  type StyleType,
} from './styles-part';
import { resolveTableStyle, type DocxTableStyleProps } from './styles-table';
import type { ConditionalFormats } from './table-conditional';
import type {
  DocxPackage,
  HeadingLevel,
  ResolvedParagraphProps,
  ResolvedRunProps,
  StyleResolver,
  TableStyleProps,
} from './types';

/**
 * Résolution des styles Word : `docDefaults` → chaîne `basedOn` (garde anti-cycle) →
 * style de caractère → propriétés directes. Les polices du thème (`minorHAnsi`…) sont
 * lues dans `theme1.xml`. Le résolveur expose en plus du contrat `docDefaults()`, base
 * d'émission du HTML : `paragraphs.ts` et `runs.ts` n'écrivent que ce qui en diffère.
 * La lecture de `styles.xml` (`styles-part.ts`) et la résolution des styles de tableau
 * (`styles-table.ts`) sont des modules de celui-ci (découpage L45).
 */

export type { DocxTableStyleProps } from './styles-table';

/** Défauts du document (`w:docDefaults`), sans aucun style appliqué. */
export interface DocDefaults {
  readonly paragraph: ResolvedParagraphProps;
  readonly run: ResolvedRunProps;
}

/** Résolveur d'Aster : le contrat plus les défauts du document. */
export interface DocxStyleResolver extends StyleResolver {
  docDefaults(): DocDefaults;
}

/** Formats conditionnels d'un style de tableau, `undefined` pour un style tiers ou sans `w:tblStylePr`. */
export function conditionalFormatsOf(
  style: TableStyleProps | null,
): ConditionalFormats | undefined {
  return style && 'conditional' in style ? (style as DocxTableStyleProps).conditional : undefined;
}

/**
 * Défauts du document d'un résolveur quelconque : ceux d'Aster s'il les expose, sinon un
 * repli sur `defaultFont()` (résolveur tiers ou stub).
 */
export function docDefaultsOf(styles: StyleResolver): DocDefaults {
  if ('docDefaults' in styles && typeof styles.docDefaults === 'function') {
    return (styles as DocxStyleResolver).docDefaults();
  }
  const font = styles.defaultFont();
  const run: ResolvedRunProps = {
    ...(font.family ? { fontFamily: font.family } : {}),
    ...(font.sizePt !== undefined ? { fontSizePt: font.sizePt } : {}),
  };
  return { paragraph: { runDefaults: run }, run };
}

/** Défauts de paragraphe d'un style de tableau, `undefined` pour un style tiers. */
export function tableParagraphDefaultsOf(
  style: TableStyleProps | null,
): DocxTableStyleProps['paragraphDefaults'] {
  return style && 'paragraphDefaults' in style
    ? (style as DocxTableStyleProps).paragraphDefaults
    : undefined;
}

/** Crée le résolveur de styles du document. Signature figée par la phase 0. */
export async function createStyleResolver(pkg: DocxPackage): Promise<DocxStyleResolver> {
  const [stylesDoc, theme] = await Promise.all([readStylesPart(pkg), readThemeFonts(pkg)]);
  const styles = new Map<string, StyleDefinition>();
  const defaults = new Map<StyleType, string>();
  const baseParagraph = emptyParagraph();
  const baseRun: MutableRun = {};

  if (stylesDoc) {
    const root = stylesDoc.documentElement;
    const docDefaults = childNamed(root, 'docDefaults');
    const rPrDefault = docDefaults ? childNamed(docDefaults, 'rPrDefault') : null;
    const pPrDefault = docDefaults ? childNamed(docDefaults, 'pPrDefault') : null;
    const rPr = rPrDefault ? childNamed(rPrDefault, 'rPr') : null;
    const pPr = pPrDefault ? childNamed(pPrDefault, 'pPr') : null;
    if (rPr) applyRunProperties(rPr, baseRun, theme);
    if (pPr) applyParagraphProperties(pPr, baseParagraph);
    for (const element of childrenNamed(root, 'style')) {
      const style = readStyle(element);
      if (!style) continue;
      styles.set(style.id, style);
      if (style.isDefault && !defaults.has(style.type)) defaults.set(style.type, style.id);
    }
  }

  const docDefaults: DocDefaults = {
    paragraph: finalizeParagraph(baseParagraph, finalizeRun(baseRun)),
    run: finalizeRun(baseRun),
  };

  /** Chaîne `basedOn` de la racine à la feuille ; `clean` faux si un cycle a été coupé. */
  interface StyleChain {
    readonly chain: readonly StyleDefinition[];
    readonly clean: boolean;
  }

  /** Chaîne `basedOn` de la racine à la feuille, cycles et références cassées ignorés. */
  const chainOf = (styleId: string | undefined, type: StyleType): StyleChain => {
    const chain: StyleDefinition[] = [];
    const seen = new Set<string>();
    let current = styleId;
    let clean = true;
    while (current) {
      if (seen.has(current)) {
        clean = false;
        break;
      }
      seen.add(current);
      const style = styles.get(current);
      if (!style || style.type !== type) break;
      chain.push(style);
      current = style.basedOn;
    }
    return { chain: chain.reverse(), clean };
  };

  /**
   * Résout un style en mémoïsant chaque nœud de sa chaîne `basedOn` par `styleId` : la
   * remontée s'arrête au premier ancêtre déjà résolu, seuls les nœuds en dessous sont
   * appliqués (`apply` dérive l'état d'un nœud de celui de son parent, sans le muter).
   * Une chaîne de 1 500 styles coûte ainsi 1 500 applications en tout, pas 1 500 par
   * paragraphe, et chaque résolution est linéaire en nœuds non encore vus. Une chaîne
   * coupée par un cycle n'est pas mémoïsée : ses préfixes dépendent du point d'entrée
   * (un nœud mémoïsé n'est jamais dans un cycle, s'y arrêter est donc sûr).
   */
  const resolveStyle = <T>(
    styleId: string | undefined,
    type: StyleType,
    cache: Map<string, T>,
    root: T,
    apply: (parent: T, style: StyleDefinition) => T,
  ): T => {
    const pending: StyleDefinition[] = [];
    const seen = new Set<string>();
    let state = root;
    let clean = true;
    let current = styleId;
    while (current) {
      if (seen.has(current)) {
        clean = false;
        break;
      }
      seen.add(current);
      const cached = cache.get(current);
      if (cached !== undefined) {
        state = cached;
        break;
      }
      const style = styles.get(current);
      if (!style || style.type !== type) break;
      pending.push(style);
      current = style.basedOn;
    }
    for (const style of pending.reverse()) {
      state = apply(state, style);
      if (clean) cache.set(style.id, state);
    }
    return state;
  };

  interface ParagraphNode {
    readonly headingLevel?: HeadingLevel;
    readonly paragraph: MutableParagraph;
    readonly run: MutableRun;
  }

  const paragraphNodes = new Map<string, ParagraphNode>();
  const paragraphRoot: ParagraphNode = { paragraph: baseParagraph, run: baseRun };

  const applyParagraphNode = (parent: ParagraphNode, style: StyleDefinition): ParagraphNode => {
    const paragraph = cloneParagraph(parent.paragraph);
    const run: MutableRun = { ...parent.run };
    if (style.pPr) applyParagraphProperties(style.pPr, paragraph);
    if (style.rPr) applyRunProperties(style.rPr, run, theme);
    const headingLevel =
      headingLevelOfName(style.id) ?? headingLevelOfName(style.name) ?? parent.headingLevel;
    return { ...(headingLevel ? { headingLevel } : {}), paragraph, run };
  };

  interface ResolvedParagraphStyle {
    readonly styleId?: string;
    readonly headingLevel?: HeadingLevel;
    readonly paragraph: MutableParagraph;
    readonly run: MutableRun;
    readonly runDefaults: ResolvedRunProps;
  }

  const paragraphStyles = new Map<string, ResolvedParagraphStyle>();

  /**
   * Style de paragraphe demandé par `w:pStyle` : un identifiant inconnu **ou d'un autre
   * type** (style de tableau, de caractère) retombe sur le style de paragraphe par défaut.
   */
  const resolveParagraphStyle = (requested: string | undefined): ResolvedParagraphStyle => {
    const styleId =
      requested && styles.get(requested)?.type === 'paragraph'
        ? requested
        : defaults.get('paragraph');
    const key = styleId ?? '';
    const cached = paragraphStyles.get(key);
    if (cached) return cached;
    const node = resolveStyle(
      styleId,
      'paragraph',
      paragraphNodes,
      paragraphRoot,
      applyParagraphNode,
    );
    let headingLevel = node.headingLevel;
    const outline = node.paragraph.outlineLevel;
    if (outline !== undefined && outline >= 0 && outline <= 5) {
      headingLevel = (outline + 1) as HeadingLevel;
    }
    const resolved: ResolvedParagraphStyle = {
      // `styleId` est connu et de type paragraphe (ou le style par défaut) : toujours posé.
      ...(styleId ? { styleId } : {}),
      ...(headingLevel ? { headingLevel } : {}),
      paragraph: node.paragraph,
      run: node.run,
      runDefaults: finalizeRun(node.run),
    };
    paragraphStyles.set(key, resolved);
    return resolved;
  };

  const runDeltas = new Map<string, MutableRun>();

  /** Delta d'un nœud : ses `w:rPr` combinés à ceux du parent (bascules en XOR, §17.7.3). */
  const applyRunNode = (parent: MutableRun, style: StyleDefinition): MutableRun => {
    const delta: MutableRun = { ...parent };
    if (!style.rPr) return delta;
    const own: MutableRun = {};
    applyRunProperties(style.rPr, own, theme);
    mergeRunDelta(delta, own);
    return delta;
  };

  /**
   * Delta d'un style de caractère (ou du style lié d'un style de paragraphe) : ses `w:rPr`
   * résolus sur un accumulateur vide, mémoïsés par `styleId` ; `null` si le style est
   * inconnu ou d'un type sans propriétés de run. `run()` l'applique sur les défauts du
   * paragraphe par `mergeRunDelta`.
   */
  const characterDeltas = new Map<string, MutableRun | null>();

  const characterDelta = (styleId: string): MutableRun | null => {
    const cached = characterDeltas.get(styleId);
    if (cached !== undefined) return cached;
    const style = styles.get(styleId);
    let delta: MutableRun | null = null;
    if (style?.type === 'character') {
      delta = resolveStyle(styleId, 'character', runDeltas, {}, applyRunNode);
    } else if (style?.type === 'paragraph') {
      const linked = style.link && styles.get(style.link);
      delta =
        linked && linked.type === 'character'
          ? characterDelta(linked.id)
          : resolveStyle(styleId, 'paragraph', runDeltas, {}, applyRunNode);
    }
    characterDeltas.set(styleId, delta);
    return delta;
  };

  const tableStyles = new Map<string, DocxTableStyleProps | null>();

  return {
    paragraph(pPr) {
      const pStyle = pPr ? childNamed(pPr, 'pStyle') : null;
      const base = resolveParagraphStyle(
        pStyle ? wordAttribute(pStyle, 'val') || undefined : undefined,
      );
      let paragraph = base.paragraph;
      if (pPr) {
        paragraph = cloneParagraph(base.paragraph);
        applyParagraphProperties(pPr, paragraph);
      }
      let headingLevel = base.headingLevel;
      const outline = paragraph.outlineLevel;
      if (pPr && childNamed(pPr, 'outlineLvl') && outline !== undefined) {
        headingLevel = outline >= 0 && outline <= 5 ? ((outline + 1) as HeadingLevel) : undefined;
      }
      return {
        ...(base.styleId ? { styleId: base.styleId } : {}),
        ...(headingLevel ? { headingLevel } : {}),
        ...finalizeParagraph(paragraph, base.runDefaults),
      };
    },

    run(rPr, paragraph) {
      const acc: MutableRun = { ...paragraph.runDefaults };
      if (!rPr) return finalizeRun(acc);
      const rStyle = childNamed(rPr, 'rStyle');
      const styleId = rStyle ? wordAttribute(rStyle, 'val') : '';
      if (styleId) {
        const delta = characterDelta(styleId);
        if (delta) mergeRunDelta(acc, delta);
        if (styles.has(styleId)) acc.runStyle = styleId;
      }
      applyRunProperties(rPr, acc, theme);
      return finalizeRun(acc);
    },

    tableStyle(styleId) {
      if (!styleId) return null;
      let cached = tableStyles.get(styleId);
      if (cached === undefined) {
        cached = resolveTableStyle(chainOf(styleId, 'table').chain, baseRun, theme);
        tableStyles.set(styleId, cached);
      }
      return cached;
    },

    defaultFont() {
      const { runDefaults } = resolveParagraphStyle(undefined);
      return {
        ...(runDefaults.fontFamily ? { family: runDefaults.fontFamily } : {}),
        ...(runDefaults.fontSizePt !== undefined ? { sizePt: runDefaults.fontSizePt } : {}),
      };
    },

    docDefaults() {
      return docDefaults;
    },
  };
}
