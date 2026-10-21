import { describe, expect, it } from 'vitest';
import { normalizeGoogleDocsHtml } from '../google/normalize-google-docs-html.js';
import { normalizeWordHtml } from './normalize-word-html.js';

/**
 * Suite sécurité (W-10) : un presse-papier forgé ne doit laisser passer ni balise active,
 * ni gestionnaire `on*`, ni URL `javascript:`, quelle que soit l'option.
 */

/** Charge hostile : chaque vecteur connu, mêlé à du contenu légitime qui doit survivre. */
const HOSTILE =
  '<p class=MsoNormal>Avant <script>alert(1)</script><img src="x" onerror="alert(2)">' +
  '<a href="javascript:alert(3)">j</a><a href="JaVaScRiPt:alert(3)">k</a>' +
  '<a href="java&#9;script:alert(3)">l</a><a href="&#106;avascript:alert(3)">m</a>' +
  '<a href="vbscript:msgbox(1)">v</a><a href="data:text/html,<script>alert(1)</script>">d</a>' +
  '<iframe src="https://evil"></iframe><object data="x"></object><embed src="x">' +
  '<form action="https://evil"><input name=a onfocus="alert(4)"></form>' +
  '<template><script>alert(5)</script><img src=x onerror=alert(5)></template>' +
  '<svg onload="alert(6)"><a xlink:href="javascript:alert(6)">s</a></svg>' +
  '<math><mi href="javascript:alert(7)">m</mi></math>' +
  '<meta http-equiv="refresh" content="0;url=https://evil">' +
  '<style>body{display:none}</style><noscript><img src=x onerror=alert(8)></noscript>' +
  `<span style='color:red"onmouseover="alert(9)'>c</span>` +
  '<img src="javascript:alert(10)" alt="i"><span onclick="alert(11)">s</span>' +
  '<b onmouseover="alert(12)">g</b><u onclick="alert(13)">u</u></p>' +
  '<p onmouseover="alert(14)" class=MsoNormal>Après <a href="https://ok.io" onclick="alert(15)">ok</a></p>' +
  '<table onclick="alert(16)"><tr onclick="alert(17)"><td onclick="alert(18)"><p class=MsoNormal>t</p></td></tr></table>';

const GUID = '<b style="font-weight:normal;" id="docs-internal-guid-1234">';

/** Invariants que toute sortie du normaliseur doit respecter. */
function expectInert(out: string): void {
  expect(out).not.toMatch(/\son[a-z]+\s*=/i);
  expect(out).not.toMatch(
    /<(script|iframe|object|embed|form|input|template|svg|math|meta|link|style|noscript|frame|frameset|xml)\b/i,
  );
  expect(out).not.toMatch(/javascript:|vbscript:/i);
  expect(out).not.toMatch(/data:text\/html/i);
}

describe('durcissement du collage (W-10)', () => {
  it.each([
    ['normalizeWordHtml', (html: string): string => normalizeWordHtml(html)],
    [
      'normalizeWordHtml keepColors',
      (html: string): string => normalizeWordHtml(html, { keepColors: true }),
    ],
    [
      'normalizeGoogleDocsHtml',
      (html: string): string => normalizeGoogleDocsHtml(GUID + html + '</b>'),
    ],
    [
      'normalizeGoogleDocsHtml keepColors',
      (html: string): string => normalizeGoogleDocsHtml(GUID + html + '</b>', { keepColors: true }),
    ],
  ])('%s : aucune balise active, aucun on*, aucun javascript:', (_name, normalize) => {
    const out = normalize(HOSTILE);
    expectInert(out);
    // Le contenu légitime survit : textes, lien sûr et table.
    expect(out).toContain('Avant');
    expect(out).toContain('jklmvd');
    expect(out).toContain('<strong>g</strong><u>u</u>');
    expect(out).toContain('<p>Après <a href="https://ok.io">ok</a></p>');
    expect(out).toContain('<table><tbody><tr><td>t</td></tr></tbody></table>');
  });

  it('reste inerte sur un fragment coupé au milieu d’un vecteur', () => {
    for (const cut of [40, 120, 300, 600, 900]) {
      const truncated = `<html><body><!--StartFragment-->${HOSTILE.slice(0, cut)}`;
      expectInert(normalizeWordHtml(truncated));
      expectInert(normalizeGoogleDocsHtml(GUID + HOSTILE.slice(0, cut)));
    }
  });
});
