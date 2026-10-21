import { afterEach, describe, expect, it } from 'vitest';
import { sanitizeHeaderFooterHtml } from '@aster-editor/core';
import { createRichField, normalizeFieldHtml, type RichField } from './rich-field.js';

/** Place le curseur (sélection réduite) dans un nœud texte à l'offset donné. */
function caretAt(node: Node, offset: number): void {
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  const selection = document.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function pressEnter(field: HTMLElement, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    key: 'Enter',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  field.dispatchEvent(event);
  return event;
}

/** Collage simulé : jsdom n'a pas de `ClipboardEvent`, un `Event` porte `clipboardData`. */
function paste(field: HTMLElement, text: string): Event {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { getData: (type: string) => (type === 'text/plain' ? text : '') },
  });
  field.dispatchEvent(event);
  return event;
}

describe('normalizeFieldHtml (L54)', () => {
  it('assainit : <script>, on* et URL dangereuses retirés, data-aster-variable conservé', () => {
    expect(normalizeFieldHtml('<p onclick="x()">Titre<script>alert(1)</script></p>')).toBe(
      '<p>Titre</p>',
    );
    expect(normalizeFieldHtml('<p><a href="javascript:x">lien</a></p>')).toBe('<p><a>lien</a></p>');
    expect(
      normalizeFieldHtml('<p><span data-aster-variable="client.nom">{{client.nom}}</span></p>'),
    ).toBe('<p><span data-aster-variable="client.nom">{{client.nom}}</span></p>');
    // Un `{{nom}}` tapé reste du texte : pas de conversion en puce dans l'éditeur minimal.
    expect(normalizeFieldHtml('<p>Bonjour {{nom}}</p>')).toBe('<p>Bonjour {{nom}}</p>');
  });

  it('normalise : div → p, b → strong, i → em, inline de premier niveau enveloppé, <br> finaux retirés', () => {
    expect(normalizeFieldHtml('<div>a<br></div>')).toBe('<p>a</p>');
    expect(normalizeFieldHtml('texte <b>g</b> et <i>it</i>')).toBe(
      '<p>texte <strong>g</strong> et <em>it</em></p>',
    );
    expect(normalizeFieldHtml('<h1>T</h1>suite<p>fin</p>')).toBe(
      '<h1>T</h1><p>suite</p><p>fin</p>',
    );
    expect(normalizeFieldHtml('<p>a<br><br></p><p><b>b</b></p>')).toBe(
      '<p>a</p><p><strong>b</strong></p>',
    );
    // Une liste ou un tableau sont des blocs conservés tels quels.
    expect(normalizeFieldHtml('<ul><li>x</li></ul>')).toBe('<ul><li>x</li></ul>');
    expect(normalizeFieldHtml('<table><tbody><tr><td>x</td></tr></tbody></table>')).toBe(
      '<table><tbody><tr><td>x</td></tr></tbody></table>',
    );
  });

  it('vide → "" (paragraphes vides, blancs, <br> seuls, <script> seul) ; une image compte', () => {
    for (const html of [
      '',
      '   ',
      '<p><br></p>',
      '<p></p><p> </p>',
      '<br>',
      '<script>x</script>',
      '<p><span style="position: fixed"></span></p>',
    ]) {
      expect(normalizeFieldHtml(html), JSON.stringify(html)).toBe('');
    }
    expect(normalizeFieldHtml('<p><img src="data:image/png;base64,AA=="></p>')).toBe(
      '<p><img src="data:image/png;base64,AA=="></p>',
    );
  });
});

