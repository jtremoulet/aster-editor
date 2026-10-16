import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEditor, type MountedEditor } from '../testing/mount';
import { getMarkdown, htmlToMarkdown, markdownToHtml, setMarkdown } from './index';
import { escapeHtml, parseInline } from './markdown-to-html';

/**
 * Document complet pour l'aller-retour : chaque famille de nœud et de marque que
 * Markdown sait représenter y figure une fois.
 */
const FULL_DOCUMENT =
  '<h1>Titre</h1>' +
  '<h2>Sous-titre</h2>' +
  '<p>Du <strong>gras</strong>, de l’<em>italique</em>, du <s>barré</s>, du <mark>surligné</mark> et du <code>code</code>.</p>' +
  '<p>Souligné <u>ici</u>, H<sub>2</sub>O et x<sup>2</sup>.</p>' +
  '<ul><li><p>Un</p><ul><li><p>Un.a</p></li><li><p>Un.b</p></li></ul></li><li><p>Deux</p></li></ul>' +
  '<ol start="3"><li><p>Trois</p></li><li><p>Quatre</p></li></ol>' +
  '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Fait</p></li>' +
  '<li data-type="taskItem" data-checked="false"><p>À faire</p></li></ul>' +
  '<blockquote><p>Citation</p><p>Suite</p></blockquote>' +
  '<pre><code class="language-ts">const a = 1;\nif (a &lt; 2) {}</code></pre>' +
  '<hr>' +
  '<p>Ligne une<br>ligne deux</p>' +
  '<p><a href="https://example.com" title="Ex">lien</a> et <a href="https://example.com/b">autre</a></p>' +
  '<img src="https://example.com/i.png" alt="Alt" title="Titre">' +
  '<table><tbody><tr><th><p>En-tête</p></th><th><p>Colonne</p></th></tr>' +
  '<tr><td><p>a</p></td><td><p>b | c</p></td></tr></tbody></table>';

describe('htmlToMarkdown', () => {
  it('convertit titres, marques et paragraphes', () => {
    expect(
      htmlToMarkdown(
        '<h1>T</h1><h3>S</h3><p>Du <strong>gras</strong>, <em>it</em>, <s>b</s>, <mark>m</mark>, <code>c</code>.</p>',
      ),
    ).toBe('# T\n\n### S\n\nDu **gras**, *it*, ~~b~~, ==m==, `c`.');
  });

  it('conserve souligné, indice, exposant et styles en HTML inline', () => {
    expect(
      htmlToMarkdown(
        '<p><u>u</u> H<sub>2</sub>O x<sup>2</sup> <span style="color: red">r</span></p>',
      ),
    ).toBe('<u>u</u> H<sub>2</sub>O x<sup>2</sup> <span style="color: red">r</span>');
  });

  it('indente les listes imbriquées, numérote depuis start et marque les tâches', () => {
    const html =
      '<ul><li><p>Un</p><ol start="2"><li><p>Deux</p></li></ol></li></ul>' +
      '<ul data-type="taskList"><li data-type="taskItem" data-checked="true">' +
      '<label><input type="checkbox" checked><span></span></label><div><p>Fait</p></div></li>' +
      '<li data-type="taskItem" data-checked="false"><div><p>Pas fait</p></div></li></ul>';
    expect(htmlToMarkdown(html)).toBe(
      ['- Un', '', '  2. Deux', '', '- [x] Fait', '- [ ] Pas fait'].join('\n'),
    );
  });

  it('préfixe les citations, clôture les blocs de code avec leur langage, règle et image', () => {
    const html =
      '<blockquote><p>A</p><p>B</p></blockquote>' +
      '<pre><code class="language-js">let x = "`";\n</code></pre>' +
      '<hr><img src="/i.png" alt="A [b]" title="T">';
    expect(htmlToMarkdown(html)).toBe(
      [
        '> A',
        '>',
        '> B',
        '',
        '```js',
        'let x = "`";',
        '```',
        '',
        '---',
        '',
        '![A \\[b\\]](/i.png "T")',
      ].join('\n'),
    );
  });

  it('produit une table GFM avec cellules sur une ligne et barres échappées', () => {
    const html =
      '<table><tbody><tr><th><p>H1</p></th><th><p>H2</p></th></tr>' +
      '<tr><td><p>a<br>b</p></td><td><p>c | d</p></td></tr><tr><td><p>seul</p></td></tr></tbody></table>';
    expect(htmlToMarkdown(html)).toBe(
      ['| H1 | H2 |', '| --- | --- |', '| a<br>b | c \\| d |', '| seul |  |'].join('\n'),
    );
  });

  it('échappe la ponctuation significative et les débuts de bloc ambigus', () => {
    expect(htmlToMarkdown('<p>1. pas une liste</p><p>a*b_c [d] &lt;e&gt; ==f== `g`</p>')).toBe(
      '\\1. pas une liste\n\na\\*b\\_c \\[d\\] \\<e\\> \\=\\=f\\=\\= \\`g\\`',
    );
    expect(htmlToMarkdown('<p><code>a ` b</code></p>')).toBe('``a ` b``');
  });

  it('ignore les paragraphes vides, les liens gardent leur titre, les sauts de ligne deviennent durs', () => {
    expect(
      htmlToMarkdown(
        '<p></p><p>a<br>b</p><p><a href="/x" title="T &quot;q&quot;">l</a></p><p></p>',
      ),
    ).toBe('a  \nb\n\n[l](/x "T \\"q\\"")');
  });

  it('accepte un parseur injecté', () => {
    const parse = vi.fn((html: string) => {
      const div = document.createElement('div');
      div.innerHTML = html;
      return div;
    });
    expect(htmlToMarkdown('<p>x</p>', parse)).toBe('x');
    expect(parse).toHaveBeenCalledWith('<p>x</p>');
  });

  it('retourne une chaîne vide sans contenu', () => {
    expect(htmlToMarkdown('')).toBe('');
    expect(htmlToMarkdown('<p></p>')).toBe('');
  });
});

