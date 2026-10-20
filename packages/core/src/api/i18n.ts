/**
 * Locale Aster. `fr` et `en` sont fournies par le core, toute autre chaîne est acceptée
 * à condition d'avoir été enregistrée via `I18n.addTranslations`.
 */
export type AsterLocale = 'fr' | 'en' | (string & {});

/** Dictionnaire plat : clé pointée → chaîne, avec interpolation `{name}`. */
export type AsterDictionary = Readonly<Record<string, string>>;

/** Paramètres d'interpolation d'une chaîne traduite. */
export type TranslateParams = Readonly<Record<string, string | number>>;

/**
 * Service de traduction attaché à un éditeur. Les paquets `ui`, `word` et `angular`
 * enregistrent leurs propres clés à l'initialisation, le core ne les connaît pas.
 *
 * Convention de clés :
 * - `command.<id>` : libellé d'une commande, ex. `command.bold`, `command.table.insert`
 * - `ui.<composant>.<clé>` : chaînes de la toolbar et des dialogues
 * - `word.<clé>` : messages d'import Word
 */
export interface I18n {
  /** Locale courante. */
  getLocale(): AsterLocale;
  /** Change la locale à chaud et émet `localeChange` sur l'éditeur. */
  setLocale(locale: AsterLocale): void;
  /**
   * Traduit une clé. Clé absente dans la locale courante → repli sur `en`,
   * puis sur la clé elle-même, jamais d'exception.
   */
  t(key: string, params?: TranslateParams): string;
  /** Ajoute ou surcharge des traductions pour une locale. Fusion superficielle. */
  addTranslations(locale: AsterLocale, dictionary: AsterDictionary): void;
  /** Vrai si la clé existe dans la locale courante ou dans le repli `en`. */
  has(key: string): boolean;
}
