import type { UploadHandler } from '@aster-editor/core';
import type mammothTypes from 'mammoth';
import {
  collectResultVariables,
  createVariablesPass,
  resolveDocxVariableOptions,
  variablePatterns,
} from './postprocess/variables';
import { runPostprocess } from './postprocess/run-postprocess';
import type { CollectedVariable } from './preprocess/variables';
import { preprocessVariables } from './preprocess/variables';
import { buildStyleMap } from './style-map';
import type {
  DocxImportOptions,
  DocxImportResult,
  DocxImportWarning,
  DocxInput,
  HtmlParser,
} from './types';

type Mammoth = typeof mammothTypes;
type MammothInput = Parameters<Mammoth['convertToHtml']>[0];
type MammothOptions = NonNullable<Parameters<Mammoth['convertToHtml']>[1]>;
type MammothImage = Parameters<Parameters<Mammoth['images']['imgElement']>[0]>[0];

/**
 * Vrai si l'entrée est un `File`/`Blob` (jsdom et navigateurs exposent `arrayBuffer()`).
 * Pas d'`instanceof` : en test, le `File` de jsdom et l'`ArrayBuffer` de Node vivent dans
 * des realms différents. `null` et les primitives sont écartés avant tout accès (W-4).
 */
function isBlobLike(input: unknown): input is File {
  return (
    typeof input === 'object' &&
    input !== null &&
    typeof (input as { arrayBuffer?: unknown }).arrayBuffer === 'function'
  );
}

/** Message d'une erreur quelconque, pour les avertissements et les rejets enveloppés. */
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Détection d'`ArrayBuffer` robuste aux realms (jsdom vs Node), contrairement à `instanceof`. */
function isArrayBuffer(input: unknown): input is ArrayBuffer {
  return Object.prototype.toString.call(input) === '[object ArrayBuffer]';
}

/** Les 4 premiers octets d'un .docx valide sont la signature zip `PK\x03\x04`. */
function hasZipSignature(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return (
    bytes.length === 4 &&
    bytes[0] === 0x50 &&
    bytes[1] === 0x4b &&
    bytes[2] === 0x03 &&
    bytes[3] === 0x04
  );
}

/** Erreur typée pour les entrées illisibles, message stable pour les intégrateurs. */
function invalidDocx(detail: string): Error {
  const error = new Error(`invalid-docx: ${detail}`);
  error.name = 'DocxImportError';
  return error;
}

/**
 * Charge mammoth en import dynamique : il pèse 660 kB et ne doit entrer dans le bundle
 * que si l'intégrateur importe réellement un .docx. On lit `default` car mammoth est un
 * module CommonJS (`export =`), avec repli sur l'espace de noms selon le bundler.
 */
async function loadMammoth(): Promise<Mammoth> {
  const mod = await import('mammoth');
  return mod.default ?? mod;
}

/**
 * Entrée mammoth portable. Le build navigateur (champ `browser` du package) ne lit que
 * `arrayBuffer`, le build Node (tests Vitest, SSR) ne lit que `path`/`buffer`. On
 * renseigne les deux avec le même `ArrayBuffer`, que JSZip accepte dans les deux cas.
 */
function toMammothInput(arrayBuffer: ArrayBuffer): MammothInput {
  const input: { arrayBuffer: ArrayBuffer; buffer: ArrayBuffer } = {
    arrayBuffer,
    buffer: arrayBuffer,
  };
  return input as MammothInput;
}

/** Nom de fichier passé au hook `upload`, dérivé du type MIME (`image/png` → `image-1.png`). */
function imageFileName(contentType: string, index: number): string {
  const subtype = contentType.split('/')[1] ?? 'bin';
  const extension = subtype.replace(/^x-/, '').split('+')[0] ?? 'bin';
  return `image-${String(index)}.${extension}`;
}

/** Data URL base64, comportement par défaut de mammoth (`images.dataUri`). */
async function toDataUrl(image: MammothImage): Promise<string> {
  const base64 = await image.readAsBase64String();
  return `data:${image.contentType};base64,${base64}`;
}

/**
 * Construit le convertisseur d'images : avec un hook `upload`, chaque image est lue en
 * `File`, envoyée au hook et l'URL retournée devient `src`. En cas d'échec, ou si le hook
 * résout autre chose qu'une chaîne non vide (W-5), on avertit (`image-upload-failed`)
 * et on replie en base64 pour ne jamais perdre l'image.
 */
