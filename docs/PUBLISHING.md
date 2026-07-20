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

## Captures et README Marketplace

Le README Marketplace utilise des URL HTTPS absolues vers
`raw.githubusercontent.com`. Avant de créer le tag de publication :

1. Ajouter à Git le README, les guides et toutes les captures référencées.
2. Pousser ces fichiers sur la branche `main` du dépôt public.
3. Ouvrir chaque URL d’image Raw dans une session non authentifiée et vérifier
   qu’elle répond correctement, avec la casse exacte du chemin.
4. Exécuter `npm test` : le test de publication refuse les liens README relatifs,
   les fichiers absents et les captures qui ne figurent pas dans `git ls-files`.
5. Construire ensuite le VSIX et contrôler son README avant publication.

Les captures sous `media/screenshots/` sont exclues du VSIX pour ne pas alourdir
l’installation ; elles restent disponibles depuis le dépôt pour le README. La
Marketplace conserve le README contenu dans la version publiée. Une relance de
la même version avec `--skip-duplicate` ne met donc pas la fiche à jour : après
une publication existante, il faut incrémenter la version pour diffuser un
nouveau README.

## Publication automatisée avec GitHub Actions

1. Dans GitHub, créer l’environnement `marketplace` et activer une approbation
   requise si le plan GitHub le permet.
2. Dans **Environment variables**, ajouter `AZURE_CLIENT_ID` et
   `AZURE_TENANT_ID`. Ces identifiants ne sont pas des secrets.
3. Dans Microsoft Entra, ajouter à l’application une information
   d’identification fédérée avec les valeurs suivantes :
   - émetteur : `https://token.actions.githubusercontent.com` ;
   - sujet : `repo:Brainfkt@164480359/mermaid-preview-offline@1302799283:environment:marketplace` ;
   - audience : `api://AzureADTokenExchange`.
4. Ouvrir **Actions** → **Publish to VS Code Marketplace** → **Run workflow**
   et saisir `IDENTITY`. Le récapitulatif du job affiche l’identifiant de
   l’identité Marketplace sans publier l’extension.
5. Dans le gestionnaire Marketplace, ajouter cet identifiant aux membres du
   publisher `brainfkt` avec le rôle **Contributor**.
6. Relancer le workflow avec `VERIFY` pour contrôler les droits sans publier.
7. Pour une future version, pousser simplement son tag `vX.Y.Z`. La publication
   Marketplace se déclenche automatiquement. L’entrée manuelle `PUBLISH` reste
   disponible pour reprendre une publication interrompue.

Le workflow utilise un jeton Entra éphémère obtenu par OIDC, vérifie que
l’identité possède les droits du publisher, contrôle que le tag correspond à
la version du manifeste, exécute toutes les validations puis appelle
`vsce publish --azure-credential`. `--skip-duplicate` rend une relance sans effet
destructeur. Aucune souscription Azure ni aucun secret durable ne sont
nécessaires.

## Publier une GitHub Release

La version du tag doit correspondre exactement à `package.json` :

Pour publier la v1.0.0 préparée dans le manifeste :

```bash
git tag v1.0.0
git push origin main v1.0.0
```

Pour les versions suivantes, mettre à jour `package.json`, `package-lock.json`
et `CHANGELOG.md`, puis créer le tag correspondant. Le tag `vX.Y.Z` déclenche en
parallèle les deux workflows protégés :

- **GitHub Release** vérifie la version, génère le VSIX et crée la release avec
  les notes et le paquet attaché ;
- **Publish to VS Code Marketplace** vérifie la même version et publie le VSIX
  auprès du publisher `brainfkt`.

Un tag qui ne correspond pas exactement au champ `version` échoue avant toute
publication.

## Authentification sans PAT

Microsoft recommande Microsoft Entra ID avec fédération d’identité pour les
pipelines durables. Le workflow accorde uniquement à l’environnement GitHub
`marketplace` le droit de demander un jeton temporaire et ne stocke aucun PAT.

Références officielles :

- [Publishing Extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [Continuous Integration](https://code.visualstudio.com/api/working-with-extensions/continuous-integration)
- [VS Code Extension Manager](https://github.com/microsoft/vscode-vsce)
