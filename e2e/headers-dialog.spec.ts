import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';
import {
  editor,
  editorHost,
  fixturePath,
  fixtureZip,
  importPlaygroundDocx,
  sameBytes,
  sectionGaps,
  setHtml,
  setPageView,
  toolbarTrigger,
  zipPart,
} from './fixtures.js';

/**
 * En-têtes et pieds éditables dans le dialogue « Mise en page » (session 5, L54, retour
 * POC n° 8) sur le playground vanilla : la fixture à trois sections (`sections.spec.ts`),
 * l'en-tête de la section 2 modifié via le dialogue, la coupure « Section 2 » qui le
 * reflète, puis l'export dans le gabarit avec la mise en page relue (`getLayout()`) : une
 * partie d'en-tête régénérée pour la section 2, les parties d'origine à l'octet.
 */

/** Fixture à trois sections : voir `sections.spec.ts` et `fixtures/docx/README.md`. */
const TRIPLE_DOCX = '18-sections-triple.docx';

/** Parties de la fixture 18 que l'export dans le gabarit laisse intactes à l'octet. */
const PRESERVED_PARTS = [
  'word/header1.xml',
  'word/header2.xml',
  'word/header3.xml',
  'word/header4.xml',
  'word/footer1.xml',
  'word/footer2.xml',
  'word/styles.xml',
];

/** Un jeu d'en-têtes ou de pieds tel que `getLayout()` le rend (vue partielle). */
interface HeaderFooterSetLike {
  default?: { html: string };
  first?: { html: string };
  even?: { html: string };
}

/** Mise en page relue sur le playground (seuls les champs vérifiés ici sont typés). */
interface LayoutLike {
  headers?: HeaderFooterSetLike;
  footers?: HeaderFooterSetLike;
  titlePage?: boolean;
  sections?: {
    headers?: HeaderFooterSetLike;
    footers?: HeaderFooterSetLike;
    titlePage?: boolean;
  }[];
}

/** `window.aster` et `window.asterExportDocx` du playground, pour la mise en page et l'export. */
interface PlaygroundWindowL54 {
  aster?: {
    editor: {
      getHTML(): string;
      getLayout(): LayoutLike | null;
      variables: {
        define(variables: readonly { name: string; label?: string }[]): void;
        setValues(values: Record<string, string | undefined>): void;
      };
    };
  };
  asterExportDocx?: (html: string, options: Record<string, unknown>) => Promise<Blob>;
}

/** Paragraphe du corps repéré par son texte (les paragraphes de la fixture sont uniques). */
function paragraph(page: Page, text: string): Locator {
  return editor(page).locator('p', { hasText: text }).first();
}

/** Mise en page relue depuis le core (`editor.getLayout()`), telle que le dialogue l'a écrite. */
async function getLayout(page: Page): Promise<LayoutLike> {
  return page.evaluate(() => {
    const aster = (window as unknown as PlaygroundWindowL54).aster;
    if (!aster) throw new Error('window.aster is not available: playground not mounted');
    return aster.editor.getLayout() ?? {};
  });
}

/**
 * Export dans le gabarit de la fixture avec le document et la mise en page **courants** du
 * playground (le bouton « Exporter » du playground repart de la mise en page de l'import,
 * pas de celle du dialogue) : les octets du gabarit font l'aller-retour en base64.
 */
async function exportInTemplate(page: Page, fixture: string): Promise<JSZip> {
  const template = await readFile(fixturePath('docx', fixture));
  const exported = await page.evaluate(async (templateBase64) => {
    const w = window as unknown as PlaygroundWindowL54;
    if (!w.aster || !w.asterExportDocx) {
      throw new Error('window.aster / asterExportDocx indisponibles : playground non monté');
    }
    const bytes = Uint8Array.from(atob(templateBase64), (char) => char.charCodeAt(0));
    const blob = await w.asterExportDocx(w.aster.editor.getHTML(), {
      title: 'L54',
      template: bytes.buffer,
      layout: w.aster.editor.getLayout(),
    });
    const out = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (const byte of out) binary += String.fromCharCode(byte);
    return btoa(binary);
  }, template.toString('base64'));
  return JSZip.loadAsync(Buffer.from(exported, 'base64'));
}

