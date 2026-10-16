import JSZip from 'jszip';
/**
 * Harnais de test : construction de .docx minimaux et de fragments XML Word. Vit dans
 * `preprocess/` avec le code qu'il exerce ; aucune utilité en production.
 */

/** Espace de noms WordprocessingML, celui des fixtures et de Word. */
export const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

/** Enveloppe un fragment de corps dans un `document.xml` complet. */
export function documentXml(body: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    `<w:document xmlns:w="${W_NS}"><w:body>${body}</w:body></w:document>`
  );
}

/** Enveloppe des paragraphes dans un `header1.xml`. */
export function headerXml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><w:hdr xmlns:w="${W_NS}">${body}</w:hdr>`;
}

/** Run texte Word. */
export function run(text: string, rPr = ''): string {
  return `<w:r>${rPr}<w:t xml:space="preserve">${text}</w:t></w:r>`;
}

/**
 * Construit un .docx minimal lisible par mammoth et jszip : types de contenu, relation
 * racine, `document.xml`, plus les parties supplémentaires fournies (`word/header1.xml`…).
 */
export async function buildDocx(
  body: string,
  extraParts: Readonly<Record<string, string>> = {},
): Promise<ArrayBuffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
  );
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
  );
  zip.file('word/document.xml', documentXml(body));
  for (const [path, content] of Object.entries(extraParts)) zip.file(path, content);
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  const output = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(output).set(bytes);
  return output;
}
