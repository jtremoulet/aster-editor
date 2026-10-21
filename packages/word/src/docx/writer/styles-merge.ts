import type { DocxExportWarning } from '../../export/types.js';
import { allNamed, childNamed, childrenNamed } from '../preprocess/xml-utils.js';
import type { DocxStyleResolver } from '../reader/styles.js';
import type { ResolvedParagraphProps } from '../reader/types.js';
import { reconcileParagraph, reconcileRun } from './style-reconcile.js';
import {
  directParagraphKeys,
  directRunKeys,
  ownedRunKeys,
  stripParagraphProperties,
  stripRunProperties,
  styleOnly,
  type ParagraphKey,
  type RunKey,
} from './style-strip.js';
import { wordAttr, type PartStore } from './xml-io.js';

/**
 * Styles du corps greffé. Un style référencé par le corps (`w:pStyle`, `w:rStyle`,
 * `w:tblStyle`) est **réutilisé** s'il existe dans le gabarit, **ajouté** depuis
 * `styles.xml` de l'export neuf sinon (`Quote`, `Code`, `ListParagraph`…), **laissé en
 * place** s'il s'agit d'un style intégré de Word (`TOC1`, `Hyperlink`… : Word le
 * matérialise depuis ses styles latents), et retiré avec avertissement
 * `template-style-missing` s'il n'existe nulle part ou si son type (paragraphe,
 * caractère, tableau) n'est pas celui de la référence. Les styles du gabarit ne sont
 * jamais modifiés.
 *
 * Le retrait des propriétés directes redondantes (`style-strip.ts`) et la réécriture de
 * celles qui manquent (`style-reconcile.ts`) sont orchestrés par `stripParagraph`.
 */

/** Type OOXML d'un style, attendu par la référence qui le porte. */
export type StyleType = 'paragraph' | 'character' | 'table' | 'numbering';

export interface StyleMergerInput {
  readonly template: PartStore;
  readonly generated: PartStore;
  /** Chemin de `styles.xml` du gabarit (relation `/styles`). */
  readonly templatePath: string;
  readonly resolver: DocxStyleResolver;
  readonly warnings: DocxExportWarning[];
}

/** Issue d'`ensure` : où le style a été trouvé, et l'identifiant à écrire dans le corps. */
export interface EnsuredStyle {
  /**
   * `template` : défini dans le gabarit ; `renamed` : le gabarit définit un style de même
   * nom sous un autre identifiant (Word localise les identifiants : `Lienhypertexte` pour
   * « Hyperlink ») ; `added` : copié depuis l'export ; `builtin` : style intégré de Word,
   * défini nulle part mais laissé en place (Word le matérialise à l'ouverture) ;
   * `missing` : introuvable ou de mauvais type.
   */
  readonly status: 'template' | 'renamed' | 'added' | 'builtin' | 'missing';
  readonly id: string;
}

export interface StyleMerger {
  /** Identifiants définis dans le gabarit (styles ajoutés compris). */
  readonly ids: ReadonlySet<string>;
  /**
   * Garantit la définition d'un style et rend l'identifiant à écrire (voir `EnsuredStyle`).
   * `expected` est le type qu'impose la référence (`w:pStyle` → `paragraph`…) : un style
   * d'un autre type vaut `missing`.
   */
  ensure(styleId: string, expected?: StyleType): Promise<EnsuredStyle>;
  /**
   * Retire des `w:pPr` et `w:rPr` d'un paragraphe les propriétés directes égales à ce que
   * ses styles (et les défauts du document) donnent déjà. Rend le paragraphe résolu.
   */
  stripParagraph(paragraph: Element): ResolvedParagraphProps;
}

/** Références d'un `w:style` vers d'autres styles, à garantir avec lui. */
const STYLE_LINKS = ['basedOn', 'next', 'link'] as const;

/**
 * Styles intégrés de Word, avec leur type : référencés sans être définis, Word les
 * matérialise depuis ses styles latents (export neuf : `styles.xml` ne définit pas
 * `TOC1` non plus). Ils restent donc en place sans avertissement.
 */
