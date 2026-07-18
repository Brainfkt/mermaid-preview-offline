# Publier Mermaid Preview Offline

## Préconditions

- accès administrateur au dépôt GitHub ;
- compte Microsoft/Azure DevOps ;
- publisher créé dans le
  [gestionnaire Visual Studio Marketplace](https://marketplace.visualstudio.com/manage/publishers/) ;
- publisher identique au champ `publisher` de `package.json` ;
- application Microsoft Entra configurée avec une identité fédérée GitHub pour
  l’environnement `marketplace`.

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
2. Dans **Environment variables**, ajouter `AZURE_CLIENT_ID` et
   `AZURE_TENANT_ID`. Ces identifiants ne sont pas des secrets.
3. Dans Microsoft Entra, ajouter à l’application une information
   d’identification fédérée avec les valeurs suivantes :
   - émetteur : `https://token.actions.githubusercontent.com` ;
   - sujet : `repo:Brainfkt/mermaid-preview-offline:environment:marketplace` ;
   - audience : `api://AzureADTokenExchange`.
4. Ouvrir **Actions** → **Publish to VS Code Marketplace** → **Run workflow**
   et saisir `IDENTITY`. Le récapitulatif du job affiche l’identifiant de
   l’identité Marketplace sans publier l’extension.
5. Dans le gestionnaire Marketplace, ajouter cet identifiant aux membres du
   publisher `brainfkt` avec le rôle **Contributor**.
6. Pour une future version, relancer le workflow et saisir `PUBLISH`.

Le workflow utilise un jeton Entra éphémère obtenu par OIDC, vérifie que
l’identité possède les droits du publisher, exécute toutes les validations puis
appelle `vsce publish --azure-credential`. `--skip-duplicate` rend une relance
sans effet destructeur. Aucune souscription Azure ni aucun secret durable ne
sont nécessaires.

## Publier une GitHub Release

La version du tag doit correspondre exactement à `package.json` :

```bash
npm version patch
git push origin main --follow-tags
```

Le tag `vX.Y.Z` déclenche la vérification, génère le VSIX et crée une GitHub
Release avec les notes et le paquet attaché.

## Authentification sans PAT

Microsoft recommande Microsoft Entra ID avec fédération d’identité pour les
pipelines durables. Le workflow accorde uniquement à l’environnement GitHub
`marketplace` le droit de demander un jeton temporaire et ne stocke aucun PAT.

Références officielles :

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
- [VS Code Extension Manager](https://github.com/microsoft/vscode-vsce)
