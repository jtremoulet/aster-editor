import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ComponentFixture } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { EnvironmentProviders, Provider } from '@angular/core';
import type { AsterEditor } from '@aster-editor/core';
import { describe, expect, it, vi } from 'vitest';
import { AsterEditorComponent } from './aster-editor.component';
import { provideAster } from './provide-aster';
import { ASTER_UPLOAD_HANDLER } from './tokens';

/** Inputs posables avant le premier rendu (valeurs libres : `setInput` n'est pas typé). */
type Inputs = Partial<
  Record<
    'toolbar' | 'theme' | 'locale' | 'placeholder' | 'readonly' | 'config' | 'wordPaste',
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
 * `process.cwd()` (racine du monorepo) : `import.meta.url` n'est pas fiable ici, le builder
 * Angular rebundle les specs et l'URL change entre un run normal et un run avec couverture.
 */
async function readFixture(pathFromRoot: string): Promise<Uint8Array<ArrayBuffer>> {
  const fsModule = 'node:fs';
  const processModule = 'node:process';
  const fs = (await import(/* @vite-ignore */ fsModule)) as {
    readFileSync(path: string): Uint8Array;
  };
  const process = (await import(/* @vite-ignore */ processModule)) as { cwd(): string };
  const bytes = fs.readFileSync(`${process.cwd()}/${pathFromRoot}`);
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

  it('setDisabledState passe en lecture seule, cumulé avec l’input readonly', async () => {
    const { fixture, component, editor } = await mount();
    component.setDisabledState(true);
    expect(editor.isReadOnly()).toBe(true);
    component.setDisabledState(false);
    expect(editor.isReadOnly()).toBe(false);

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

  it('importDocx charge le module Word, remplace le contenu et émet change', async () => {
    const { component, editor } = await mount();
    const onChange = vi.fn();
    component.registerOnChange(onChange);
    const bytes = await readFixture('fixtures/docx/01-headings-lists.docx');
    const file = new File([bytes], '01.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    const result = await component.importDocx(file);
    expect(result.html).toContain('<h1>Titre principal</h1>');
    expect(editor.getHTML()).toContain('<h1>Titre principal</h1>');
    expect(editor.getHTML()).toContain('<ol>');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('importDocx rejette tant que l’éditeur n’est pas monté', async () => {
    TestBed.configureTestingModule({ imports: [AsterEditorComponent] });
    const fixture = TestBed.createComponent(AsterEditorComponent);
    await expect(fixture.componentInstance.importDocx(new File([], 'x.docx'))).rejects.toThrow(
      /not mounted/,
    );
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
