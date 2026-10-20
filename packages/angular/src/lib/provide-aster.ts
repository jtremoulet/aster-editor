import { InjectionToken, makeEnvironmentProviders } from '@angular/core';
import type { EnvironmentProviders } from '@angular/core';
import type { AsterUiOptions } from '@aster-editor/ui';

/**
 * Configuration globale des éditeurs d'une application (ou d'une route, si fournie
 * dans ses `providers`). Le composant la fusionne avec l'input `config`, qui prime,
 * puis avec les inputs dédiés (`toolbar`, `theme`, `locale`, `placeholder`, `readonly`).
 */
export const ASTER_CONFIG = new InjectionToken<Partial<AsterUiOptions>>('ASTER_CONFIG');

/**
 * Déclare la configuration globale d'Aster dans `ApplicationConfig.providers` ou dans
 * les `providers` d'une route. Fusion superficielle : une clé donnée ici est remplacée
 * en bloc par la même clé passée dans l'input `config` d'un composant.
 *
 * ```ts
 * provideAster({ locale: 'en', theme: 'night', linkPolicy: { defaultTarget: '_blank' } })
 * ```
 */
export function provideAster(config: Partial<AsterUiOptions>): EnvironmentProviders {
  return makeEnvironmentProviders([{ provide: ASTER_CONFIG, useValue: config }]);
}
