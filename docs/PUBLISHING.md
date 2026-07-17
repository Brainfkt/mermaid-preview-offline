# Publier Mermaid Preview Offline

## Préconditions

- accès administrateur au dépôt GitHub ;
- compte Microsoft/Azure DevOps ;
- publisher créé dans le
  [gestionnaire Visual Studio Marketplace](https://marketplace.visualstudio.com/manage/publishers/) ;
- publisher identique au champ `publisher` de `package.json` ;
- secret GitHub `VSCE_PAT` avec le scope Marketplace `Manage` si la publication
  automatisée par PAT est utilisée.

Le publisher confirmé et inscrit dans le manifeste est `brainfkt`. Pour le
remplacer dans un fork ou une nouvelle distribution :

```bash
npm run configure:publisher -- mon-publisher
npm run verify
```

L’identifiant Marketplace est définitif après création. Le choisir avec soin.

## Première publication recommandée

1. Exécuter `npm ci && npm run verify && npm run test:visual && npm run package:vsix`.
2. Installer `artifacts/mermaid-preview-offline-<version>.vsix` dans un profil
   VS Code de test.
3. Créer ou sélectionner le publisher dans le gestionnaire Marketplace.
4. Utiliser **New extension** → **Visual Studio Code** et téléverser le VSIX.
5. Vérifier la fiche, la licence, le README, les catégories et l’installation.

Cette première publication manuelle évite de stocker un jeton avant que
l’identité et la fiche Marketplace soient validées.

## Publication automatisée avec GitHub Actions

1. Dans GitHub, créer l’environnement `marketplace` et activer une approbation
   requise si le plan GitHub le permet.
2. Ajouter le secret d’environnement `VSCE_PAT`.
3. Ouvrir **Actions** → **Publish to VS Code Marketplace** → **Run workflow**.
4. Saisir `PUBLISH` dans le champ de confirmation.

Le workflow exécute toutes les validations avant `vsce publish` et utilise
`--skip-duplicate` pour rendre une relance sans effet destructeur.

## Publier une GitHub Release

La version du tag doit correspondre exactement à `package.json` :

```bash
npm version patch
git push origin main --follow-tags
```

Le tag `vX.Y.Z` déclenche la vérification, génère le VSIX et crée une GitHub
Release avec les notes et le paquet attaché.

## Migration d’authentification à prévoir

Microsoft annonce le retrait des PAT globaux Azure DevOps le 1er décembre 2026
et recommande Microsoft Entra ID avec fédération d’identité pour les pipelines
durables. Le workflow PAT est adapté au démarrage, mais doit être remplacé avant
cette échéance si le jeton utilisé est global.

Références officielles :

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
- [VS Code Extension Manager](https://github.com/microsoft/vscode-vsce)
