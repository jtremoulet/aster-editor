import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { FormControl, FormsModule, ReactiveFormsModule } from '@angular/forms';
import type { EnvironmentProviders, Provider } from '@angular/core';
import type { AsterEditor } from '@aster-editor/core';
import { pageViewApiOf } from '@aster-editor/ui';
import { describe, expect, it, vi } from 'vitest';
import { AsterEditorComponent } from './aster-editor.component';
import { provideAster } from './provide-aster';
import { ASTER_UPLOAD_HANDLER } from './tokens';

/** Inputs posables avant le premier rendu (valeurs libres : `setInput` n'est pas typé). */
type Inputs = Partial<
  Record<
    | 'toolbar'
    | 'theme'
    | 'locale'
    | 'placeholder'
    | 'readonly'
    | 'config'
    | 'wordPaste'
    | 'ariaLabel'
    | 'ariaLabelledBy'
    | 'variables'
    | 'variableValues'
    | 'variableResolver'
    | 'allowUnknownVariables'
    | 'variableSuggestion'
    | 'importFidelity'
    | 'exportInTemplate'
    | 'pageView'
    | 'layout',
    unknown
  >
>;

interface Mounted {
  fixture: ComponentFixture<AsterEditorComponent>;
  component: AsterEditorComponent;
  editor: AsterEditor;
}

/**
 * Lit une fixture `.docx` du dépôt. Les modules Node sont chargés par un import dynamique
 * à spécificateur variable : le tsconfig de spec Angular n'a pas les types `node`, et le
 * test tourne pourtant dans Node (environnement jsdom de Vitest). Le chemin part de
 * `process.cwd()` remonté jusqu'à la racine du monorepo (dossier contenant `fixtures/`), car
 * npm exécute le script depuis `packages/angular` et `ng` depuis la racine ; `import.meta.url`
 * n'est pas fiable ici, le builder Angular rebundle les specs et l'URL change avec la couverture.
 */
async function readFixture(pathFromRoot: string): Promise<Uint8Array<ArrayBuffer>> {
  const fsModule = 'node:fs';
  const processModule = 'node:process';
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string): Uint8Array;
    existsSync(path: string): boolean;
  };
  const process = (await import(/* @vite-ignore */ processModule)) as { cwd(): string };
  let root = process.cwd();
  for (let i = 0; i < 4 && !fs.existsSync(`${root}/fixtures`); i += 1) {
    root = `${root}/..`;
  }
  const bytes = fs.readFileSync(`${root}/${pathFromRoot}`);
  // Copie dans un ArrayBuffer dédié : le Buffer Node partage un pool, `File` veut un ArrayBuffer strict.
  return new Uint8Array(bytes);
}

/** Monte le composant seul, attend `afterNextRender`, et rend l'éditeur créé. */
async function mount(
  inputs: Inputs = {},
  providers: Array<Provider | EnvironmentProviders> = [],
): Promise<Mounted> {
  TestBed.configureTestingModule({ imports: [AsterEditorComponent], providers });
  const fixture = TestBed.createComponent(AsterEditorComponent);
  for (const [name, value] of Object.entries(inputs)) {
    fixture.componentRef.setInput(name, value);
  }
  fixture.detectChanges();
  await fixture.whenStable();
  const editor = fixture.componentInstance.editor();
  if (!editor) {
    throw new Error('editor not mounted');
  }
  return { fixture, component: fixture.componentInstance, editor };
}

