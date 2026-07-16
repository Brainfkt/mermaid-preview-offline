# Mermaid Preview Offline

Ouvrez un fichier `.mmd` ou `.mermaid` et obtenez immédiatement son diagramme
dans VS Code. Aucun compte, CDN, serveur ou accès réseau n’est requis au moment
du rendu.

## Fonctionnalités

- aperçu par défaut au clic sur `.mmd` et `.mermaid` ;
- Mermaid complet embarqué dans le VSIX ;
- actualisation automatique pendant l’édition ;
- diagnostics de syntaxe visibles et actionnables ;
- source ouvrable à côté de l’aperçu ;
- zoom, ajustement, déplacement par glisser ;
- copie et export SVG ;
- thèmes clair, sombre et contraste élevé ;
- coloration syntaxique Mermaid dans l’éditeur texte ;
- aucune télémétrie.

## Installation

### VS Code Marketplace

Après publication, rechercher **Mermaid Preview Offline** dans la vue
**Extensions** de VS Code puis choisir **Install**.

### Fichier VSIX

1. Télécharger le VSIX depuis la dernière GitHub Release.
2. Dans VS Code, ouvrir **Extensions**.
3. Choisir `…` → **Install from VSIX…**.

## Utilisation

Cliquez sur un fichier `.mmd` ou `.mermaid`. L’aperçu s’ouvre comme éditeur par
défaut. Le bouton **Source** affiche le texte à côté du diagramme.

Pour revenir ponctuellement au texte seul : palette de commandes →
**Reopen Editor With…** → **Text Editor**.

### Raccourcis

| Raccourci | Action |
|---|---|
| `E` | Ouvrir la source à côté |
| `Ctrl/Cmd + 0` | Ajuster le diagramme |
| `+` / `-` | Zoom |
| `Ctrl/Cmd + molette` | Zoom précis |
| Glisser | Déplacer le canevas |

## Confidentialité et sécurité

L’extension ne déclare aucun service distant et n’ajoute aucune télémétrie. La
webview applique `connect-src 'none'`, charge uniquement les ressources du VSIX
et initialise Mermaid avec `securityLevel: strict`.

Les seules écritures hors du document sont celles déclenchées explicitement par
**Enregistrer SVG**.

## Développement

Prérequis : Node.js 22 et npm.

```bash
npm ci
npm run verify
npm run package:vsix
```

Le paquet est généré dans `artifacts/`. Pour déboguer, ouvrir le dépôt dans VS
Code et lancer **Run Mermaid Preview Offline** avec `F5`.

## Publication

La procédure GitHub Release et VS Code Marketplace est documentée dans
[`docs/PUBLISHING.md`](docs/PUBLISHING.md).

## Licence

[MIT](LICENSE)