const BUILT_IN_STYLES: ReadonlyMap<string, StyleType> = new Map<string, StyleType>([
  ...Array.from({ length: 9 }, (_, index): [string, StyleType] => [
    `TOC${String(index + 1)}`,
    'paragraph',
  ]),
  ...Array.from({ length: 9 }, (_, index): [string, StyleType] => [
    `Heading${String(index + 1)}`,
    'paragraph',
  ]),
  ['TOCHeading', 'paragraph'],
  ['Hyperlink', 'character'],
  ['FootnoteText', 'paragraph'],
  ['FootnoteReference', 'character'],
  ['EndnoteText', 'paragraph'],
  ['EndnoteReference', 'character'],
  ['ListParagraph', 'paragraph'],
  ['TableGrid', 'table'],
  ['Header', 'paragraph'],
  ['Footer', 'paragraph'],
  ['Caption', 'paragraph'],
  ['Title', 'paragraph'],
  ['Subtitle', 'paragraph'],
  ['Quote', 'paragraph'],
  ['IntenseQuote', 'paragraph'],
  ['NoSpacing', 'paragraph'],
]);

/** Libellé français d'un type de style, pour les avertissements. */
const TYPE_LABELS: Readonly<Record<StyleType, string>> = {
  paragraph: 'paragraphe',
  character: 'caractère',
  table: 'tableau',
  numbering: 'numérotation',
};

/** `w:type` d'un `w:style`, `paragraph` quand il est absent (défaut du schéma). */
function styleTypeOf(style: Element): StyleType {
  const type = wordAttr(style, 'type');
  return type === 'character' || type === 'table' || type === 'numbering' ? type : 'paragraph';
}

