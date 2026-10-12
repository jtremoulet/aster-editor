# ✳️ Aster Editor

> Éditeur de texte riche **MIT**, framework-agnostic, avec wrapper Angular et import Word de qualité.
> Alternative libre à CKEditor, pensée pour être embarquée telle quelle dans des apps clientes.

🚧 **En construction** — V1 en cours de développement. Voir [`docs/ROADMAP_NUIT.md`](./docs/ROADMAP_NUIT.md).

## 🧩 Paquets

| Paquet | Rôle |
|--------|------|
| `@aster-editor/core` | Moteur sur Tiptap 3 / ProseMirror, registre de commandes, i18n |
| `@aster-editor/word` | Import `.docx` et nettoyage du collage depuis Word et Google Docs |
| `@aster-editor/ui` | Toolbar vanilla, thèmes `light` et `night` |
| `@aster-editor/angular` | Composant standalone `<aster-editor>`, reactive forms, signals |

## 🚀 Quick start Angular

```ts
import { AsterEditorComponent } from '@aster-editor/angular';

@Component({
  imports: [AsterEditorComponent, ReactiveFormsModule],
  template: `<aster-editor [formControl]="body" toolbar="full" theme="night" />`,
})
export class ArticleFormComponent {
  body = new FormControl('<p>Bonjour</p>');
}
```

## 📚 Documentation

- [Cahier des charges](./docs/CAHIER_DES_CHARGES.md)
- [Architecture](./docs/ARCHITECTURE.md)
- [Stratégie de tests](./docs/STRATEGIE_TESTS.md)
- [Instructions Claude](./CLAUDE.md)

## 🛠️ Développement

```bash
npm install
npm run check     # lint + typecheck + tests
npm run demo      # playground Angular sur http://localhost:4200
```

## ⚖️ Licence

MIT © Joris Tremoulet
