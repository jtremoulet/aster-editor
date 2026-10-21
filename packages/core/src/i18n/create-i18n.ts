import type {
  AsterDictionary,
  AsterEditor,
  AsterLocale,
  I18n,
  TranslateParams,
} from '../api/index.js';
import { en } from './en.js';
import { fr } from './fr.js';

/** Locale de repli : toute clé absente de la locale courante est cherchée ici. */
export const FALLBACK_LOCALE: AsterLocale = 'en';

const PARAM_PATTERN = /\{(\w+)\}/g;

/**
 * Remplace les `{param}` d'une chaîne par les valeurs fournies. Un paramètre absent
 * laisse le marqueur en place : plus lisible qu'un trou dans la phrase, et ça
 * révèle l'oubli en recette.
 */
export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) {
    return template;
  }
  return template.replace(PARAM_PATTERN, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/**
 * Crée le service i18n d'un éditeur. `fr` et `en` sont copiés à la création pour
 * qu'un `addTranslations` n'altère jamais les dictionnaires exportés par le paquet,
 * partagés entre instances.
 */
export function createI18n(initialLocale: AsterLocale, editor: AsterEditor): I18n {
  const dictionaries = new Map<AsterLocale, Record<string, string>>([
    ['fr', { ...fr }],
    ['en', { ...en }],
  ]);
  let locale: AsterLocale = initialLocale;

  const lookup = (key: string): string | undefined =>
    dictionaries.get(locale)?.[key] ?? dictionaries.get(FALLBACK_LOCALE)?.[key];

  return {
    getLocale: () => locale,
    setLocale(next) {
      if (next === locale) {
        return;
      }
      locale = next;
      editor.emit('localeChange', { editor, locale: next });
    },
    t: (key, params) => interpolate(lookup(key) ?? key, params),
    addTranslations(target: AsterLocale, dictionary: AsterDictionary) {
      const existing = dictionaries.get(target);
      if (existing) {
        Object.assign(existing, dictionary);
      } else {
        dictionaries.set(target, { ...dictionary });
      }
    },
    has: (key) => lookup(key) !== undefined,
  };
}
