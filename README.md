# SimuParis — simulateur de paris sportifs (argent virtuel)

**Simulation uniquement — aucun argent réel. Les paris réels font perdre en moyenne.**

Démo : https://salimadour31-boop.github.io/simulateur-paris/

- Solde de 10 000 DA virtuels, paris simples et combinés (1X2, +/-2.5 buts, les deux équipes marquent), historique, statistiques (ROI, taux de réussite, misé/retourné, courbe de bénéfice), backtest de stratégies sur la saison 2025-26, match « en direct » simulé.
- Données réelles : [openfootball/football.json](https://github.com/openfootball/football.json) (domaine public, sans clé API) — Premier League, LaLiga, Bundesliga, Serie A, Ligue 1.
- Cotes : modèle de Poisson (forces attaque/défense mises à jour après chaque match) + marge transparente de 6 %. Probabilité implicite et marge affichées sur chaque match.
- Règlement automatique avec le résultat réel dès sa publication ; sinon tirage selon le modèle, clairement marqué « simulé ».
- Aucun lien vers un opérateur, aucune publicité, aucun traçage. Tout est stocké en localStorage.

Site statique (HTML/CSS/JS sans dépendance). Lancer localement : `python3 -m http.server`.

Licence MIT.