describe('normalizeFieldHtml (F52)', () => {
  /** Dix formes de la revue R52 (et quelques voisines) avec la valeur normalisée attendue. */
  const FORMS: readonly (readonly [html: string, normalized: string])[] = [
    ['<div><div>Société</div></div>', '<p>Société</p>'],
    ['<div><p>Société</p></div>', '<p>Société</p>'],
    ['<div>a<p>b</p></div>', '<p>a</p><p>b</p>'],
    ['<div class="hdr"><div>Gauche</div><div>Droite</div></div>', '<p>Gauche</p><p>Droite</p>'],
    ['<td>x</td>', '<p>x</p>'],
    ['<li>x</li>', '<p>x</p>'],
    ['<tr><td>x</td></tr>', '<p>x</p>'],
    ['<ul><li>a</li></ul><li>b</li>', '<ul><li>a</li></ul><p>b</p>'],
    ['<p><div>x</div></p>', '<p>x</p>'],
    ['<div><h2>T</h2>suite</div>', '<h2>T</h2><p>suite</p>'],
    ['<p>Neuf</p><p><br></p><p>Fin</p>', '<p>Neuf</p><p></p><p>Fin</p>'],
    [
      '<p style="border-bottom: 1pt solid #000000"></p>',
      '<p style="border-bottom: 1pt solid #000000"></p>',
    ],
    ['<hr>', '<hr>'],
    ['<p>a</p><hr><p>b</p>', '<p>a</p><hr><p>b</p>'],
    ['<p>a&nbsp;b</p>', '<p>a&nbsp;b</p>'],
    [
      '<p>x</p><table><tbody><tr><td>c</td></tr></tbody></table>',
      '<p>x</p><table><tbody><tr><td>c</td></tr></tbody></table>',
    ],
  ];

  it('R52-01 : un <div> contenant un bloc est déballé, une structure nue aussi ; la valeur est un point fixe', () => {
    for (const [html, normalized] of FORMS) {
      const once = normalizeFieldHtml(html);
      expect(once, html).toBe(normalized);
      // `read → set → read` : point fixe du normaliseur et du parseur HTML.
      expect(normalizeFieldHtml(once), html).toBe(once);
      // Ce que la vue page affiche de la valeur appliquée est la valeur elle-même.
      expect(sanitizeHeaderFooterHtml(once), html).toBe(once);
      const field = createRichField({ id: 'r', label: 'r', html: once });
      expect(field.getHtml(), html).toBe(once);
    }
  });

  it('R52-02 : un bloc bordé ou à fond, un <hr> et un paragraphe vide entre deux blocs sont du contenu', () => {
    expect(normalizeFieldHtml('<p style="border-bottom: 1pt solid #000000"></p>')).not.toBe('');
    expect(normalizeFieldHtml('<p style="background-color: #eeeeee"><br></p>')).toBe(
      '<p style="background-color: #eeeeee"></p>',
    );
    expect(normalizeFieldHtml('<p><span style="border: 1px solid"></span></p>')).toBe(
      '<p><span style="border: 1px solid"></span></p>',
    );
    expect(normalizeFieldHtml('<hr>')).toBe('<hr>');
    expect(normalizeFieldHtml('<p><br></p><hr><p><br></p>')).toBe('<hr>');
    // Un paragraphe vide entre deux blocs est une ligne blanche voulue ; en tête et en
    // queue, il est retiré.
    expect(
      normalizeFieldHtml('<p><br></p><p>Neuf</p><p><br></p><p><br></p><p>Fin</p><p><br></p>'),
    ).toBe('<p>Neuf</p><p></p><p></p><p>Fin</p>');
    // Un style sans bordure ni fond ne rend pas un paragraphe vide visible.
    expect(normalizeFieldHtml('<p style="text-align: center"></p>')).toBe('');
    expect(normalizeFieldHtml('<p style="text-align: center"></p><p>x</p>')).toBe('<p>x</p>');
  });

  it('R52-04 : déclarations inherit retirées, <span> sans attribut déballé, class et style étrangers retirés', () => {
    const chromium =
      '<p>Alpha<span style="font-size: inherit; font-weight: inherit; font-family: inherit; font-style: inherit; font-variant-ligatures: inherit; font-variant-caps: inherit;">Beta</span></p>';
    expect(normalizeFieldHtml(chromium)).toBe('<p>AlphaBeta</p>');
    expect(normalizeFieldHtml('<p><span><span>x</span></span></p>')).toBe('<p>x</p>');
    expect(normalizeFieldHtml('<p class="MsoNormal"><span class="x">y</span></p>')).toBe(
      '<p>y</p>',
    );
    // Le `style` est réduit aux propriétés typographiques ; une puce ne peut plus recouvrir le dialogue.
    expect(
      normalizeFieldHtml(
        '<p><span data-aster-variable="a" style="position: fixed; top: 0; z-index: 9; color: red">v</span></p>',
      ),
    ).toBe('<p><span data-aster-variable="a" style="color: red">v</span></p>');
    expect(normalizeFieldHtml('<p style="display: none; transform: scale(9)">x</p>')).toBe(
      '<p>x</p>',
    );
    // Ce que le lecteur `.docx` écrit est conservé tel quel, ordre et valeurs compris.
    const docx =
      '<p style="text-align: center; line-height: 1.15; margin-top: 6pt; margin-bottom: 3pt; margin-left: 36pt; text-indent: -18pt; border-bottom: 1pt solid #000000; background-color: #eeeeee" data-docx-style="Normal">x</p>';
    expect(normalizeFieldHtml(docx)).toBe(docx);
    const run =
      '<p><span style="font-family: &quot;Times New Roman&quot;; font-size: 12pt; color: #ff0000; text-decoration-style: double; letter-spacing: 1pt">x</span></p>';
    expect(normalizeFieldHtml(run)).toBe(run);
    // Un `;` entre guillemets ne scinde pas la déclaration.
    expect(normalizeFieldHtml('<p style="font-family: \'a;b\'; position: fixed">x</p>')).toBe(
      '<p style="font-family: \'a;b\'">x</p>',
    );
  });
});

