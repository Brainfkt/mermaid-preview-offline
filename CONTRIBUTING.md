# Contribuer

Merci de contribuer à Mermaid Preview Offline.

## Développement

```bash
npm ci
npm run verify
```

Pour déboguer l’extension, ouvrir le dépôt dans VS Code et lancer la
configuration **Run Mermaid Preview Offline** avec `F5`.

## Pull requests

- limiter chaque PR à un sujet cohérent ;
- ajouter ou mettre à jour les tests ;
- conserver le rendu entièrement local ;
- ne pas assouplir `securityLevel: strict` ni `connect-src 'none'` sans revue de
  sécurité explicite ;
- exécuter `npm run verify` avant l’envoi.