/** Chemins des parties d'en-tête d'une archive, triés. */
function headerParts(zip: JSZip): string[] {
  return Object.keys(zip.files)
    .filter((path) => /^word\/header\d+\.xml$/.test(path))
    .sort();
}

test.describe('En-têtes dans le dialogue « Mise en page » — playground', () => {
  test.skip(() => !test.info().project.name.startsWith('playground'), 'playground seulement');

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await expect(page.locator('.aster-toolbar')).toBeVisible();
  });

  test("éditer l'en-tête de la section 2 met à jour la coupure « Section 2 » et l'export dans le gabarit", async ({
    page,
  }) => {
    await importPlaygroundDocx(page, TRIPLE_DOCX);
    const gaps = sectionGaps(page);
    await expect.poll(() => gaps.count()).toBeGreaterThanOrEqual(1);
    const opening = gaps.first();
    await expect(opening).toHaveAttribute('data-section', '2');
    // « Section 2 » (default) ou « Section 2 paire » (even, si la vue page distingue les
    // pages paires, L52) : dans les deux cas l'en-tête de la section 2.
    await expect(opening.locator('.aster-page-gap__header')).toContainText('Section 2');

    // Curseur dans la section 2 : le dialogue montre ses en-têtes (default « Section 2 »,
    // even « Section 2 paire » avec la case cochée), pas de première page.
    await paragraph(page, 'Section 2, paragraphe 1').click();
    await toolbarTrigger(page, 'Mise en page').click();
    const dialog = page.locator('.aster-page-layout');
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('.aster-page-layout__section')).toHaveText('Section 2 sur 3');
    const header = dialog.locator('.aster-page-layout__headers-default');
    await expect(header).toHaveAttribute('contenteditable', 'true');
    await expect(header).toHaveText('Section 2');
    await expect(dialog.locator('.aster-page-layout__even-pages')).toBeChecked();
    await expect(dialog.locator('.aster-page-layout__headers-even')).toHaveText('Section 2 paire');
    await expect(dialog.locator('.aster-page-layout__title-page')).not.toBeChecked();
    await expect(dialog.locator('.aster-page-layout__headers-first')).toBeHidden();

    // Saisie réelle au clavier : tout remplacer, Entrée ouvre un second paragraphe. Les pages
    // paires sont décochées : l'en-tête `default` vaut alors pour toutes les pages de la
    // section, quelle que soit la parité de la page que la coupure ouvre.
    await header.click();
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.type('Nouvel en-tête');
    await page.keyboard.press('Enter');
    await page.keyboard.type('Seconde ligne');
    await expect(dialog).toBeVisible();
    await dialog.locator('.aster-page-layout__even-pages').uncheck();
    await expect(dialog.locator('.aster-page-layout__headers-even')).toBeHidden();
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();

    // La coupure qui ouvre la section 2 affiche le nouveau texte ; l'hôte garde « Section 1 ».
    await expect(opening.locator('.aster-page-gap__header')).toContainText('Nouvel en-tête');
    await expect(opening.locator('.aster-page-gap__header')).toContainText('Seconde ligne');
    // L'hôte garde l'en-tête de la section 1 (« Première page » si la vue page rend le
    // `first` de sa page de titre, L52), jamais celui de la section 2.
    await expect(editorHost(page).locator('.aster-page-header')).toHaveText(
      /^(Section 1|Première page)$/,
    );
    await expect(editorHost(page).locator('.aster-page-footer')).toHaveText('Pied 3');

    // La mise en page relue : section 2 seule modifiée (even retiré), premier niveau =
    // section 3 (invariant), pas de titlePage.
    // Chromium garde le `<p>` importé (et son `data-docx-style`) en remplaçant son texte.
    const layout = await getLayout(page);
    expect(layout.sections?.[1]?.headers?.default?.html).toMatch(
      /^<p(?: data-docx-style="Normal")?>Nouvel en-tête<\/p><p>Seconde ligne<\/p>$/,
    );
    expect(layout.sections?.[1]?.headers?.even).toBeUndefined();
    expect(layout.sections?.[1]?.titlePage).toBeUndefined();
    expect(layout.sections?.[0]?.headers?.default?.html).toContain('Section 1');
    expect(layout.sections?.[0]?.titlePage).toBe(true);
    expect(layout.footers?.default?.html).toContain('Pied 3');
    expect(layout.headers?.default?.html ?? '').not.toContain('Nouvel en-tête');

    // Export dans le gabarit : trois `w:sectPr`, les parties d'origine à l'octet, une partie
    // d'en-tête régénérée qui porte le nouveau texte et que le `w:sectPr` de la section 2
    // référence comme en-tête `default`.
    const exported = await exportInTemplate(page, TRIPLE_DOCX);
    const original = await fixtureZip('docx', TRIPLE_DOCX);
    const document = Buffer.from(await zipPart(exported, 'word/document.xml')).toString('utf8');
    const sectPrs = document.match(/<w:sectPr[\s>][\s\S]*?<\/w:sectPr>/g) ?? [];
    expect(sectPrs).toHaveLength(3);
    for (const part of PRESERVED_PARTS) {
      expect(
        sameBytes(await zipPart(exported, part), await zipPart(original, part)),
        `${part} identique à l'octet`,
      ).toBe(true);
    }
    const added = headerParts(exported).filter((path) => !headerParts(original).includes(path));
    expect(added).toHaveLength(1);
    const regenerated = Buffer.from(await zipPart(exported, added[0] ?? '')).toString('utf8');
    expect(regenerated).toContain('Nouvel en-tête');
    expect(regenerated).toContain('Seconde ligne');
    const reference = /<w:headerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"/.exec(
      sectPrs[1] ?? '',
    );
    const rels = Buffer.from(await zipPart(exported, 'word/_rels/document.xml.rels')).toString(
      'utf8',
    );
    const target = new RegExp(`Id="${reference?.[1] ?? ''}"[^>]*Target="([^"]+)"`).exec(rels);
    expect(`word/${target?.[1] ?? ''}`).toBe(added[0]);
  });
});

