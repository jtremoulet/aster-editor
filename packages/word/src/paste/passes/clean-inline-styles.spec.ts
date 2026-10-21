import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare.js';
import { cleanInlineStyles } from './clean-inline-styles.js';

describe('cleanInlineStyles', () => {
  it('supprime les propriétés mso-*, polices, tailles, marges et déballe le span vide', () => {
    const html =
      "<p class=MsoNormal lang=FR style='margin-left:36pt;mso-pagination:none;line-height:115%'>" +
      '<span style=\'font-family:"Times New Roman",serif;font-size:12pt;mso-bidi-font-size:11pt;background:yellow;text-indent:1em;tab-stops:36pt\'>x</span></p>';
    expect(runPass(html, cleanInlineStyles)).toBe('<p>x</p>');
  });

  it('traduit les styles inline en balises sémantiques', () => {
    const html =
      "<span style='font-weight:bold'>g</span><span style='font-weight:700'>g7</span>" +
      "<span style='font-style:italic'>i</span><span style='text-decoration:underline'>u</span>" +
      "<span style='text-decoration:line-through'>s</span><span style='vertical-align:sub'>b</span>" +
      "<span style='vertical-align:super'>p</span><span style='mso-highlight:yellow'>m</span>";
    expect(runPass(html, cleanInlineStyles)).toBe(
      '<strong>g</strong><strong>g7</strong><em>i</em><u>u</u><s>s</s><sub>b</sub><sup>p</sup><mark>m</mark>',
    );
  });

  it('combine plusieurs styles du même span du plus externe au plus interne', () => {
    const html =
      "<span style='font-weight:bold;font-style:italic;text-decoration:underline'>x</span>";
    expect(runPass(html, cleanInlineStyles)).toBe('<strong><em><u>x</u></em></strong>');
  });

  it('ignore font-weight normal, font-style normal et text-decoration none', () => {
    const html =
      "<span style='font-weight:normal;font-style:normal;text-decoration:none;mso-highlight:none'>x</span>";
    expect(runPass(html, cleanInlineStyles)).toBe('x');
  });

  it('renomme b, i, strike, del et ins en balises sémantiques', () => {
    const html = '<b>g</b><i>i</i><strike>s</strike><del>d</del><ins>n</ins>';
    expect(runPass(html, cleanInlineStyles)).toBe(
      '<strong>g</strong><em>i</em><s>s</s><s>d</s><u>n</u>',
    );
  });

  it('ne garde la couleur qu’avec keepColors et jamais le noir par défaut', () => {
    const html =
      "<span style='color:red'>r</span><span style='color:black'>n</span><span style='color:windowtext'>w</span>";
    expect(runPass(html, cleanInlineStyles)).toBe('rnw');
    expect(runPass(html, cleanInlineStyles, { keepColors: true })).toBe(
      '<span style="color:red">r</span>nw',
    );
  });

  it('convertit <font color> en span coloré avec keepColors, sinon le déballe', () => {
    const html = '<font face="Arial" size="2" color="#ff0000">x</font>';
    expect(runPass(html, cleanInlineStyles)).toBe('x');
    expect(runPass(html, cleanInlineStyles, { keepColors: true })).toBe(
      '<span style="color:#ff0000">x</span>',
    );
  });

  it('garde text-align par défaut, y compris depuis align=, sauf left et sauf keepAlignment faux', () => {
    const html =
      "<p align=center style='text-align:center'>c</p><p align=right>r</p><p align=left>l</p>";
    expect(runPass(html, cleanInlineStyles)).toBe(
      '<p style="text-align:center">c</p><p style="text-align:right">r</p><p>l</p>',
    );
    expect(runPass(html, cleanInlineStyles, { keepAlignment: false })).toBe(
      '<p>c</p><p>r</p><p>l</p>',
    );
  });

  it('ignore couleur et soulignement des spans situés dans un lien', () => {
    const html =
      "<a href='https://x.io' name='n' style='color:blue'><span style='color:#0563C1;text-decoration:underline'>lien</span></a>";
    expect(runPass(html, cleanInlineStyles, { keepColors: true })).toBe(
      '<a href="https://x.io">lien</a>',
    );
  });

  it('conserve src, alt, width et height sur les images et jette les attributs de bloc', () => {
    const html =
      '<p width=100 height=50><img src="a.png" alt="A" width="10" height="20" v:shapes="x"></p>';
    expect(runPass(html, cleanInlineStyles)).toBe(
      '<p><img src="a.png" alt="A" width="10" height="20"></p>',
    );
  });

  it('laisse les balises de table à normalizeTables', () => {
    const html =
      "<table border=1><tr style='mso-yfti-firstrow:yes'><td width=1>x</td></tr></table>";
    expect(runPass(html, cleanInlineStyles)).toContain('mso-yfti-firstrow:yes');
    expect(runPass(html, cleanInlineStyles)).toContain('border="1"');
  });

  it('déballe les liens sans href, relatifs ou d’un schéma non autorisé, garde http(s), mailto et tel (W-10)', () => {
    const html =
      '<a href="javascript:alert(1)">j</a><a href="JaVaScRiPt:alert(1)">k</a>' +
      '<a href="java&#9;script:alert(1)">l</a><a name="_Toc1"></a><a name="_Hlk1">ancre</a>' +
      '<a href="#_Toc1">interne</a><a href="file:///C:/doc.docx">local</a><a href="">vide</a>' +
      '<a href="https://x.io">h</a><a href="mailto:a@b.c">m</a><a href="tel:+33">t</a>' +
      '<a href=" HTTP://X.IO ">maj</a>';
    expect(runPass(html, cleanInlineStyles)).toBe(
      'jklancreinternelocalvide<a href="https://x.io">h</a><a href="mailto:a@b.c">m</a>' +
        '<a href="tel:+33">t</a><a href=" HTTP://X.IO ">maj</a>',
    );
  });

  it('supprime une image dont la source est active, garde http(s), data, blob et relatif (W-10)', () => {
    const html =
      '<img src="javascript:alert(1)" alt="x"><img src="data:image/png;base64,AA" alt="d">' +
      '<img src="blob:https://x.io/1" alt="b"><img src="img/a.png" alt="r"><img src="https://x.io/a.png" alt="h">';
    expect(runPass(html, cleanInlineStyles)).toBe(
      '<img src="data:image/png;base64,AA" alt="d"><img src="blob:https://x.io/1" alt="b">' +
        '<img src="img/a.png" alt="r"><img src="https://x.io/a.png" alt="h">',
    );
  });

  it('garde data-aster-variable et data-label sur une puce collée, jette le reste (I-12)', () => {
    const html =
      '<span data-aster-variable="nom" data-label="Nom" class="aster-variable" contenteditable="false"' +
      " style='font-weight:bold;color:red'>{{nom}}</span><span data-label='orphelin' style='font-style:italic'>x</span>";
    expect(runPass(html, cleanInlineStyles, { keepColors: true })).toBe(
      '<span data-aster-variable="nom" data-label="Nom">{{nom}}</span><em>x</em>',
    );
  });

  it('ne garde avec keepColors qu’une valeur de couleur plausible (W-10)', () => {
    const hostile = `<span style='color:red"onmouseover="alert(1)'>x</span>`;
    expect(runPass(hostile, cleanInlineStyles, { keepColors: true })).toBe('x');
    const valid =
      "<span style='color:#ff0000'>a</span><span style='color: rgb(255, 0, 0) '>b</span>" +
      "<span style='color:hsla(0,100%,50%,.5)'>c</span><span style='color:expression(alert(1))'>d</span>" +
      "<span style='color:url(https://evil)'>e</span>";
    expect(runPass(valid, cleanInlineStyles, { keepColors: true })).toBe(
      '<span style="color:#ff0000">a</span><span style="color:rgb(255, 0, 0)">b</span>' +
        '<span style="color:hsla(0,100%,50%,.5)">c</span>de',
    );
  });
});