function createImageConverter(
  mammoth: Mammoth,
  upload: UploadHandler | undefined,
  warnings: DocxImportWarning[],
): MammothOptions['convertImage'] {
  if (!upload) return mammoth.images.dataUri;
  let index = 0;
  return mammoth.images.imgElement(async (image) => {
    index += 1;
    try {
      const bytes = await image.readAsArrayBuffer();
      // Vue typée plutôt qu'ArrayBuffer brut : `File` l'accepte quel que soit le realm d'origine.
      const file = new File([new Uint8Array(bytes)], imageFileName(image.contentType, index), {
        type: image.contentType,
      });
      // Typé `unknown` : un hook JavaScript peut résoudre n'importe quoi malgré la signature.
      const url: unknown = await upload(file);
      if (typeof url !== 'string' || url.trim() === '') {
        throw new Error("le hook upload n'a pas renvoyé d'URL");
      }
      return { src: url };
    } catch (error) {
      warnings.push({
        code: 'image-upload-failed',
        message: `Upload de l'image ${String(index)} échoué, repli en base64 : ${describeError(error)}`,
      });
      try {
        return { src: await toDataUrl(image) };
      } catch {
        // Image illisible même en base64 : on la saute plutôt que de faire échouer l'import.
        warnings.push({ code: 'mammoth', message: `Image ${String(index)} illisible, ignorée` });
        return { src: '' };
      }
    }
  });
}

/**
 * Résout l'entrée en `ArrayBuffer` et valide la signature zip avant d'appeler mammoth.
 * Une vue typée est copiée sur sa seule fenêtre : un `Buffer` Node partage souvent un
 * pool bien plus large que lui (W-14).
 */
async function resolveBuffer(input: DocxInput): Promise<ArrayBuffer> {
  let buffer: ArrayBuffer;
  if (isArrayBuffer(input)) {
    buffer = input;
  } else if (ArrayBuffer.isView(input)) {
    buffer = new Uint8Array(input.buffer, input.byteOffset, input.byteLength).slice().buffer;
  } else if (isBlobLike(input)) {
    try {
      buffer = await input.arrayBuffer();
    } catch (error) {
      throw invalidDocx(`lecture du fichier impossible : ${describeError(error)}`);
    }
  } else {
    throw invalidDocx(
      "l'entrée doit être un File, un ArrayBuffer ou une vue typée (Uint8Array, Buffer)",
    );
  }
  if (!hasZipSignature(buffer)) {
    throw invalidDocx("le contenu n'est pas une archive .docx (signature zip absente)");
  }
  return buffer;
}

/** `DOMParser` injecté ou global : jamais `document`, pour rester compatible SSR et tests. */
function resolveParser(parse: HtmlParser | undefined): HtmlParser {
  if (parse) return parse;
  if (typeof DOMParser === 'undefined') {
    throw new Error('importDocx: aucun DOMParser disponible, passe `options.parse`');
  }
  return new DOMParser();
}

/**
 * Convertit un document Word (.docx) en HTML sémantique prêt pour `AsterEditor.setHTML`
 * ou `insertHTML`. Accepte un `File`, un `ArrayBuffer` ou une vue typée (`Uint8Array`,
 * `Buffer` Node). Ne lève jamais pour un document Word valide : les éléments non
 * convertis fidèlement sont signalés dans `warnings`. Rejette avec une erreur
 * `DocxImportError` (message `invalid-docx: …`) si l'entrée n'est ni l'un de ces types,
 * ni une archive .docx lisible.
 */
export async function importDocx(
  input: DocxInput,
  options: DocxImportOptions = {},
): Promise<DocxImportResult> {
  const buffer = await resolveBuffer(input);
  const parser = resolveParser(options.parse);
  const mammoth = await loadMammoth();
  const warnings: DocxImportWarning[] = [];
  const variableOptions = resolveDocxVariableOptions(options.variables);

  // Prétraitement des champs de fusion et contrôles de contenu avant mammoth. Ne doit
  // jamais faire échouer l'import : en cas d'erreur, on convertit l'archive d'origine.
  let mammothBuffer = buffer;
  let collected: ReadonlyMap<string, CollectedVariable> = new Map();
  try {
    const preprocessed = await preprocessVariables(buffer, variableOptions);
    mammothBuffer = preprocessed.buffer;
    collected = preprocessed.variables;
  } catch (error) {
    warnings.push({
      code: 'variables-preprocess-failed',
      message: `Prétraitement des variables impossible, document importé sans : ${describeError(error)}`,
    });
  }

  let raw: Awaited<ReturnType<Mammoth['convertToHtml']>>;
  try {
    raw = await mammoth.convertToHtml(toMammothInput(mammothBuffer), {
      styleMap: buildStyleMap(options.styleMap),
      convertImage: createImageConverter(mammoth, options.upload, warnings),
      ignoreEmptyParagraphs: true,
    });
  } catch (error) {
    throw invalidDocx(`mammoth n'a pas pu lire le document : ${describeError(error)}`);
  }

  for (const message of raw.messages) {
    warnings.push({ code: 'mammoth', message: `${message.type}: ${message.message}` });
  }

  const doc = parser.parseFromString(
    `<!doctype html><html><body>${raw.value}</body></html>`,
    'text/html',
  );
  const patterns = variablePatterns(variableOptions, collected);
  runPostprocess(doc, { options: { footnotes: options.footnotes !== false }, warnings }, [
    createVariablesPass(patterns, collected),
  ]);

  return { html: doc.body.innerHTML, warnings, variables: collectResultVariables(doc, collected) };
}
