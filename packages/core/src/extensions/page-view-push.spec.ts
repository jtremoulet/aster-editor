import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SectionLayout } from '../api/index.js';
import {
  createDomHeaderFooterMeasure,
  pushPageMetrics,
  type HeaderFooterMeasure,
} from './page-view-push.js';
import { displayedPageMetrics, resolvePageMetrics } from './page-view.js';

/**
 * Mesure factice : la hauteur en mm est écrite dans le texte (`<p>h=30</p>`), qui traverse
 * l'assainissement (un attribut `data-*` serait retiré).
 */
const fakeMeasure: HeaderFooterMeasure = (_kind, html) => Number(/h=([\d.]+)/.exec(html)?.[1] ?? 0);

const html = (heightMm: number): { html: string } => ({ html: `<p>h=${heightMm}</p>` });

describe('pushPageMetrics', () => {
  const metrics = resolvePageMetrics({}); // A4, marges 25,4 mm, en-tête et pied à 12,7 mm

  it('ne change rien sans en-tête ni pied, ou quand ils tiennent dans la marge', () => {
    expect(pushPageMetrics(metrics, {}, fakeMeasure)).toBe(metrics);
    const section: SectionLayout = {
      headers: { default: html(12.7) },
      footers: { default: html(5) },
    };
    expect(pushPageMetrics(metrics, section, fakeMeasure)).toBe(metrics);
  });

  it('un en-tête plus haut que la marge pousse le corps : marge haute = distance + hauteur', () => {
    const pushed = pushPageMetrics(metrics, { headers: { default: html(30) } }, fakeMeasure);
    expect(pushed.marginTopMm).toBeCloseTo(42.7);
    expect(pushed.marginBottomMm).toBe(metrics.marginBottomMm);
    expect(pushed.marginHeaderMm).toBe(metrics.marginHeaderMm);
  });

  it('même règle pour le pied et la marge basse', () => {
    const pushed = pushPageMetrics(metrics, { footers: { default: html(20) } }, fakeMeasure);
    expect(pushed.marginBottomMm).toBeCloseTo(32.7);
    expect(pushed.marginTopMm).toBe(metrics.marginTopMm);
  });

  it('cas Word du retour n° 4 : marge haute égale à la distance d’en-tête, une ligne d’en-tête', () => {
    const tight = resolvePageMetrics({ page: { margins: { topMm: 12.7, headerMm: 12.49 } } });
    const pushed = pushPageMetrics(tight, { headers: { default: html(4.5) } }, fakeMeasure);
    expect(pushed.marginTopMm).toBeCloseTo(16.99);
  });

  it('prend la plus haute des variantes ; first ne compte que si la section est titlePage', () => {
    const headers = { default: html(10), first: html(40), even: html(20) };
    expect(pushPageMetrics(metrics, { headers }, fakeMeasure).marginTopMm).toBeCloseTo(32.7);
    expect(
      pushPageMetrics(metrics, { headers, titlePage: true }, fakeMeasure).marginTopMm,
    ).toBeCloseTo(52.7);
  });

  it('borne la marge poussée à 40 % de la hauteur de page, sans jamais la réduire', () => {
    const pushed = pushPageMetrics(metrics, { headers: { default: html(500) } }, fakeMeasure);
    expect(pushed.marginTopMm).toBeCloseTo(297 * 0.4);
    const huge = resolvePageMetrics({ page: { margins: { topMm: 150 } } });
    expect(
      pushPageMetrics(huge, { headers: { default: html(500) } }, fakeMeasure).marginTopMm,
    ).toBe(150);
  });

  it('mesure à la largeur utile de la page et ignore une mesure non finie', () => {
    const measure = vi.fn<HeaderFooterMeasure>(() => Number.NaN);
    expect(pushPageMetrics(metrics, { headers: { default: html(1) } }, measure)).toBe(metrics);
    expect(measure).toHaveBeenCalledWith('headers', expect.any(String), 210 - 2 * 25.4);
  });
});