/** Mise en page du retour utilisateurs 0.7 : marge haute de Word (12,7 mm, en-tête à 12,49 mm) et en-tête de quatre lignes. */
const TALL_HEADER_LAYOUT = {
  page: {
    size: 'A4',
    orientation: 'portrait',
    margins: { topMm: 12.7, bottomMm: 12.7, headerMm: 12.49, footerMm: 12.49 },
  },
  headers: {
    default: {
      html: '<p><strong>Cabinet Nebula</strong></p><p>12 rue des Étoiles</p><p>34000 Montpellier</p><p>contact@example.com</p>',
    },
  },
  footers: {
    default: { html: '<p>Document confidentiel</p><p>Ne pas diffuser</p><p>Page de garde</p>' },
  },
};

test.describe('En-tête et pied plus hauts que leur marge', () => {
  test('ils poussent le corps au lieu de le recouvrir, sur l’hôte et à chaque coupure', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await setPageView(page, { layout: TALL_HEADER_LAYOUT });
    await expect(editorHost(page)).toHaveClass(/aster--page-view/);
    await setHtml(
      page,
      Array.from({ length: 60 }, (_, index) => `<p>Paragraphe ${index + 1}</p>`).join(''),
    );
    await expect.poll(() => editor(page).locator('.aster-page-gap').count()).toBeGreaterThan(0);

    const box = async (locator: Locator): Promise<{ top: number; bottom: number }> => {
      const rect = await locator.boundingBox();
      if (!rect) throw new Error('élément sans boîte');
      return { top: rect.y, bottom: rect.y + rect.height };
    };
    /** Hauteur que le contenu occupe réellement, rognage compris (scrollHeight). */
    const clipped = (locator: Locator): Promise<boolean> =>
      locator.evaluate((element) => element.scrollHeight > element.clientHeight + 1);

    // Page 1 : l'en-tête de l'hôte est entier et finit au-dessus du premier paragraphe.
    const header = page.locator('.aster-page-header');
    const paragraphs = editor(page).locator('p');
    expect(await clipped(header)).toBe(false);
    expect((await box(header)).bottom).toBeLessThanOrEqual((await box(paragraphs.first())).top + 1);

    // Dernière page : le pied de l'hôte est entier et commence sous le dernier paragraphe.
    const footer = page.locator('.aster-page-footer');
    expect(await clipped(footer)).toBe(false);
    expect((await box(footer)).top).toBeGreaterThanOrEqual(
      (await box(paragraphs.last())).bottom - 1,
    );

    // Coupure : le pied de la page qui finit et l'en-tête de celle qui commence ne touchent
    // ni le dernier paragraphe d'avant, ni le premier d'après.
    const gap = editor(page).locator('.aster-page-gap').first();
    const before = gap.locator('xpath=preceding-sibling::p[1]');
    const after = gap.locator('xpath=following-sibling::p[1]');
    const gapFooter = gap.locator('.aster-page-gap__footer');
    const gapHeader = gap.locator('.aster-page-gap__header');
    expect(await clipped(gapFooter)).toBe(false);
    expect(await clipped(gapHeader)).toBe(false);
    expect((await box(gapFooter)).top).toBeGreaterThanOrEqual((await box(before)).bottom - 1);
    expect((await box(gapHeader)).bottom).toBeLessThanOrEqual((await box(after)).top + 1);

    // La mise en page du document n'est pas modifiée : seules les marges affichées le sont.
    const margins = await page.evaluate(() =>
      (window as unknown as PlaygroundWindowL54).aster?.editor.getLayout(),
    );
    expect(JSON.stringify(margins)).toContain('"topMm":12.7');
  });
});