describe('createRichField (L54)', () => {
  let rich: RichField;
  const mount = (html: string): RichField => {
    rich = createRichField({ id: 'f', label: 'En-tête', html, placeholder: 'Aucun' });
    document.body.append(rich.wrapper);
    return rich;
  };
  const text = (field: HTMLElement, selector: string): Text => {
    const node = field.querySelector(selector)?.firstChild;
    if (!(node instanceof Text)) throw new Error(`texte attendu dans ${selector}`);
    return node;
  };

  afterEach(() => {
    rich.wrapper.remove();
    document.getSelection()?.removeAllRanges();
  });

  it('monte une zone contenteditable libellée, au contenu initial assaini', () => {
    const { field, wrapper } = mount('<p>Titre<script>alert(1)</script></p>');
    expect(field.getAttribute('contenteditable')).toBe('true');
    expect(field.getAttribute('role')).toBe('textbox');
    expect(field.getAttribute('aria-multiline')).toBe('true');
    expect(field.getAttribute('data-placeholder')).toBe('Aucun');
    expect(field.innerHTML).toBe('<p>Titre</p>');
    const label = wrapper.querySelector('label');
    expect(label?.textContent).toBe('En-tête');
    expect(field.getAttribute('aria-labelledby')).toBe(label?.id);
    label?.click();
    expect(document.activeElement).toBe(field);
    expect(rich.getHtml()).toBe('<p>Titre</p>');
  });

  it('Entrée scinde le paragraphe au curseur (et ne remonte pas au dialogue), Maj+Entrée insère un <br>', () => {
    const { field } = mount('<p>ab<strong>cd</strong></p>');
    caretAt(text(field, 'strong'), 1);
    const event = pressEnter(field);
    expect(event.defaultPrevented).toBe(true);
    expect(field.innerHTML).toBe('<p>ab<strong>c</strong></p><p><strong>d</strong></p>');
    // Le curseur est au début du nouveau paragraphe : une seconde Entrée y laisse un bloc
    // vide, qui est une ligne blanche voulue entre deux blocs (R52-02).
    pressEnter(field);
    expect(field.innerHTML).toBe('<p>ab<strong>c</strong></p><p><br></p><p><strong>d</strong></p>');
    expect(rich.getHtml()).toBe('<p>ab<strong>c</strong></p><p></p><p><strong>d</strong></p>');
    caretAt(text(field, 'p:first-child'), 1);
    pressEnter(field, true);
    expect(field.innerHTML).toBe(
      '<p>a<br>b<strong>c</strong></p><p><br></p><p><strong>d</strong></p>',
    );
  });

  it('Entrée sans sélection dans le champ ajoute un paragraphe à la fin ; champ nu enveloppé', () => {
    const { field } = mount('');
    expect(field.innerHTML).toBe('');
    pressEnter(field);
    expect(field.innerHTML).toBe('<p><br></p><p><br></p>');
    expect(rich.getHtml()).toBe('');
    document.getSelection()?.removeAllRanges();
    field.innerHTML = 'nu';
    pressEnter(field);
    expect(field.innerHTML).toBe('<p>nu</p><p><br></p>');
    // Sélection posée au niveau du champ (devant le premier bloc) : ramenée au début du bloc.
    const range = document.createRange();
    range.setStart(field, 0);
    range.collapse(true);
    document.getSelection()?.removeAllRanges();
    document.getSelection()?.addRange(range);
    pressEnter(field);
    expect(field.innerHTML).toBe('<p><br></p><p>nu</p><p><br></p>');
  });

  it('le collage insère le texte brut, un paragraphe par ligne, jamais le HTML', () => {
    const { field } = mount('<p>ab</p>');
    caretAt(text(field, 'p'), 2);
    const event = paste(field, 'un\ndeux\r\n\ntrois');
    expect(event.defaultPrevented).toBe(true);
    expect(field.innerHTML).toBe('<p>abun</p><p>deux</p><p><br></p><p>trois</p>');
    expect(rich.getHtml()).toBe('<p>abun</p><p>deux</p><p></p><p>trois</p>');
    // Champ vide : le texte collé devient le premier paragraphe.
    const empty = mount('');
    paste(empty.field, '<b>x</b>');
    expect(empty.field.innerHTML).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
    expect(empty.getHtml()).toBe('<p>&lt;b&gt;x&lt;/b&gt;</p>');
    empty.wrapper.remove();
  });

  it('F52 : un paragraphe vide reçu reste saisissable (<br>) et la valeur reste la même', () => {
    const { field } = mount('<p>Neuf</p><p></p><p>Fin</p>');
    expect(field.innerHTML).toBe('<p>Neuf</p><p><br></p><p>Fin</p>');
    expect(rich.getHtml()).toBe('<p>Neuf</p><p></p><p>Fin</p>');
    // Un paragraphe « filet » n'a pas besoin de `<br>` : sa bordure le rend visible, mais il
    // reste saisissable aussi.
    const ruled = mount('<p style="border-bottom: 1pt solid #000"></p>');
    expect(ruled.field.innerHTML).toBe('<p style="border-bottom: 1pt solid #000"><br></p>');
    expect(ruled.getHtml()).toBe('<p style="border-bottom: 1pt solid #000"></p>');
    ruled.wrapper.remove();
  });

  it('F52 : isModified passe à vrai sur input, keydown ou paste, jamais sur une lecture', () => {
    const untouched = mount('<p>a</p>');
    expect(untouched.isModified()).toBe(false);
    untouched.getHtml();
    expect(untouched.isModified()).toBe(false);
    untouched.field.dispatchEvent(new Event('input', { bubbles: true }));
    expect(untouched.isModified()).toBe(true);
    untouched.wrapper.remove();
    const typed = mount('<p>a</p>');
    typed.field.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(typed.isModified()).toBe(true);
    typed.wrapper.remove();
    const pasted = mount('<p>a</p>');
    paste(pasted.field, 'b');
    expect(pasted.isModified()).toBe(true);
  });
});