describe('mesure dans le DOM', () => {
  const host = document.createElement('div');
  document.body.append(host);
  const classNames = { headers: 'aster-page-header', footers: 'aster-page-footer' };

  afterEach(() => {
    vi.restoreAllMocks();
    host.replaceChildren();
  });

  it('pose un témoin invisible à la bonne largeur, le retire, et garde la mesure en cache', () => {
    const probes: HTMLElement[] = [];
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        probes.push(this);
        expect(this.parentElement).toBe(host);
        return new DOMRect(0, 0, 600, 96);
      });
    const measure = createDomHeaderFooterMeasure(host, classNames);
    // 96 px = 25,4 mm.
    expect(measure('headers', '<p>En-tête</p>', 159.2)).toBeCloseTo(25.4);
    const probe = probes[0];
    expect(probe?.className).toBe('aster-page-header');
    expect(probe?.style.width).toBe('159.2mm');
    expect(probe?.style.visibility).toBe('hidden');
    expect(probe?.style.maxHeight).toBe('none');
    expect(host.childElementCount).toBe(0);
    expect(measure('headers', '<p>En-tête</p>', 159.2)).toBeCloseTo(25.4);
    expect(rect).toHaveBeenCalledTimes(1);
    measure('footers', '<p>En-tête</p>', 159.2);
    expect(rect).toHaveBeenCalledTimes(2);
  });

  it('quand toutes les images ont fini de charger, le même témoin est remesuré et l’appelant prévenu une fois', () => {
    const images: HTMLImageElement[] = [];
    let height = 10;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (images.length === 0) images.push(...Array.from(this.querySelectorAll('img')));
        return new DOMRect(0, 0, 600, height);
      });
    const onInvalidate = vi.fn();
    const other = document.createElement('div');
    document.body.append(other);
    const measure = createDomHeaderFooterMeasure(other, classNames, onInvalidate);
    const markup = '<p><img src="a.png"><img src="b.png"></p>';
    const before = measure('headers', markup, 100);
    expect(images.length).toBe(2);
    // Le logo a chargé : l'en-tête est plus haut.
    height = 96;
    images[0]?.dispatchEvent(new Event('load'));
    expect(onInvalidate).not.toHaveBeenCalled();
    images[1]?.dispatchEvent(new Event('error'));
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    // La nouvelle hauteur est en cache : pas de nouveau témoin, pas de boucle.
    const calls = rect.mock.calls.length;
    expect(measure('headers', markup, 100)).toBeCloseTo(25.4);
    expect(measure('headers', markup, 100)).toBeGreaterThan(before);
    expect(rect.mock.calls.length).toBe(calls);
    expect(other.childElementCount).toBe(0);
    other.remove();
  });

  it('une hauteur nulle (hôte masqué) n’est pas mise en cache : la demande suivante remesure', () => {
    let height = 0;
    const rect = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(() => new DOMRect(0, 0, 600, height));
    const hidden = document.createElement('div');
    const measure = createDomHeaderFooterMeasure(hidden, classNames);
    expect(measure('headers', '<p>x</p>', 100)).toBe(0);
    height = 48;
    expect(measure('headers', '<p>x</p>', 100)).toBeCloseTo(12.7);
    expect(rect).toHaveBeenCalledTimes(2);
  });

  it('displayedPageMetrics : sans moteur de rendu (hauteur 0), sans hôte ou sans en-têtes affichés, les marges du document', () => {
    const section: SectionLayout = { headers: { default: { html: '<p>a</p><p>b</p><p>c</p>' } } };
    const expected = resolvePageMetrics(section);
    expect(displayedPageMetrics(host, section, {})).toEqual(expected);
    expect(displayedPageMetrics(null, section, {})).toEqual(expected);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
      new DOMRect(0, 0, 600, 200),
    );
    expect(displayedPageMetrics(host, section, { showHeadersFooters: false })).toEqual(expected);
    const fresh = document.createElement('div');
    expect(displayedPageMetrics(fresh, section, {}).marginTopMm).toBeGreaterThan(
      expected.marginTopMm,
    );
  });
});