function boldButton(fixture: ComponentFixture<unknown>): HTMLButtonElement | null {
  return (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>(
    'button[data-command="bold"]',
  );
}

function placeholderText(editor: AsterEditor): string | null {
  return editor.contentElement.querySelector('p')?.getAttribute('data-placeholder') ?? null;
}

/** HTML de presse-papier Word minimal, reconnu par `isWordHtml`. */
const WORD_HTML =
  '<html xmlns:w="urn:schemas-microsoft-com:office:word"><body>' +
  '<p class="MsoNormal" style="mso-margin-top-alt:auto"><b>Bonjour</b><o:p></o:p></p>' +
  '</body></html>';

describe('AsterEditorComponent', () => {
  it('monte un éditeur dans son hôte et le détruit avec le composant', async () => {
    const { fixture, component, editor } = await mount();
    const host = fixture.nativeElement as HTMLElement;
    expect(host.querySelector('.aster[data-theme="light"]')).not.toBeNull();
    expect(host.querySelector('.aster-toolbar')).not.toBeNull();
    expect(editor.isEmpty()).toBe(true);
    expect(editor.isReadOnly()).toBe(false);
    expect(editor.i18n.getLocale()).toBe('fr');
    fixture.destroy();
    expect(editor.isDestroyed()).toBe(true);
    expect(component.editor()).toBeNull();
  });

  it('émet ready avec l’éditeur une fois monté', async () => {
    TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
    const fixture = TestBed.createComponent(AsterEditorComponent);
    const ready = vi.fn();
    fixture.componentInstance.ready.subscribe(ready);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(ready).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenCalledWith(fixture.componentInstance.editor());
  });

  it('writeValue applique le HTML sans émettre change ni changed', async () => {
    const { component, editor } = await mount();
    const onChange = vi.fn();
    const changed = vi.fn();
    component.registerOnChange(onChange);
    component.changed.subscribe(changed);
    component.writeValue('<p>Salut</p>');
    expect(editor.getHTML()).toBe('<p>Salut</p>');
    component.writeValue(null);
    expect(editor.isEmpty()).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });

  it('writeValue identique au HTML courant ne réécrit rien et ne bouge pas la sélection', async () => {
    const { component, editor } = await mount();
    component.writeValue('<p>Salut</p>');
    editor.focus('end');
    const before = editor.tiptap.state.selection.from;
    const setHTML = vi.spyOn(editor, 'setHTML');
    component.writeValue('<p>Salut</p>');
    expect(setHTML).not.toHaveBeenCalled();
    expect(editor.tiptap.state.selection.from).toBe(before);
  });

  it('writeValue n’entre pas dans l’historique : undo ne restaure pas l’ancienne valeur', async () => {
    const { component, editor } = await mount();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    component.writeValue('<p>Un</p>');
    component.writeValue('<p>Deux</p>');
    expect(editor.commands.canRun('undo')).toBe(false);
    expect(editor.commands.run('undo')).toBe(false);
    expect(editor.getHTML()).toBe('<p>Deux</p>');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('writeValue(null) reçu avant le montage l’emporte sur config.content', async () => {
    TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
    const fixture = TestBed.createComponent(AsterEditorComponent);
    fixture.componentRef.setInput('config', { content: '<p>Config</p>' });
    fixture.componentInstance.writeValue(null);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.editor()?.isEmpty()).toBe(true);
  });

  it('writeValue reçu avant le montage devient le contenu initial', async () => {
    TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
    const fixture = TestBed.createComponent(AsterEditorComponent);
    const onChange = vi.fn();
    fixture.componentInstance.registerOnChange(onChange);
    fixture.componentInstance.writeValue('<h1>Avant</h1>');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.editor()?.getHTML()).toContain('<h1>Avant</h1>');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('appelle onChange et émet changed avec le HTML à la frappe', async () => {
    const { component, editor } = await mount();
    const onChange = vi.fn();
    const changed = vi.fn();
    component.registerOnChange(onChange);
    component.changed.subscribe(changed);
    editor.tiptap.commands.insertContent('x');
    expect(onChange).toHaveBeenCalledWith('<p>x</p>');
    expect(changed).toHaveBeenCalledWith('<p>x</p>');
  });

  it('appelle onTouched et émet blurred au blur, focused au focus', async () => {
    const { component, editor } = await mount();
    const onTouched = vi.fn();
    const blurred = vi.fn();
    const focused = vi.fn();
    component.registerOnTouched(onTouched);
    component.blurred.subscribe(blurred);
    component.focused.subscribe(focused);
    editor.contentElement.dispatchEvent(new FocusEvent('focus'));
    expect(focused).toHaveBeenCalledTimes(1);
    editor.contentElement.dispatchEvent(new FocusEvent('blur'));
    expect(onTouched).toHaveBeenCalledTimes(1);
    expect(blurred).toHaveBeenCalledTimes(1);
  });

  it('ignore le blur vers la toolbar mais pas vers un élément extérieur', async () => {
    const { fixture, component, editor } = await mount();
    const onTouched = vi.fn();
    const blurred = vi.fn();
    component.registerOnTouched(onTouched);
    component.blurred.subscribe(blurred);
    const bold = boldButton(fixture);
    expect(bold).not.toBeNull();
    editor.contentElement.dispatchEvent(new FocusEvent('blur', { relatedTarget: bold }));
    expect(onTouched).not.toHaveBeenCalled();
    expect(blurred).not.toHaveBeenCalled();

    const outside = document.createElement('input');
    document.body.append(outside);
    try {
      editor.contentElement.dispatchEvent(new FocusEvent('blur', { relatedTarget: outside }));
      expect(onTouched).toHaveBeenCalledTimes(1);
      expect(blurred).toHaveBeenCalledTimes(1);
    } finally {
      outside.remove();
    }
  });

  it('applique ariaLabel et ariaLabelledBy sur le contenteditable, au montage et à chaud', async () => {
    const { fixture, component, editor } = await mount({ ariaLabel: 'Corps' });
    expect(editor.contentElement.getAttribute('aria-label')).toBe('Corps');
    expect(editor.contentElement.hasAttribute('aria-labelledby')).toBe(false);

    fixture.componentRef.setInput('ariaLabel', undefined);
    fixture.componentRef.setInput('ariaLabelledBy', 'body-label');
    fixture.detectChanges();
    expect(editor.contentElement.hasAttribute('aria-label')).toBe(false);
    expect(editor.contentElement.getAttribute('aria-labelledby')).toBe('body-label');

    fixture.componentRef.setInput('toolbar', false);
    fixture.detectChanges();
    const next = component.editor();
    expect(next).not.toBe(editor);
    expect(next?.contentElement.getAttribute('aria-labelledby')).toBe('body-label');
  });

  it('setDisabledState passe en lecture seule, cumulé avec l’input readonly', async () => {
    const { fixture, component, editor } = await mount();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    component.setDisabledState(true);
    expect(editor.isReadOnly()).toBe(true);
    component.setDisabledState(false);
    expect(editor.isReadOnly()).toBe(false);
    // Passer disabled ne touche pas au document : le contrôle ne doit pas devenir dirty.
    expect(onChange).not.toHaveBeenCalled();

    fixture.componentRef.setInput('readonly', true);
    fixture.detectChanges();
    expect(editor.isReadOnly()).toBe(true);
    component.setDisabledState(true);
    component.setDisabledState(false);
    expect(editor.isReadOnly()).toBe(true);
    fixture.componentRef.setInput('readonly', false);
    fixture.detectChanges();
    expect(editor.isReadOnly()).toBe(false);
  });

  it('change le thème, la locale et le placeholder à chaud', async () => {
    const { fixture, editor } = await mount({ placeholder: 'Un' });
    const root = (fixture.nativeElement as HTMLElement).querySelector('.aster');
    expect(boldButton(fixture)?.getAttribute('aria-label')).toBe('Gras');
    expect(placeholderText(editor)).toBe('Un');

    fixture.componentRef.setInput('theme', 'night');
    fixture.componentRef.setInput('locale', 'en');
    fixture.componentRef.setInput('placeholder', 'Deux');
    fixture.detectChanges();
    expect(root?.getAttribute('data-theme')).toBe('night');
    expect(editor.i18n.getLocale()).toBe('en');
    expect(boldButton(fixture)?.getAttribute('aria-label')).toBe('Bold');
    expect(placeholderText(editor)).toBe('Deux');

    fixture.componentRef.setInput('placeholder', undefined);
    fixture.detectChanges();
    expect(placeholderText(editor)).toBe('Start writing…');
  });

  it('remonte l’éditeur en conservant le contenu quand toolbar change', async () => {
    const { fixture, component, editor } = await mount({ toolbar: 'minimal' });
    const ready = vi.fn();
    component.ready.subscribe(ready);
    editor.setHTML('<p>Conservé</p>');
    fixture.componentRef.setInput('toolbar', false);
    fixture.detectChanges();
    const next = component.editor();
    expect(next).not.toBe(editor);
    expect(editor.isDestroyed()).toBe(true);
    expect(next?.getHTML()).toBe('<p>Conservé</p>');
    expect((fixture.nativeElement as HTMLElement).querySelector('.aster-toolbar')).toBeNull();
    await fixture.whenStable();
    expect(ready).toHaveBeenCalledWith(next);
  });

  it('après remontage, la frappe appelle onChange avec la nouvelle instance', async () => {
    const { fixture, component } = await mount({ toolbar: 'minimal' });
    const onChange = vi.fn();
    const changed = vi.fn();
    component.registerOnChange(onChange);
    component.changed.subscribe(changed);
    fixture.componentRef.setInput('toolbar', 'standard');
    fixture.detectChanges();
    const next = component.editor();
    next?.tiptap.commands.insertContent('y');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('<p>y</p>');
    expect(changed).toHaveBeenCalledWith('<p>y</p>');
  });

  it('ne repasse pas autofocus au remontage', async () => {
    const { fixture, component, editor } = await mount({
      toolbar: 'minimal',
      config: { autofocus: true },
    });
    expect(editor.tiptap.options.autofocus).toBe('end');
    fixture.componentRef.setInput('toolbar', false);
    fixture.detectChanges();
    const next = component.editor();
    expect(next).not.toBe(editor);
    expect(next?.tiptap.options.autofocus).toBe(false);
  });

  it('setDisabledState(true) avant le montage survit à un changement de toolbar', async () => {
    TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
    const fixture = TestBed.createComponent(AsterEditorComponent);
    fixture.componentRef.setInput('toolbar', 'minimal');
    fixture.componentInstance.setDisabledState(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.componentInstance.editor()?.isReadOnly()).toBe(true);
    fixture.componentRef.setInput('toolbar', 'standard');
    fixture.detectChanges();
    expect(fixture.componentInstance.editor()?.isReadOnly()).toBe(true);
    fixture.componentInstance.setDisabledState(false);
    expect(fixture.componentInstance.editor()?.isReadOnly()).toBe(false);
  });

  it('fusionne provideAster, config et inputs dédiés dans cet ordre de priorité', async () => {
    const { fixture, editor } = await mount(
      { locale: 'en', config: { theme: 'night', placeholder: 'Local' } },
      [provideAster({ theme: 'light', locale: 'fr', placeholder: 'Global', toolbar: false })],
    );
    const root = (fixture.nativeElement as HTMLElement).querySelector('.aster');
    expect(root?.getAttribute('data-theme')).toBe('night');
    expect(editor.i18n.getLocale()).toBe('en');
    expect(placeholderText(editor)).toBe('Local');
    expect(root?.querySelector('.aster-toolbar')).toBeNull();
  });

  it('branche ASTER_UPLOAD_HANDLER sur l’upload d’image quand rien d’autre n’est fourni', async () => {
    const upload = vi.fn(async () => 'https://cdn.example/img.png');
    const { editor } = await mount({}, [{ provide: ASTER_UPLOAD_HANDLER, useValue: upload }]);
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'a.png', { type: 'image/png' });
    const done = new Promise<void>((resolve) => editor.on('uploadDone', () => resolve()));
    editor.commands.run('image.upload', { file });
    await done;
    expect(upload).toHaveBeenCalledWith(file);
    expect(editor.getHTML()).toContain('https://cdn.example/img.png');
  });

  it('nettoie le HTML collé depuis Word via le transformateur chargé à la demande', async () => {
    const { editor } = await mount();
    await vi.waitFor(() => {
      const out = editor.tiptap.view.someProp('transformPastedHTML', (fn) =>
        fn(WORD_HTML, editor.tiptap.view),
      );
      expect(out).not.toContain('MsoNormal');
      expect(out).toContain('Bonjour');
    });
  });

  it('laisse le collage brut quand wordPaste est faux', async () => {
    const { editor } = await mount({ wordPaste: false });
    const out = editor.tiptap.view.someProp('transformPastedHTML', (fn) =>
      fn(WORD_HTML, editor.tiptap.view),
    );
    expect(out).toContain('MsoNormal');
  });

  it('wordPaste passé de faux à vrai après le montage active le transformateur', async () => {
    const { fixture, editor } = await mount({ wordPaste: false });
    const transform = (): string | undefined =>
      editor.tiptap.view.someProp('transformPastedHTML', (fn) => fn(WORD_HTML, editor.tiptap.view));
    expect(transform()).toContain('MsoNormal');
    fixture.componentRef.setInput('wordPaste', true);
    fixture.detectChanges();
    await vi.waitFor(() => {
      expect(transform()).not.toContain('MsoNormal');
      expect(transform()).toContain('Bonjour');
    });
  });

  it('importDocx charge le module Word, remplace le contenu et émet change', async () => {
    const { component, editor } = await mount();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    const bytes = await readFixture('fixtures/docx/01-headings-lists.docx');
    const file = new File([bytes], '01.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await component.importDocx(file);
    // Import stylé par défaut : titres avec leur style Word d'origine, listes numérotées.
    expect(result.html).toMatch(/<h1[^>]*>.*Titre principal.*<\/h1>/);
    expect(editor.getHTML()).toMatch(/<h1 data-docx-style="Heading1">.*Titre principal/);
    expect(editor.getHTML()).toContain('<ol');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('importDocx détruit pendant l’import se résout sans écrire ni appeler onChange', async () => {
    const { fixture, component } = await mount();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    const bytes = await readFixture('fixtures/docx/01-headings-lists.docx');
    const file = new File([bytes], '01.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const pending = component.importDocx(file);
    fixture.destroy();
    const result = await pending;
    expect(result.html).toContain('Titre principal');
    expect(component.editor()).toBeNull();
    expect(component.importedTemplate()).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('importDocx rejette tant que l’éditeur n’est pas monté', async () => {
    TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
    const fixture = TestBed.createComponent(AsterEditorComponent);
    await expect(fixture.componentInstance.importDocx(new File([], 'x.docx'))).rejects.toThrow(
      /not mounted/,
    );
  });

  describe('variables', () => {
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    it('fusionne les inputs de variables dans les options au montage', async () => {
      const resolver = vi.fn(async (name: string) => `résolu:${name}`);
      const { editor } = await mount({
        variables: [{ name: 'client', label: 'Client' }],
        variableValues: { ville: 'Montpellier' },
        variableResolver: resolver,
        allowUnknownVariables: false,
        config: { variables: { values: { pays: 'France' } } },
      });
      expect(editor.variables.list()).toEqual([{ name: 'client', label: 'Client' }]);
      expect(editor.variables.getValues()).toEqual({ ville: 'Montpellier' });
      expect(editor.variables.insert('inconnue')).toBe(false);
      expect(editor.variables.insert('client')).toBe(true);
      editor.variables.setValues({ client: undefined });
      await expect(editor.variables.resolve()).resolves.toEqual({
        ville: 'Montpellier',
        client: 'résolu:client',
      });
      expect(resolver).toHaveBeenCalledWith('client', editor);
    });

    it('un input laissé à undefined ne masque pas config.variables', async () => {
      const { editor } = await mount({
        variableValues: { ville: 'Sète' },
        config: {
          variables: { variables: [{ name: 'pays', label: 'Pays' }], allowUnknown: false },
        },
      });
      expect(editor.variables.list()).toEqual([{ name: 'pays', label: 'Pays' }]);
      expect(editor.variables.getValues()).toEqual({ ville: 'Sète' });
      expect(editor.variables.insert('inconnue')).toBe(false);
    });

    it('applique variables et variableValues à chaud et émet variablesChanged', async () => {
      const { fixture, component, editor } = await mount({ variableValues: { a: '1' } });
      const changed = vi.fn();
      component.variablesChanged.subscribe(changed);

      fixture.componentRef.setInput('variableValues', { b: '2' });
      fixture.detectChanges();
      expect(editor.variables.getValues()).toEqual({ a: '1', b: '2' });
      expect(changed).toHaveBeenCalledWith({ a: '1', b: '2' });

      fixture.componentRef.setInput('variables', [{ name: 'c', label: 'Trois', value: '3' }]);
      fixture.detectChanges();
      expect(editor.variables.list()).toContainEqual({ name: 'c', label: 'Trois', value: '3' });
      expect(changed).toHaveBeenLastCalledWith({ a: '1', b: '2', c: '3' });
    });

    it('variableNames suit les puces du document sur change et variablesChange', async () => {
      const { component, editor } = await mount();
      expect(component.variableNames()).toEqual([]);
      editor.variables.insert('client');
      expect(component.variableNames()).toEqual(['client']);
      component.writeValue('<p><span data-aster-variable="a">{{a}}</span></p>');
      editor.variables.setValues({ a: 'x' });
      expect(component.variableNames()).toEqual(['a']);
    });

    it('getHTML délègue avec les options et resolveVariables applique le résolveur', async () => {
      const { component, editor } = await mount({
        variableResolver: async (name: string) => (name === 'ville' ? 'Nîmes' : undefined),
      });
      editor.setHTML('<p>À <span data-aster-variable="ville">{{ville}}</span></p>', false);
      expect(component.getHTML()).toContain('data-aster-variable="ville"');
      expect(component.getHTML({ variables: 'resolve' })).toContain('{{ville}}');
      await expect(component.resolveVariables()).resolves.toEqual({ ville: 'Nîmes' });
      expect(component.getHTML({ variables: 'resolve' })).toBe('<p>À Nîmes</p>');
    });

    it('getHTML avant le montage rend la valeur en attente, les autres méthodes rejettent', async () => {
      TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
      const fixture = TestBed.createComponent(AsterEditorComponent);
      const component = fixture.componentInstance;
      expect(component.getHTML()).toBe('');
      component.writeValue('<p>Attente</p>');
      expect(component.getHTML()).toBe('<p>Attente</p>');
      expect(() => component.resolveVariables()).toThrow(/not mounted/);
      await expect(component.exportDocx()).rejects.toThrow(/not mounted/);
    });

    it('exportDocx transmet les valeurs du magasin sauf si options.variables.values est fourni', async () => {
      const { component, editor } = await mount({ variableValues: { ville: 'Montpellier' } });
      editor.setHTML('<p>À <span data-aster-variable="ville">{{ville}}</span></p>', false);

      const quiet = vi.fn();
      const blob = await component.exportDocx({
        variables: { mode: 'resolve' },
        onWarning: quiet,
      });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe(DOCX_MIME);
      expect(blob.size).toBeGreaterThan(0);
      expect(quiet).not.toHaveBeenCalled();

      const warned = vi.fn();
      await component.exportDocx({ variables: { mode: 'resolve', values: {} }, onWarning: warned });
      expect(warned).toHaveBeenCalledWith(expect.objectContaining({ code: 'variable-unresolved' }));
    });

    it('importDocx déclare les variables trouvées et garde la priorité à variableValues', async () => {
      const { component, editor } = await mount({ variableValues: { lieu: 'Montpellier' } });
      const changed = vi.fn();
      component.variablesChanged.subscribe(changed);
      const bytes = await readFixture('fixtures/docx/08-variables-braces.docx');
      const file = new File([bytes], '08.docx', { type: DOCX_MIME });
      const result = await component.importDocx(file);
      expect(result.variables.map((variable) => variable.name)).toContain('client.nom');
      expect(component.variableNames()).toEqual(
        expect.arrayContaining(['client.nom', 'prestataire', 'lieu', 'date_signature']),
      );
      expect(editor.variables.list().map((variable) => variable.name)).toContain('client.nom');
      expect(editor.variables.getValues()).toEqual({ lieu: 'Montpellier' });
      expect(changed).toHaveBeenCalled();
      expect(component.getHTML({ variables: 'resolve' })).toContain('Fait à Montpellier');
    });

    it('conserve déclarations et valeurs de variables au remontage', async () => {
      const { fixture, component, editor } = await mount({
        toolbar: 'minimal',
        variables: [{ name: 'client', label: 'Client' }],
      });
      editor.variables.insert('client');
      editor.variables.setValues({ client: 'ACME', ville: 'Sète' });
      fixture.componentRef.setInput('toolbar', false);
      fixture.detectChanges();
      const next = component.editor();
      expect(next).not.toBe(editor);
      expect(next?.variables.getValues()).toEqual({ client: 'ACME', ville: 'Sète' });
      expect(next?.variables.list()).toContainEqual({
        name: 'client',
        label: 'Client',
        value: 'ACME',
      });
      expect(component.variableNames()).toEqual(['client']);
    });
  });

  describe('fidélité Word', () => {
    const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

    async function fixtureFile(name: string): Promise<File> {
      const bytes = await readFixture(`fixtures/docx/${name}`);
      return new File([bytes], name, { type: DOCX_MIME });
    }

    /** Variable CSS posée par le core sur l'hôte `.aster` quand la vue page est active. */
    function pageWidth(editor: AsterEditor): string {
      return editor.element.style.getPropertyValue('--aster-page-width');
    }

    it('importDocx stylé conserve gabarit, mise en page et objets perdus, et les applique à la vue page', async () => {
      const { component, editor } = await mount({ pageView: true });
      expect(editor.element.classList.contains('aster--page-view')).toBe(true);
      expect(pageWidth(editor)).toBe('210mm');
      expect(component.importedTemplate()).toBeNull();
      expect(component.layout()).toEqual({});
      const layoutChanged = vi.fn();
      component.layoutChanged.subscribe(layoutChanged);

      const file = await fixtureFile('16-sections.docx');
      const result = await component.importDocx(file);
      expect(component.importedTemplate()).toBe(result.template);
      expect(component.importedTemplate()?.byteLength).toBe(file.size);
      expect(component.layout()).toBe(result.layout);
      expect(component.layout()?.page?.size).toBe('Letter');
      expect(component.layout()?.page?.orientation).toBe('landscape');
      expect(component.layout()?.headers?.default?.html).toContain('Section 2');
      expect(component.lostObjects()).toEqual([]);
      expect(editor.getHTML()).toContain('data-docx-style');

      // La mise en page est appliquée à la vue page par un effet : au prochain rendu.
      TestBed.tick();
      expect(pageWidth(editor)).toBe('279.4mm');
      expect(editor.element.querySelector('.aster-page-header')?.textContent).toContain(
        'Section 2',
      );
      expect(layoutChanged).toHaveBeenCalledTimes(1);
      expect(layoutChanged).toHaveBeenCalledWith(result.layout);
    }, 20_000);

    it('importDocx liste les objets non représentables (fixture 17)', async () => {
      const { component } = await mount();
      const result = await component.importDocx(await fixtureFile('17-objets-perdus.docx'));
      expect(result.lost.length).toBeGreaterThan(0);
      expect(component.lostObjects()).toBe(result.lost);
      expect(component.lostObjects().map((lost) => lost.kind)).toContain('textbox');
    }, 20_000);

    it('importFidelity semantic passe par mammoth : mise en page vide, gabarit conservé', async () => {
      const { component, editor } = await mount({ importFidelity: 'semantic' });
      const result = await component.importDocx(await fixtureFile('13-styles-nommes.docx'));
      expect(result.layout).toEqual({});
      expect(component.layout()).toEqual({});
      expect(component.importedTemplate()).toBe(result.template);
      expect(editor.getHTML()).not.toContain('data-docx-style');
    }, 20_000);

    it('exportDocx réutilise le gabarit importé par défaut, pas avec exportInTemplate=false', async () => {
      const { fixture, component } = await mount();
      const file = await fixtureFile('13-styles-nommes.docx');
      const result = await component.importDocx(file);
      const { compareDocx } = await import('@aster-editor/word');

      const inTemplate = await component.exportDocx();
      const kept = await compareDocx(result.template, await inTemplate.arrayBuffer());
      // Export dans le gabarit : styles.xml ressort à l'octet.
      expect(kept.identicalParts).toContain('word/styles.xml');
      expect(kept.score).toBeGreaterThan(0.9);

      fixture.componentRef.setInput('exportInTemplate', false);
      fixture.detectChanges();
      const fresh = await component.exportDocx();
      const lost = await compareDocx(result.template, await fresh.arrayBuffer());
      // Export neuf : la lib `docx` réécrit ses propres styles.
      expect(lost.changedParts.some((part) => part.path === 'word/styles.xml')).toBe(true);

      // Un gabarit explicite reste honoré même avec exportInTemplate=false.
      const explicit = await component.exportDocx({ template: result.template });
      const again = await compareDocx(result.template, await explicit.arrayBuffer());
      expect(again.identicalParts).toContain('word/styles.xml');
    }, 40_000);

    it('exportDocx sans gabarit transmet la mise en page effective à l’export neuf', async () => {
      const { fixture, component, editor } = await mount({ exportInTemplate: false });
      editor.setHTML('<p>Corps</p>', false);
      fixture.componentRef.setInput('layout', {
        page: { size: 'Letter', orientation: 'landscape' },
        footers: { default: { html: '<p>Pied imposé</p>' } },
      });
      fixture.detectChanges();
      const blob = await component.exportDocx();
      const { compareDocx } = await import('@aster-editor/word');
      // Comparé à lui-même après import : le pied imposé est bien dans le document produit.
      const { importDocx } = await import('@aster-editor/word');
      const reread = await importDocx(await blob.arrayBuffer(), { fidelity: 'styled' });
      expect(reread.layout.page?.size).toBe('Letter');
      expect(reread.layout.page?.orientation).toBe('landscape');
      expect(reread.layout.footers?.default?.html).toContain('Pied imposé');
      const report = await compareDocx(await blob.arrayBuffer(), await blob.arrayBuffer());
      expect(report.score).toBe(1);
    }, 20_000);

    it('pageView active, modifie et retire la vue page à chaud, et survit au remontage', async () => {
      const { fixture, component, editor } = await mount({ toolbar: 'minimal' });
      expect(editor.element.classList.contains('aster--page-view')).toBe(false);

      fixture.componentRef.setInput('pageView', true);
      fixture.detectChanges();
      expect(editor.element.classList.contains('aster--page-view')).toBe(true);
      expect(pageWidth(editor)).toBe('210mm');

      fixture.componentRef.setInput('pageView', { layout: { page: { size: 'A5' } } });
      fixture.detectChanges();
      expect(pageWidth(editor)).toBe('148mm');

      fixture.componentRef.setInput('toolbar', false);
      fixture.detectChanges();
      const next = component.editor();
      expect(next).not.toBe(editor);
      expect(next?.element.classList.contains('aster--page-view')).toBe(true);
      expect(next && pageWidth(next)).toBe('148mm');

      fixture.componentRef.setInput('pageView', false);
      fixture.detectChanges();
      expect(next?.element.classList.contains('aster--page-view')).toBe(false);
    });

    it('config.pageView est honoré et l’input dédié prime', async () => {
      const { fixture, editor } = await mount({ config: { pageView: true } });
      expect(editor.element.classList.contains('aster--page-view')).toBe(true);
      fixture.componentRef.setInput('pageView', false);
      fixture.detectChanges();
      expect(editor.element.classList.contains('aster--page-view')).toBe(false);
    });

    it('l’input layout prime sur l’import, se répercute sur la vue page et émet layoutChanged', async () => {
      const { fixture, component, editor } = await mount({ pageView: true });
      const layoutChanged = vi.fn();
      component.layoutChanged.subscribe(layoutChanged);
      const result = await component.importDocx(await fixtureFile('16-sections.docx'));
      TestBed.tick();
      expect(pageWidth(editor)).toBe('279.4mm');

      const imposed = {
        ...result.layout,
        page: { size: 'A4', orientation: 'portrait' },
        headers: { default: { html: '<p>En-tête imposé</p>' } },
      };
      fixture.componentRef.setInput('layout', imposed);
      fixture.detectChanges();
      expect(component.layout()).toBe(imposed);
      expect(pageWidth(editor)).toBe('210mm');
      expect(editor.element.querySelector('.aster-page-header')?.textContent).toBe(
        'En-tête imposé',
      );
      expect(layoutChanged).toHaveBeenLastCalledWith(imposed);
      expect(layoutChanged).toHaveBeenCalledTimes(2);

      fixture.componentRef.setInput('layout', undefined);
      fixture.detectChanges();
      expect(component.layout()).toBe(result.layout);
      expect(pageWidth(editor)).toBe('279.4mm');
    }, 20_000);

    it('le dialogue « Mise en page » (setPageView du core) est relu : layout() suit et layoutChanged est émis', async () => {
      const { fixture, component, editor } = await mount({ pageView: true });
      const layoutChanged = vi.fn();
      component.layoutChanged.subscribe(layoutChanged);
      const api = pageViewApiOf(editor);
      expect(api).not.toBeNull();

      const fromDialog = { page: { size: 'Legal' as const, orientation: 'portrait' as const } };
      api?.setPageView({ layout: fromDialog, pagination: false });
      expect(component.layout()).toBe(fromDialog);
      fixture.detectChanges();
      expect(layoutChanged).toHaveBeenCalledTimes(1);
      expect(layoutChanged).toHaveBeenCalledWith(fromDialog);
      // Relecture sans nouvelle émission : même référence.
      fixture.detectChanges();
      expect(layoutChanged).toHaveBeenCalledTimes(1);

      // Avec un input `layout`, la vue du dialogue est signalée mais ne remplace pas l'input.
      const imposed = { page: { size: 'A5' as const } };
      fixture.componentRef.setInput('layout', imposed);
      fixture.detectChanges();
      expect(pageWidth(editor)).toBe('148mm');
      const other = { page: { size: 'A3' as const } };
      api?.setPageView({ layout: other });
      expect(component.layout()).toBe(imposed);
      expect(layoutChanged).toHaveBeenLastCalledWith(other);
      fixture.componentRef.setInput('layout', other);
      fixture.detectChanges();
      expect(component.layout()).toBe(other);
      expect(layoutChanged).toHaveBeenCalledTimes(3);

      api?.setPageView(false);
      expect(component.layout()).toBe(other);
      expect(editor.element.classList.contains('aster--page-view')).toBe(false);
    });

    it('compareWithTemplate rend null sans gabarit, puis un rapport après import', async () => {
      const { component } = await mount();
      await expect(component.compareWithTemplate()).resolves.toBeNull();
      await component.importDocx(await fixtureFile('13-styles-nommes.docx'));
      const report = await component.compareWithTemplate();
      expect(report).not.toBeNull();
      expect(report?.score).toBeGreaterThan(0.9);
      expect(report?.score).toBeLessThanOrEqual(1);
      expect(report?.identicalParts).toContain('word/styles.xml');
      expect(report?.properties.some((property) => property.group === 'text')).toBe(true);
    }, 40_000);
  });
});

@Component({
  imports: [AsterEditorComponent, ReactiveFormsModule],
  template: '<aster-editor [formControl]="control" [readonly]="readonly()" toolbar="minimal" />',
})
class HostComponent {
  readonly control = new FormControl<string>('<p>Init</p>', { nonNullable: true });
  readonly readonly = signal(false);
}

describe('AsterEditorComponent dans un reactive form', () => {
  async function mountHost(): Promise<{
    fixture: ComponentFixture<HostComponent>;
    editor: AsterEditor;
  }> {
    TestBed.configureTestingModule({ imports: [HostComponent] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const editor = fixture.debugElement.children[0]?.componentInstance as AsterEditorComponent;
    const instance = editor.editor();
    if (!instance) {
      throw new Error('editor not mounted');
    }
    return { fixture, editor: instance };
  }

  it('reflète la valeur dans les deux sens, dirty à la frappe, pristine sur setValue', async () => {
    const { fixture, editor } = await mountHost();
    const control = fixture.componentInstance.control;
    expect(editor.getHTML()).toBe('<p>Init</p>');
    expect(control.pristine).toBe(true);

    editor.tiptap.commands.insertContentAt(editor.tiptap.state.doc.content.size - 1, ' suite');
    expect(control.value).toBe('<p>Init suite</p>');
    expect(control.dirty).toBe(true);

    control.setValue('<p>Depuis le form</p>');
    expect(editor.getHTML()).toBe('<p>Depuis le form</p>');
    control.reset('<p>Reset</p>');
    expect(editor.getHTML()).toBe('<p>Reset</p>');
    expect(control.pristine).toBe(true);
  });

  it('touched au blur, disable et readonly respectés', async () => {
    const { fixture, editor } = await mountHost();
    const control = fixture.componentInstance.control;
    expect(control.touched).toBe(false);
    editor.contentElement.dispatchEvent(new FocusEvent('blur'));
    expect(control.touched).toBe(true);

    control.disable();
    expect(editor.isReadOnly()).toBe(true);
    control.enable();
    expect(editor.isReadOnly()).toBe(false);

    fixture.componentInstance.readonly.set(true);
    fixture.detectChanges();
    expect(editor.isReadOnly()).toBe(true);
    expect(editor.commands.canRun('bold')).toBe(false);
  });
});

@Component({
  imports: [AsterEditorComponent, FormsModule],
  template: '<aster-editor [(ngModel)]="value" toolbar="minimal" />',
})
class ModelHostComponent {
  value = '<p>Modèle</p>';
}

describe('AsterEditorComponent avec ngModel', () => {
  it('reflète la valeur dans les deux sens malgré l’écriture asynchrone de ngModel', async () => {
    TestBed.configureTestingModule({ imports: [ModelHostComponent] });
    const fixture = TestBed.createComponent(ModelHostComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.debugElement.children[0]?.componentInstance as AsterEditorComponent;
    const editor = component.editor();
    if (!editor) {
      throw new Error('editor not mounted');
    }
    await vi.waitFor(() => expect(editor.getHTML()).toBe('<p>Modèle</p>'));

    editor.tiptap.commands.insertContentAt(editor.tiptap.state.doc.content.size - 1, ' x');
    expect(fixture.componentInstance.value).toBe('<p>Modèle x</p>');

    fixture.componentInstance.value = '<p>Autre</p>';
    fixture.detectChanges();
    await fixture.whenStable();
    await vi.waitFor(() => expect(editor.getHTML()).toBe('<p>Autre</p>'));
  });
});
