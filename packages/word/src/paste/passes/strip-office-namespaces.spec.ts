import { describe, expect, it } from 'vitest';
import { runPass } from '../../testing/html-compare';
import { stripOfficeNamespaces } from './strip-office-namespaces';

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

  it('jette les blocs <xml>, <style>, <meta> et <link> avec leur contenu', () => {
    const html =
      '<meta charset="utf-8"><link rel="x" href="y"><style>p{}</style><xml><o:a/></xml><p>a</p>';
    expect(runPass(html, stripOfficeNamespaces)).toBe('<p>a</p>');
  });
});
