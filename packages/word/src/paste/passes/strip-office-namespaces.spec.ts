import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare.js';
import { stripOfficeNamespaces } from './strip-office-namespaces.js';

describe('stripOfficeNamespaces', () => {
  it('déballe <o:p> en gardant son texte', () => {
    expect(runPass('<p>Texte<o:p>&nbsp;</o:p></p>', stripOfficeNamespaces)).toBe(
      '<p>Texte&nbsp;</p>',
    );
  });

  it('déballe les balises w:, v: et m: imbriquées en conservant le contenu utile', () => {
    const html = '<p><w:sdt><v:shape><m:r>formule</m:r></v:shape></w:sdt></p>';
    expect(runPass(html, stripOfficeNamespaces)).toBe('<p>formule</p>');
  });

  it('jette les balises actives avec leur contenu : template, iframe, object, embed, form, noscript, frame, svg, math (W-10)', () => {
    // `<form>` est un bloc : le parseur fermerait le `<p>`, on le place après.
    const html =
      '<p>a<template><script>alert(4)</script><img src=x onerror=alert(5)></template>' +
      '<iframe src="https://evil"></iframe><object data="x"></object><embed src="x">' +
      '<noscript>n</noscript><svg onload="alert(6)"></svg><math><mi>m</mi></math>b</p>' +
      '<form action="https://evil"><input name=a></form><frameset><frame src="x"></frameset>';
    expect(runPass(html, stripOfficeNamespaces)).toBe('<p>ab</p>');
  });

  it('jette les blocs <xml>, <style>, <meta> et <link> avec leur contenu', () => {
    const html =
      '<meta charset="utf-8"><link rel="x" href="y"><style>p{}</style><xml><o:a/></xml><p>a</p>';
    expect(runPass(html, stripOfficeNamespaces)).toBe('<p>a</p>');
  });
});