/** Crée le fusionneur de styles du gabarit. */
export async function createStyleMerger(input: StyleMergerInput): Promise<StyleMerger> {
  const templateDoc = await input.template.dom(input.templatePath);
  const generatedDoc = await input.generated.dom('word/styles.xml');
  const ids = new Set<string>();
  /** Type de chaque style défini dans le gabarit (ajouts compris). */
  const types = new Map<string, StyleType>();
  /** Nom (`w:name`, minuscules) et type → identifiant du gabarit : Word localise les identifiants, pas les noms. */
  const templateByName = new Map<string, string>();
  const generatedStyles = new Map<string, Element>();
  let defaultParagraphStyle = '';
  const nameKey = (style: Element): string => {
    const name = childNamed(style, 'name');
    return `${styleTypeOf(style)}:${(name ? wordAttr(name, 'val') : '').trim().toLowerCase()}`;
  };
  if (templateDoc) {
    for (const style of childrenNamed(templateDoc.documentElement, 'style')) {
      const id = wordAttr(style, 'styleId');
      if (!id) continue;
      ids.add(id);
      types.set(id, styleTypeOf(style));
      const key = nameKey(style);
      if (!key.endsWith(':') && !templateByName.has(key)) templateByName.set(key, id);
      const isDefault = wordAttr(style, 'default') === '1' || wordAttr(style, 'default') === 'true';
      if (isDefault && styleTypeOf(style) === 'paragraph' && !defaultParagraphStyle) {
        defaultParagraphStyle = id;
      }
    }
  }
  if (generatedDoc) {
    for (const style of childrenNamed(generatedDoc.documentElement, 'style')) {
      const id = wordAttr(style, 'styleId');
      if (id) generatedStyles.set(id, style);
    }
  }
  const warned = new Set<string>();
  const renamed = new Map<string, string>();

  const missing = (styleId: string, message: string): EnsuredStyle => {
    if (!warned.has(message)) {
      warned.add(message);
      input.warnings.push({ code: 'template-style-missing', message });
    }
    return { status: 'missing', id: styleId };
  };
  const mismatch = (styleId: string, actual: StyleType, expected: StyleType): EnsuredStyle =>
    missing(
      styleId,
      `Style « ${styleId} » de ${TYPE_LABELS[actual]} référencé comme style de ${TYPE_LABELS[expected]} : propriétés directes seules`,
    );

  const ensure = async (styleId: string, expected?: StyleType): Promise<EnsuredStyle> => {
    const templateType = types.get(styleId);
    if (templateType !== undefined) {
      if (expected && templateType !== expected) return mismatch(styleId, templateType, expected);
      return { status: 'template', id: styleId };
    }
    const known = renamed.get(styleId);
    if (known !== undefined) {
      const knownType = types.get(known);
      if (expected && knownType !== undefined && knownType !== expected) {
        return mismatch(styleId, knownType, expected);
      }
      return { status: 'renamed', id: known };
    }
    const generated = generatedStyles.get(styleId);
    if (!generated || !templateDoc) {
      const builtIn = BUILT_IN_STYLES.get(styleId);
      if (builtIn !== undefined) {
        if (expected && builtIn !== expected) return mismatch(styleId, builtIn, expected);
        return { status: 'builtin', id: styleId };
      }
      return missing(
        styleId,
        `Style « ${styleId} » absent du gabarit et de l'export : propriétés directes seules`,
      );
    }
    const generatedType = styleTypeOf(generated);
    if (expected && generatedType !== expected) return mismatch(styleId, generatedType, expected);
    const sameName = templateByName.get(nameKey(generated));
    if (sameName !== undefined) {
      renamed.set(styleId, sameName);
      return { status: 'renamed', id: sameName };
    }
    ids.add(styleId);
    types.set(styleId, generatedType);
    templateDoc.documentElement.appendChild(templateDoc.importNode(generated, true));
    await input.template.markChanged(input.templatePath);
    // Un style copié peut en référencer un autre (`basedOn="Normal"`, `link`) : on le suit.
    for (const link of STYLE_LINKS) {
      const reference = childNamed(generated, link);
      const target = reference ? wordAttr(reference, 'val') : '';
      if (target && target !== styleId && generatedStyles.has(target)) await ensure(target);
    }
    return { status: 'added', id: styleId };
  };

  const resolver = input.resolver;

  return {
    ids,
    ensure,
    stripParagraph(paragraph) {
      const defaults = resolver.docDefaults();
      let pPr = childNamed(paragraph, 'pPr');
      // Le style de paragraphe par défaut (`Normal`) s'applique sans `w:pStyle` : Word ne l'écrit pas.
      const pStyle = pPr ? childNamed(pPr, 'pStyle') : null;
      if (pStyle && defaultParagraphStyle && wordAttr(pStyle, 'val') === defaultParagraphStyle) {
        pStyle.remove();
      }
      const full = resolver.paragraph(pPr);
      const base = resolver.paragraph(pPr ? styleOnly(pPr, 'pStyle') : null);
      const direct = pPr ? directParagraphKeys(pPr) : new Set<ParagraphKey>();
      if (pPr) stripParagraphProperties(pPr, full, base);
      pPr = reconcileParagraph(paragraph, pPr, direct, base, defaults.paragraph);
      if (pPr && pPr.children.length === 0) pPr.remove();
      for (const run of allNamed(paragraph, 'r')) {
        let rPr = childNamed(run, 'rPr');
        const styleOnlyRPr = rPr ? styleOnly(rPr, 'rStyle') : null;
        const baseRun = resolver.run(styleOnlyRPr, full);
        const directRun = rPr ? directRunKeys(rPr) : new Set<RunKey>();
        if (rPr) stripRunProperties(rPr, resolver.run(rPr, full), baseRun);
        // Ce que le style de caractère pose lui-même (couleur et souligné d'un lien, police
        // d'un code) est voulu et n'est pas réconcilié ; le reste vient du style de paragraphe.
        const owned = styleOnlyRPr ? resolver.run(styleOnlyRPr, defaults.paragraph) : defaults.run;
        for (const key of ownedRunKeys(owned, defaults.run)) directRun.add(key);
        rPr = reconcileRun(run, rPr, directRun, baseRun, defaults.run);
        if (rPr && rPr.children.length === 0) rPr.remove();
      }
      return full;
    },
  };
}
