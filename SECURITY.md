# Politique de sécurité

## Signaler une vulnérabilité

Ne publiez pas de vulnérabilité exploitable dans une issue publique. Utilisez la
fonction **Private vulnerability reporting** du dépôt GitHub lorsqu’elle est
activée, ou contactez le mainteneur par un canal privé indiqué sur son profil.

Incluez la version, un diagramme minimal non confidentiel, l’impact et les étapes
de reproduction.

## Modèle de sécurité

Mermaid est embarqué dans le VSIX. La webview utilise une Content Security
Policy avec `connect-src 'none'`, des scripts sous nonce et Mermaid avec
`securityLevel: strict`. L’extension ne collecte aucune télémétrie.