test.describe('Variables dans les en-têtes et pieds', () => {
  test.skip(() => !test.info().project.name.startsWith('playground'), 'playground seulement');

  /** Pilote le magasin de variables du playground. */
  const variables = (
    page: Page,
    action: 'define' | 'setValues',
    payload: readonly { name: string; label?: string }[] | Record<string, string>,
  ): Promise<void> =>
    page.evaluate(
      ([method, data]) => {
        const aster = (window as unknown as PlaygroundWindowL54).aster;
        if (!aster) throw new Error('window.aster is not available: playground not mounted');
        if (method === 'define') {
          aster.editor.variables.define(data as readonly { name: string; label?: string }[]);
        } else {
          aster.editor.variables.setValues(data as Record<string, string>);
        }
      },
      [action, payload] as const,
    );

  test('insérées depuis le dialogue, affichées sur chaque page, suivies à la valeur, exportées', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(editor(page)).toBeVisible();
    await variables(page, 'define', [
      { name: 'reference', label: 'Référence du dossier' },
      { name: 'conseiller', label: 'Nom du conseiller' },
    ]);
    await setPageView(page, { layout: { page: { size: 'A4', orientation: 'portrait' } } });
    await expect(editorHost(page)).toHaveClass(/aster--page-view/);
    await setHtml(
      page,
      Array.from({ length: 60 }, (_, index) => `<p>Paragraphe ${index + 1}</p>`).join(''),
    );
    await expect.poll(() => editor(page).locator('.aster-page-gap').count()).toBeGreaterThan(0);

    // Dialogue : du texte, puis une variable choisie dans la liste, au curseur ; dans le
    // pied, une variable tapée à la main.
    await editor(page).locator('p').first().click();
    await toolbarTrigger(page, 'Mise en page').click();
    const dialog = page.locator('.aster-page-layout');
    await expect(dialog).toBeVisible();
    const header = dialog.locator('.aster-page-layout__headers-default');
    await header.click();
    await page.keyboard.type('Dossier ');
    const picker = dialog.locator('.aster-page-layout__variable');
    await expect(picker.locator('option')).toHaveText([
      'Insérer une variable…',
      'Référence du dossier ({{reference}})',
      'Nom du conseiller ({{conseiller}})',
    ]);
    await picker.selectOption('reference');
    // La puce affiche son libellé et le curseur est revenu juste après elle.
    const chip = header.locator('span[data-aster-variable="reference"]');
    await expect(chip).toHaveText('Référence du dossier');
    await expect(header).toBeFocused();
    await page.keyboard.type(' (suivi)');
    await expect(header).toHaveText('Dossier Référence du dossier (suivi)');
    const footer = dialog.locator('.aster-page-layout__footers-default');
    await footer.click();
    await page.keyboard.type('Votre conseiller : {{conseiller}}');
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();

    // La mise en page porte les puces figées du core, celles que l'export sait lire.
    const layout = await getLayout(page);
    expect(layout.headers?.default?.html).toBe(
      '<p>Dossier <span data-aster-variable="reference">{{reference}}</span> (suivi)</p>',
    );
    expect(layout.footers?.default?.html).toBe(
      '<p>Votre conseiller : <span data-aster-variable="conseiller">{{conseiller}}</span></p>',
    );

    // Vue page : libellés tant qu'il n'y a pas de valeur, sur l'hôte comme sur les coupures.
    const hostHeader = editorHost(page).locator('.aster-page-header');
    const hostFooter = editorHost(page).locator('.aster-page-footer');
    const gap = editor(page).locator('.aster-page-gap').first();
    await expect(hostHeader).toHaveText('Dossier Référence du dossier (suivi)');
    await expect(hostFooter).toHaveText('Votre conseiller : Nom du conseiller');
    await expect(gap.locator('.aster-page-gap__header')).toHaveText(
      'Dossier Référence du dossier (suivi)',
    );
    await expect(gap.locator('.aster-page-gap__footer')).toHaveText(
      'Votre conseiller : Nom du conseiller',
    );
    await expect(hostHeader.locator('.aster-variable')).toHaveClass(/aster-variable--unresolved/);

    // Une valeur arrive : toutes les pages suivent, sans rappeler setPageView.
    await variables(page, 'setValues', { reference: 'A-2026-014', conseiller: 'Camille Durand' });
    await expect(hostHeader).toHaveText('Dossier A-2026-014 (suivi)');
    await expect(hostFooter).toHaveText('Votre conseiller : Camille Durand');
    await expect(gap.locator('.aster-page-gap__header')).toHaveText('Dossier A-2026-014 (suivi)');
    await expect(gap.locator('.aster-page-gap__footer')).toHaveText(
      'Votre conseiller : Camille Durand',
    );
    await expect(hostHeader.locator('.aster-variable')).toHaveClass(/aster-variable--resolved/);

    // Rouvrir le dialogue : la puce est toujours là, avec son libellé, et rien n'est réécrit.
    await toolbarTrigger(page, 'Mise en page').click();
    await expect(dialog).toBeVisible();
    await expect(
      dialog.locator('.aster-page-layout__headers-default span[data-aster-variable]'),
    ).toHaveText('Référence du dossier');
    await dialog.getByRole('button', { name: 'Appliquer', exact: true }).click();
    await expect(dialog).toBeHidden();
    expect((await getLayout(page)).headers?.default?.html).toBe(layout.headers?.default?.html);

    // Export .docx avec les valeurs : l'en-tête et le pied portent les valeurs, pas {{nom}}.
    const exported = await page.evaluate(async () => {
      const w = window as unknown as PlaygroundWindowL54;
      if (!w.aster || !w.asterExportDocx) {
        throw new Error('window.aster / asterExportDocx indisponibles : playground non monté');
      }
      const blob = await w.asterExportDocx(w.aster.editor.getHTML(), {
        title: 'Variables',
        layout: w.aster.editor.getLayout(),
        variables: {
          mode: 'resolve',
          values: { reference: 'A-2026-014', conseiller: 'Camille Durand' },
        },
      });
      const out = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of out) binary += String.fromCharCode(byte);
      return btoa(binary);
    });
    const zip = await JSZip.loadAsync(Buffer.from(exported, 'base64'));
    const part = async (pattern: RegExp): Promise<string> => {
      const paths = Object.keys(zip.files).filter((path) => pattern.test(path));
      const texts = await Promise.all(
        paths.map(async (path) => Buffer.from(await zipPart(zip, path)).toString('utf8')),
      );
      return texts.join('\n');
    };
    const headerXml = await part(/^word\/header\d+\.xml$/);
    const footerXml = await part(/^word\/footer\d+\.xml$/);
    expect(headerXml).toContain('A-2026-014');
    expect(headerXml).not.toContain('{{reference}}');
    expect(footerXml).toContain('Camille Durand');
  });
});
