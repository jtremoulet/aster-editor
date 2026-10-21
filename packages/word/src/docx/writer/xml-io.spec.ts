import { describe, expect, it } from 'vitest';
import { stripXmlDeclaration } from './xml-io.js';

/**
 * Chromium réémet la déclaration XML dans `XMLSerializer.serializeToString`, jsdom non :
 * sans ce garde, un `.docx` exporté dans le gabarit depuis un navigateur réel portait deux
 * déclarations en tête de `document.xml` (XML invalide). Trouvé par L29 en navigateur.
 */
describe('stripXmlDeclaration', () => {
  it('retire une déclaration en tête, avec ou sans espaces', () => {
    expect(stripXmlDeclaration('<?xml version="1.0" encoding="UTF-8"?><a/>')).toBe('<a/>');
    expect(stripXmlDeclaration('<?xml version="1.0"?>\n<a/>')).toBe('<a/>');
    expect(stripXmlDeclaration('  <?xml version="1.0" standalone="yes"?>\r\n<a/>')).toBe('<a/>');
  });

  it('laisse intact un XML sans déclaration et ne touche pas une déclaration interne', () => {
    expect(stripXmlDeclaration('<a/>')).toBe('<a/>');
    const inner = '<a><![CDATA[<?xml version="1.0"?>]]></a>';
    expect(stripXmlDeclaration(inner)).toBe(inner);
  });

  it('une déclaration d’origine suivie d’une sortie Chromium ne donne qu’une déclaration', () => {
    const declaration = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
    const chromium = '<?xml version="1.0" encoding="UTF-8"?><w:document/>';
    const written = declaration + stripXmlDeclaration(chromium);
    expect(written.match(/<\?xml/g)).toHaveLength(1);
    expect(written.endsWith('<w:document/>')).toBe(true);
  });
});
