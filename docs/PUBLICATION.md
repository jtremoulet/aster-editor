# 📦 Publication sur npm

> Comment les quatre paquets `@aster-editor/*` arrivent sur le registre npm public, et ce que ça demande de toi une seule fois.
> Scope : `@aster-editor`. Licence MIT, paquets publics, provenance signée depuis GitHub Actions.

## 🧭 Vue d'ensemble

| Paquet                  | Publié depuis           | Dépend de                    |
| ----------------------- | ----------------------- | ---------------------------- |
| `@aster-editor/core`    | `packages/core`         | Tiptap 3 (version exacte)    |
| `@aster-editor/word`    | `packages/word`         | `core` (peer), mammoth, docx |
| `@aster-editor/ui`      | `packages/ui`           | `core` (peer), floating-ui   |
| `@aster-editor/angular` | `packages/angular/dist` | `core`, `ui`, Angular ≥ 20   |

Une seule version SemVer pour les quatre, lue à la racine. Les peer dependencies `@aster-editor/*` sont réécrites en `^<version>` par `scripts/set-version.mjs` : un paquet publié exige toujours sa propre génération.

Le paquet Angular se publie depuis la **sortie ng-packagr**, jamais depuis ses sources : `npm publish --workspaces` ne convient pas, c'est `scripts/release.mjs` qui connaît l'ordre et les dossiers.

## 🔑 Une seule fois : compte, organisation, droits

1. **Compte npm** sur [npmjs.com](https://www.npmjs.com/signup) (pseudo libre, 2FA recommandée).
2. **Organisation `aster-editor`** : menu du compte → _Add Organization_ → nom `aster-editor` → plan gratuit (_Unlimited public packages_). C'est elle qui donne le droit de publier sous `@aster-editor/*`. Si le nom est pris, choisis un autre scope et remplace `@aster-editor/` dans les quatre `package.json`, `scripts/release.mjs` et les docs.
3. **Connexion locale** : `npm login` dans un terminal, puis `npm whoami` doit répondre ton pseudo. Claude ne manipule jamais tes identifiants : ces deux commandes sont à toi.

## 🚀 Première publication (manuelle, depuis ta machine)

La publication de confiance GitHub ne peut être configurée que sur un paquet **déjà existant** sur le registre. La toute première version part donc de ta machine :

```bash
npm run check && npm run smoke:install
```

```bash
npm run release:dry
```

```bash
npm run release
```

`release:dry` simule (`npm publish --dry-run`) et affiche le contenu exact de chaque tarball. `release` publie les quatre paquets dans l'ordre, avec `--access public`, et saute ceux déjà présents dans cette version (reprise possible après un échec au milieu). Le script refuse un arbre git non commité et des versions divergentes.

Ensuite, pose le tag de la version publiée pour que l'historique et le registre coïncident :

```bash
git tag v0.4.1 && git push origin v0.4.1
```

> Ce premier tag déclenchera `release.yml`, qui constatera que tout est déjà publié et sautera chaque paquet. C'est voulu.

## 🤖 Publications suivantes (GitHub Actions, sans token)

### Configurer la publication de confiance (une fois par paquet)

Sur npmjs.com, pour chacun des quatre paquets : page du paquet → _Settings_ → _Trusted Publisher_ → _GitHub Actions_ :

| Champ             | Valeur         |
| ----------------- | -------------- |
| Organization      | `jtremoulet`   |
| Repository        | `aster-editor` |
| Workflow filename | `release.yml`  |
| Environment       | _(vide)_       |

À partir de là, le workflow s'authentifie par OIDC (`id-token: write`) : aucun `NPM_TOKEN` à stocker dans les secrets du dépôt, et chaque version porte une **attestation de provenance** visible sur sa page npm. En attendant que ce soit configuré, le job `Publish` échouera avec `ENEEDAUTH` : c'est le signal que l'étape ci-dessus manque.

### Rituel de release

1. Livrer sur `develop` avec `/ship` (check, revue, changelog, bump via `npm run version:set x.y.z`, commit, push).
2. Poser le tag sur le commit de version et le pousser :

```bash
git tag v0.5.0 && git push origin v0.5.0
```

3. Le workflow `Release npm` refait `npm run check`, `npm run build`, puis `node scripts/release.mjs --skip-build --provenance`. Il refuse un tag qui ne vaut pas `v<version du package.json>`.
4. Vérifier sur npmjs.com que les quatre paquets affichent la version et le badge de provenance.

Pour une répétition sans rien publier : onglet _Actions_ → _Release npm_ → _Run workflow_ avec `dry_run` coché. Un lancement manuel depuis une branche ne peut que simuler : le script refuse toute publication réelle en CI hors d'un tag `v<version>`.

### Pré-versions

Pour une bêta : `npm run version:set 0.5.0-beta.1`, commit, puis `node scripts/release.mjs --tag next`. Les clients l'obtiennent avec `npm install @aster-editor/core@next`, `latest` reste intact.

## 🧪 Test d'installation à blanc

Le monorepo résout ses paquets par les `paths` de `tsconfig.base.json`, jamais par de vrais `node_modules`. `npm run smoke:install` comble ce trou avant toute publication :

1. `npm pack` des quatre paquets dans un dossier temporaire hors du dépôt ;
2. installation dans un projet vierge avec les peers Angular aux versions du monorepo ;
3. résolution des `exports` (dont `@aster-editor/ui/themes/aster.css`) par Node ;
4. usage vanilla : typecheck strict puis bundle esbuild ;
5. usage Angular : composant standalone avec `<aster-editor [formControl]>` compilé par `ngc` en `strictTemplates`.

Dossier de sortie : `--out <dossier>` (défaut : `aster-smoke` dans le temporaire du système). Compte deux à trois minutes, l'essentiel dans l'installation d'Angular.

## 🧯 Si ça tourne mal

- **Mauvaise version publiée** : `npm unpublish @aster-editor/core@x.y.z` est possible pendant 72 h si personne ne dépend encore du paquet ; sinon `npm deprecate @aster-editor/core@x.y.z "message"` et publie un correctif.
- **Échec au milieu de la série** : relance `npm run release`, les paquets déjà publiés sont sautés.
- **`E403` sur un scope** : l'organisation n'existe pas ou ton compte n'en est pas membre.
- **Tarball incomplet** : `npm pack --dry-run` dans le dossier du paquet liste les fichiers ; `files` dans `package.json` décide, `README.md` et `LICENSE` sont toujours inclus.

## 📎 Ce qui est délibérément hors champ

- GitHub Packages : chaque client devrait mettre un token GitHub dans son `.npmrc`, pénible en mission.
- Registre privé Verdaccio sur Sirius : à reconsidérer seulement si une version non MIT doit exister un jour.
