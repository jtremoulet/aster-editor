import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mountEditor, type MountedEditor } from '../testing/mount';
import { AUTOSAVE_DEFAULT_INTERVAL, createAutosave, type Autosave } from './autosave';

/** Laisse les promesses de sauvegarde se résoudre sans faire avancer les minuteurs. */
const settle = async (): Promise<void> => {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
};

describe('createAutosave', () => {
  let mounted: MountedEditor;
  let onSave: ReturnType<typeof vi.fn<(html: string) => Promise<void> | void>>;
  let autosave: Autosave | null;

  beforeEach(() => {
    vi.useFakeTimers();
    mounted = mountEditor({ content: '<p>Initial</p>' });
    onSave = vi.fn<(html: string) => Promise<void> | void>();
    autosave = null;
  });

  afterEach(() => {
    autosave?.destroy();
    mounted.cleanup();
    vi.useRealTimers();
  });

  describe('mode debounce (défaut)', () => {
    it('ne sauvegarde rien sans modification, puis après le délai d’inactivité', async () => {
      autosave = createAutosave(mounted.editor, { onSave });
      vi.advanceTimersByTime(AUTOSAVE_DEFAULT_INTERVAL * 3);
      expect(onSave).not.toHaveBeenCalled();
      expect(autosave.isDirty()).toBe(false);

      mounted.editor.setHTML('<p>Un</p>');
      expect(autosave.isDirty()).toBe(true);
      vi.advanceTimersByTime(AUTOSAVE_DEFAULT_INTERVAL - 1);
      expect(onSave).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('<p>Un</p>');
      expect(autosave.isDirty()).toBe(false);
    });

    it('repousse la sauvegarde à chaque modification et ne garde que la dernière', async () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 500 });
      mounted.editor.setHTML('<p>Un</p>');
      vi.advanceTimersByTime(400);
      mounted.editor.setHTML('<p>Deux</p>');
      vi.advanceTimersByTime(400);
      expect(onSave).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onSave).toHaveBeenCalledWith('<p>Deux</p>');
    });

    it('ne sauvegarde pas si le contenu est revenu à l’état sauvegardé', async () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 100 });
      mounted.editor.setHTML('<p>Un</p>');
      mounted.editor.setHTML('<p>Initial</p>');
      vi.advanceTimersByTime(100);
      await settle();
      expect(onSave).not.toHaveBeenCalled();
      expect(autosave.isDirty()).toBe(false);
    });

    it('setHTML(html, false) ne marque pas le document sale', () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 100 });
      mounted.editor.setHTML('<p>Silencieux</p>', false);
      expect(autosave.isDirty()).toBe(false);
    });
  });

  describe('mode intervalle', () => {
    it('vérifie à période fixe et ne sauvegarde que si le contenu a changé', async () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 1000, debounce: false });
      vi.advanceTimersByTime(3000);
      expect(onSave).not.toHaveBeenCalled();
      mounted.editor.setHTML('<p>Un</p>');
      vi.advanceTimersByTime(999);
      expect(onSave).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(5000);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(1);
      mounted.editor.setHTML('<p>Deux</p>');
      vi.advanceTimersByTime(1000);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave).toHaveBeenLastCalledWith('<p>Deux</p>');
    });

    it('flush ne coupe pas la vérification périodique', async () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 1000, debounce: false });
      mounted.editor.setHTML('<p>Un</p>');
      await autosave.flush();
      expect(onSave).toHaveBeenCalledTimes(1);
      mounted.editor.setHTML('<p>Deux</p>');
      vi.advanceTimersByTime(1000);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(2);
    });
  });

  describe('flush, erreurs et destruction', () => {
    it('flush sauvegarde immédiatement et annule le minuteur en attente', async () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 1000 });
      mounted.editor.setHTML('<p>Un</p>');
      await autosave.flush();
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(autosave.isDirty()).toBe(false);
      vi.advanceTimersByTime(2000);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(1);
      // Sans modification, flush est un no-op.
      await autosave.flush();
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it('un échec de onSave laisse le document sale, flush rejette, le minuteur réessaie', async () => {
      const onError = vi.fn();
      onSave.mockRejectedValueOnce(new Error('réseau'));
      autosave = createAutosave(mounted.editor, { onSave, interval: 100, onError });
      mounted.editor.setHTML('<p>Un</p>');
      await expect(autosave.flush()).rejects.toThrow('réseau');
      expect(autosave.isDirty()).toBe(true);
      // Le minuteur du change initial a été annulé par flush : une nouvelle modification relance.
      mounted.editor.setHTML('<p>Deux</p>');
      vi.advanceTimersByTime(100);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(autosave.isDirty()).toBe(false);
      expect(onError).not.toHaveBeenCalled();
    });

    it('une erreur du minuteur est remontée à onError', async () => {
      const onError = vi.fn();
      const failure = new Error('disque');
      onSave.mockRejectedValueOnce(failure);
      autosave = createAutosave(mounted.editor, { onSave, interval: 100, onError });
      mounted.editor.setHTML('<p>Un</p>');
      vi.advanceTimersByTime(100);
      await settle();
      expect(onError).toHaveBeenCalledWith(failure);
      expect(autosave.isDirty()).toBe(true);
    });

    it('une sauvegarde en cours n’est pas doublée, la modification suivante est reprise après', async () => {
      let resolveSave: () => void = () => undefined;
      onSave.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSave = resolve;
          }),
      );
      autosave = createAutosave(mounted.editor, { onSave, interval: 100 });
      mounted.editor.setHTML('<p>Un</p>');
      vi.advanceTimersByTime(100);
      await settle();
      expect(onSave).toHaveBeenCalledTimes(1);
      mounted.editor.setHTML('<p>Deux</p>');
      const second = autosave.flush();
      expect(onSave).toHaveBeenCalledTimes(1);
      resolveSave();
      await second;
      expect(autosave.isDirty()).toBe(true);
      await autosave.flush();
      expect(onSave).toHaveBeenCalledTimes(2);
      expect(onSave).toHaveBeenLastCalledWith('<p>Deux</p>');
    });

    it('destroy arrête tout, flush devient un no-op, et la destruction de l’éditeur détruit l’autosave', async () => {
      autosave = createAutosave(mounted.editor, { onSave, interval: 100 });
      mounted.editor.setHTML('<p>Un</p>');
      autosave.destroy();
      vi.advanceTimersByTime(1000);
      await autosave.flush();
      expect(onSave).not.toHaveBeenCalled();
      autosave.destroy();

      const other = createAutosave(mounted.editor, { onSave, interval: 100 });
      mounted.editor.setHTML('<p>Deux</p>');
      mounted.editor.destroy();
      vi.advanceTimersByTime(1000);
      await settle();
      expect(onSave).not.toHaveBeenCalled();
      other.destroy();
    });
  });
});
