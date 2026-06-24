# AGENTS.md — AgentPay

Couche de paiement pour agents IA sur Mollie. Node v24, Express, ESM, 0 build step.

## RÈGLE ABSOLUE — repo technique et public
Ce repo est purement technique et public. Tout fichier doit être publiable tel quel.

Ne jamais y ajouter :
- secrets, `.env`, tokens, clés privées, clés Mollie live ;
- données personnelles, nom/persona/contact réel, email réel, URL personnelle ;
- notes privées, lien vers espace privé, chemin local, outil privé, contexte d'agent privé ;
- documents de stratégie, plans de contact, cibles privées, ou notes non techniques ;
- champs produit qui encodent une intention non technique ou une cible privée.

Avant chaque ajout ou modification : vérifier que le contenu est technique, générique, sans donnée perso, sans stratégie business, sans lien vers espace ou outil privé. En cas de doute, le contenu reste hors repo.

## Bloquants (non négociables)
1. **Pas un repo git.** Si on build à plusieurs : `git init && git add -A && git commit -m snapshot` d'abord.
2. **Le LLM ne calcule JAMAIS un montant.** Montants/plafonds/prix = code déterministe (`policy.js`, prix du provider). Le LLM décide quoi/qui, pas combien.
3. **Argent en CENTIMES (entiers)** partout. `centsToMollie()` seulement pour parler à Mollie.
4. **`codex exec` hang si stdin ouvert** → toujours `stdio:['ignore',...]` / `</dev/null`. Pattern : `--ephemeral --skip-git-repo-check -s read-only --output-schema <schema> -o <out>` + timeout + fallback.
5. **Ne pas casser la démo 5 actes** (`./demo.sh`). Tout est additif.
6. `import 'dotenv/config'` reste le 1er import de `server.js`.

## Lancer
```bash
npm install && npm run dev          # .env : MOLLIE_API_KEY, BASE_URL (ngrok), PORT
./demo.sh                           # 5 actes
```
Itérer vite : `SIMULATE_PAYMENTS=1 DECIDER_MODE=fallback VERIFIER_MODE=heuristic node server.js` (pas d'attente Codex).
Valider le réel : `DECIDER_MODE=codex VERIFIER_MODE=codex`.

## Pipeline
`/agent/pay` `/agent/pay-agent` `/task` → policy déterministe → verifier Codex → exécution Mollie → audit. Webhook = source de vérité.

## Carte fichiers
`server.js` routes/wiring · `store.js` état mémoire+argent · `policy.js` garde-fou 1 · `verifier.js` garde-fou 2 (Codex) · `flow.js` orchestration+A2A · `mollie.js` mandat+recurring · `tasks.js` agent live · `provider.js` livrable · `views.js` UI · `seed.js` démo.

## Branch & review policy
- **`main` est protégée** : pas de push direct. Tout passe par **Pull Request** avec **CI verte** (`.github/workflows/ci.yml` → `npm test`).
- **Une PR = un lot atomique**, branche dédiée (`feature/*`, `chore/*`, `fix/*`). Jamais `git add -A` à l'aveugle. `.env` hors git.
- **Review avant merge** : relire les tests, les invariants, et les captures si l'UI change.
- **GATES** : modifier `policy.js`/`verifier.js` (garde-fous) · utiliser une clé Mollie live / vrai argent · déployer · merger dans `main`.
- **Invariants non négociables** (rappel §Bloquants) : le LLM ne calcule jamais un montant ; argent en centimes ; `codex exec` stdin fermé ; ne pas casser `./demo.sh` ni les tests ; `molliePaymentId: null` jusqu'au commit.

## Prochaines pistes
1. A2A inter-comptes + settlement réel Mollie · 2. Marketplace d'agents · 3. Devis→exécution · 4. Durcir la démo · 5. Tests (`policy.decide`, eval d'injections).