describe('markdownToHtml', () => {
  it('convertit titres, paragraphes et marques inline', () => {
    expect(markdownToHtml('# T\n\nDu **gras**, *it*, __g2__, _it2_, ~~b~~, ==m==, `c`.')).toBe(
      '<h1>T</h1><p>Du <strong>gras</strong>, <em>it</em>, <strong>g2</strong>, <em>it2</em>, <s>b</s>, <mark>m</mark>, <code>c</code>.</p>',
    );
  });

  it('regroupe les lignes d’un paragraphe et honore les sauts durs', () => {
    expect(markdownToHtml('a\nb  \nc\\\nd')).toBe('<p>a b<br>c<br>d</p>');
  });

  it('rend nue une image seule sur son paragraphe (bloc dans le schéma)', () => {
    expect(markdownToHtml('![a](/i.png)\n\ntexte ![b](/j.png)')).toBe(
      '<img src="/i.png" alt="a"><p>texte <img src="/j.png" alt="b"></p>',
    );
  });

  it('reconstruit des listes imbriquées, numérotées et de tâches', () => {
    expect(
      markdownToHtml('- Un\n  - Un.a\n- Deux\n\n3. Trois\n4. Quatre\n\n- [x] Fait\n- [ ] Non'),
    ).toBe(
      '<ul><li><p>Un</p><ul><li><p>Un.a</p></li></ul></li><li><p>Deux</p></li></ul>' +
        '<ol start="3"><li><p>Trois</p></li><li><p>Quatre</p></li></ol>' +
        '<ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>Fait</p></li>' +
        '<li data-type="taskItem" data-checked="false"><p>Non</p></li></ul>',
    );
  });

  it('gère citations, blocs de code (contenu échappé), règles et tables', () => {
    expect(
      markdownToHtml(
        '> A\n>\n> B\n\n```ts\nif (a < b) {}\n```\n\n---\n\n| H | I |\n| --- | --- |\n| a \\| b | c |',
      ),
    ).toBe(
      '<blockquote><p>A</p><p>B</p></blockquote>' +
        '<pre><code class="language-ts">if (a &lt; b) {}</code></pre><hr>' +
        '<table><tbody><tr><th><p>H</p></th><th><p>I</p></th></tr><tr><td><p>a | b</p></td><td><p>c</p></td></tr></tbody></table>',
    );
  });

  it('rend liens, images, autoliens et titres', () => {
    expect(markdownToHtml('[l](https://x.io "T") ![a](/i.png) <https://y.io>')).toBe(
      '<p><a href="https://x.io" title="T">l</a> <img src="/i.png" alt="a"> <a href="https://y.io">https://y.io</a></p>',
    );
  });

  it('laisse passer le HTML inline autorisé et échappe le reste', () => {
    expect(
      markdownToHtml(
        '<u>u</u> <sub>s</sub> <span style="color: red">r</span><br> <script>x</script> a & b &amp; c',
      ),
    ).toBe(
      '<p><u>u</u> <sub>s</sub> <span style="color: red">r</span><br> &lt;script&gt;x&lt;/script&gt; a &amp; b &amp; c</p>',
    );
  });

  it('respecte les échappements et les délimiteurs non fermés', () => {
    expect(markdownToHtml('\\*pas italique\\* 2 * 3 * 4 a_b_c `non fermé')).toBe(
      '<p>*pas italique* 2 * 3 * 4 a_b_c `non fermé</p>',
    );
  });

  it('une ligne vide ou un document vide ne produisent rien', () => {
    expect(markdownToHtml('')).toBe('');
    expect(markdownToHtml('\n\n  \n')).toBe('');
  });

  it('expose escapeHtml et parseInline', () => {
    expect(escapeHtml('<a href="x">&</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&lt;/a&gt;');
    expect(parseInline('**a**')).toBe('<strong>a</strong>');
  });
});

describe('variables de document', () => {
  const CHIP = '<span data-aster-variable="client_nom" data-label="Client">{{client_nom}}</span>';

  it('htmlToMarkdown rend une puce en {{nom}}, sans échapper le nom', () => {
    expect(htmlToMarkdown(`<p>Bonjour ${CHIP} !</p>`)).toBe('Bonjour {{client_nom}} !');
    expect(
      htmlToMarkdown(
        `<h1>${CHIP}</h1><table><tbody><tr><td><p>${CHIP}</p></td></tr></tbody></table>`,
      ),
    ).toBe('# {{client_nom}}\n\n| {{client_nom}} |\n| --- |');
  });

  it('markdownToHtml laisse {{nom}} en texte, même avec des _ dans le nom', () => {
    expect(markdownToHtml('Bonjour {{client_nom}} !')).toBe('<p>Bonjour {{client_nom}} !</p>');
    expect(markdownToHtml('{{_a_b}} et {{x}}')).toBe('<p>{{_a_b}} et {{x}}</p>');
    // Un nom invalide suit les règles Markdown habituelles.
    expect(parseInline('{{a b}}')).toBe('{{a b}}');
  });

  it('l’aller-retour éditeur garde {{nom}} en texte : la puce se crée par saisie ou via word', () => {
    const mounted = mountEditor({ content: `<p>Bonjour ${CHIP} !</p>` });
    const markdown = getMarkdown(mounted.editor);
    expect(markdown).toBe('Bonjour {{client_nom}} !');
    setMarkdown(mounted.editor, markdown);
    expect(mounted.editor.getHTML()).toBe('<p>Bonjour {{client_nom}} !</p>');
    mounted.cleanup();
  });
});

describe('getMarkdown / setMarkdown', () => {
  let mounted: MountedEditor;

  beforeEach(() => {
    mounted = mountEditor({ content: '<p>Bonjour</p>' });
  });

  afterEach(() => {
    mounted.cleanup();
  });

  it('fait l’aller-retour sur un document complet sans perte', () => {
    mounted.editor.setHTML(FULL_DOCUMENT);
    const reference = mounted.editor.getHTML();
    const markdown = getMarkdown(mounted.editor);
    expect(markdown).toContain('# Titre');
    expect(markdown).toContain('- [x] Fait');
    expect(markdown).toContain('| En-tête | Colonne |');
    setMarkdown(mounted.editor, markdown);
    expect(mounted.editor.getHTML()).toBe(reference);
    // Second passage : le Markdown lui-même est stable.
    expect(getMarkdown(mounted.editor)).toBe(markdown);
  });

  it('setMarkdown émet change par défaut, pas avec emit=false', () => {
    const change = vi.fn();
    mounted.editor.on('change', change);
    setMarkdown(mounted.editor, '# Salut');
    expect(change).toHaveBeenCalledTimes(1);
    expect(mounted.editor.getHTML()).toMatch(/^<h1>Salut<\/h1>/);
    setMarkdown(mounted.editor, 'texte', false);
    expect(change).toHaveBeenCalledTimes(1);
    expect(mounted.editor.getText()).toBe('texte');
  });
});
