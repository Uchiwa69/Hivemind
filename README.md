# Hivemind — dossier de pilotage

> Équipe : **Uchiwa69 (solo)** · Repo : `Uchiwa69/hivemind` · Project : [lien GitHub Project]
> Ce fichier est le `README.md` du repo et le support de la démo de pilotage de mardi 11h50.
> **Convention** : tout chiffre suivi de *(estimation)* n'a pas été mesuré en séance (projet mené seul, hors des horaires du module, avec l'accord du formateur). Les chiffres sans mention sont mesurés.

| Membre | Rôle au sprint 1 | Rôle au sprint 2 | Rôle au sprint 3 | IA connectée(s) avec SON compte | Sur le poste de démo ? |
|---|---|---|---|---|---|
| Uchiwa69 | Les 4 rôles | Les 4 rôles | Les 4 rôles | Claude Code, Antigravity (agy) / Gemini | Oui |

*Seul, je cumule les 4 rôles. Pour garder le regard du relecteur-testeur, je ne ferme jamais une issue juste après le prompt : je teste d'abord dans le navigateur avec un vrai prompt, puis je relis le code.*

**Règle d'or de ce dossier** : chaque affirmation s'appuie sur une donnée du brief client.

---

## 0. Installer et lancer Hivemind

*Section remplie par l'IA à la fin du Sprint 1 (HM-04), mise à jour au Sprint 5 (HM-25 : installateur Windows).*

**Option A — Installateur Windows (recommandé, sans Node.js ni terminal)**

| Rubrique | À remplir |
|---|---|
| Téléchargement | [`HivemindSetup-1.0.0.exe`](https://github.com/Uchiwa69/Hivemind/releases/tag/v1.0.0) (Release v1.0.0 sur GitHub) |
| Installation | Lancez `HivemindSetup-1.0.0.exe`, choisissez « pour tous les utilisateurs » ou « pour moi uniquement », cochez si besoin le raccourci sur le bureau. L'installateur n'est pas signé : si Windows SmartScreen s'affiche, cliquez **Informations complémentaires** → **Exécuter quand même**. |
| Lancement | Menu Démarrer → **Hivemind** : le serveur démarre (fenêtre réduite dans la barre des tâches) et `http://127.0.0.1:3000` s'ouvre dans le navigateur. Relancer Hivemind alors qu'il tourne rouvre simplement la page. Fermer la fenêtre Hivemind l'arrête. |
| Données | `%APPDATA%\Hivemind` (historique, sessions, mémoire, réglages, compteurs). Au premier lancement, Hivemind propose d'importer un dossier `data/` existant de la version développeur. La désinstallation conserve ces données. |
| Désinstallation | Paramètres Windows → **Applications installées** → Hivemind → Désinstaller. |
| Prérequis | Windows 10/11 64 bits · au moins une CLI d'IA installée **et connectée** (si aucune n'est détectée, la page « Bienvenue » donne les commandes d'installation). |

**Option B — Installation développeur**

| Rubrique | À remplir |
|---|---|
| Prérequis (Node.js / Python, version) | Node.js LTS (20 ou plus, testé avec 24) · Windows + PowerShell · au moins une CLI d'IA installée **et connectée** (dans le `PATH`) |
| CLI pilotées (au moins 2 connectées sur le poste de démo) | Claude Code : `claude -p --output-format stream-json --verbose --include-partial-messages "<prompt>"` (lit `CLAUDE.md`) · Codex CLI : `codex exec --skip-git-repo-check "<prompt>"` (lit `AGENTS.md`) · Antigravity CLI : `agy -p "<prompt>"` (lit `GEMINI.md`) · Gemini CLI : `gemini -p "<prompt>"` (lit `GEMINI.md`). Sur le poste de démo : Claude Code, Antigravity / Gemini ; Codex non installé (affiché « absente », sans planter) |
| Installation (commande) | `npm install` (dans le dossier du projet) |
| Lancement (une seule commande) | `npm start` |
| Adresse dans le navigateur | `http://127.0.0.1:3000` (le serveur n'écoute que sur la machine locale) |
| Construire l'installateur | `npm run build:installer` (Windows, Inno Setup 6 requis : `winget install JRSoftware.InnoSetup`) → `dist/Hivemind.exe` et `dist/HivemindSetup-<version>.exe` ; `dist/` est ignoré par Git |
| À savoir | Lancez Hivemind dans **votre propre terminal**, pas via un agent Claude Code (sinon `claude -p` refuse de démarrer : sessions imbriquées). Connectez chaque CLI une fois dans un terminal avant (ex. lancer `claude`). En mode développeur, les données restent en local dans `data/`, ignoré par Git. Si le port 3000 est pris par Hivemind, il tourne déjà ailleurs. |

---

## 1. Analyse du projet et enjeux

| Rubrique | Ce que dit le brief (données précises) | Ce que ça implique pour nous |
|---|---|---|
| Objectifs du client | Piloter 3 CLI depuis 1 page web locale ; 1 mémoire unique lue par les 3 IA ; MVP dès la démo 1 ; v1 publique le 15/12/2026 | La mémoire partagée (HM-06, HM-07 : 16 pts) est le cœur de la valeur, à livrer juste après le MVP |
| Parties prenantes | Casey (lead dev, client, valide) · devs de l'agence (utilisateurs, « aucune formation ») · sécurité de l'agence (aucune donnée ne sort du poste) · agents IA (exécutent, ne décident pas) | Interface simple, appli en localhost uniquement, un humain valide chaque livraison |
| Ressources (humaines, IA, temps) | 1 personne (moi) au lieu de 3-4 · 2 IA connectées (Claude, Antigravity/Gemini) · 3 sprints = 170 min | Capacité divisée par 3 à 4 par rapport aux autres équipes : on vise les Must + les Should de la mémoire, pas plus |
| Contraintes (techniques, délais, règles) | 0 API payante · 100 % local · Windows · 0 ligne de code à la main · toute feature = 1 issue · au moins 2 CLI connectées en démo | Node + Express + appel des CLI en mode non interactif ; tout passe par des prompts |

| # | Enjeu principal | Pourquoi c'est critique (donnée du brief) |
|---|---|---|
| 1 | Livrer un MVP qui marche en démo | Le client préfère « 3 fonctions qui marchent à 10 qui plantent » ; une feature à moitié faite vaut 0 |
| 2 | Prioriser un backlog trop gros, seul | 20 features, 111 pts de valeur, 170 min et 1 seule personne |
| 3 | Dépendre de quotas IA limités | Une IA à court de quota = une ressource en moins ; HM-02, HM-07 et HM-13 exigent 2 CLI connectées |

---

## 2. Phases, objectifs et livrables

| Phase | Objectif | Livrables | Critère de sortie (on passe à la suite quand…) |
|---|---|---|---|
| Conception | Cadrer le projet et prioriser les 20 features | Repo + GitHub Project avec les issues, MoSCoW et Valeur remplis ; ce dossier (§1, §2, §6, A) | Les 4 Must sont dans le Board et le client valide le périmètre |
| Développement | Construire le MVP puis la mémoire partagée | Appli qui envoie un prompt à 2 IA (HM-01 à HM-04), puis mémoire synchronisée (HM-05 à HM-08) | Les Must sont en « Done » avec les 3 conditions de « fini » |
| Tests | Prouver que tout marche en direct sur le poste de démo | Test « mot de passe ANANAS » cité par 2 CLI (HM-07) ; mode comparer (HM-13) ; erreurs gérées (HM-12) | Chaque feature retenue passe un prompt choisi par le client |
| Déploiement | Rendre l'appli installable par un dev de l'agence | Section 0 du README ; v1 taguée sur GitHub le 15/12/2026 | Un dev qui n'a pas codé l'appli la lance avec `npm install` + `npm start` |

---

## 3. Estimations et marges

*Estimation = points d'effort (mon planning poker). Valeur = points de valeur (donnée par le backlog). Hypothèse de vélocité : 1 point d'effort ≈ 5 min de travail utile avec l'IA (estimation).*

**Capacité de l'équipe**

| Sprint | Durée | Personnes | Temps humain dispo (min) | Temps utile (× 0,8) | Quotas IA (estimation) | Capacité retenue (pts d'effort) |
|---|---|---|---|---|---|---|
| Sprint 1 | 40 min | 1 | 40 | 32 | Claude + Antigravity OK | 32 − 20 % de marge = 25,6 min → **5 pts** |
| Sprint 2 | 75 min | 1 | 75 | 60 | Claude + Antigravity OK | 60 − 20 % = 48 min → **9 pts** |
| Sprint 3 | 55 min | 1 | 55 | 44 | 10 prompts max (carte n°2) | 44 − 20 % = 35 min → **7 pts** |

**Estimations**

| Élément (phase ou feature) | Estimation (pts d'effort) | Hypothèse | Marge de sécurité | Risque qui justifie la marge |
|---|---|---|---|---|
| MVP HM-01 à HM-04 | 5 | Mode non interactif d'abord, comme conseillé par le brief | 20 % | `claude -p` refuse de tourner dans une session Claude Code imbriquée |
| Mémoire HM-05 à HM-08 | 9 | Écriture de 3 fichiers texte, sans base de données | 20 % | Ne pas écraser le contenu déjà présent dans CLAUDE.md / AGENTS.md / GEMINI.md |
| HM-13 comparer + HM-12 erreurs | 7 | Lancer 2 CLI en parallèle, réutiliser le code de HM-01 | 20 % | Quota d'une IA épuisé pendant la démo |

**Négociation (lundi 14h15)** *(estimation : je n'ai pas fait la séance en direct, voici les objections que j'anticipe)*

| Rôle | Objection | Décision (hypothèse ou arbitrage) | Impact sur l'estimation |
|---|---|---|---|
| UX/UI | « Une seule page, ça va devenir illisible avec l'historique et la mémoire » | Onglets : Chat / Mémoire ; historique en colonne à gauche | +0 pt (intégré à HM-06) |
| Infra / Sécurité | « Lancer des commandes depuis une page web, c'est dangereux » | Serveur sur 127.0.0.1 uniquement, arguments passés en tableau (pas d'injection shell) | +1 pt sur HM-01 |
| Dev senior | « Le streaming et l'annulation vont vous coûter cher » | HM-09 et HM-10 sortent du périmètre | −6 pts |

**Estimé contre réel, par feature (mis à jour à chaque démo)**

| Feature | Valeur (pts de valeur) | Estimation (pts d'effort) | Réel (pts d'effort ou minutes) | Livrée et marche en démo ? | Écart expliqué |
|---|---|---|---|---|---|
| HM-01 | 5 | 2 | … min | | |
| HM-02 | 3 | 1 | … min | | |
| HM-03 | 3 | 1 | … min | | |
| HM-04 | 3 | 1 | … min | | |
| HM-05 | 5 | 2 | … min | | |
| HM-06 | 8 | 2 | … min | | |
| HM-07 | 8 | 3 | … min | | |
| HM-08 | 5 | 2 | … min | | |
| HM-13 | 20 | 5 | … min | | |
| HM-12 | 5 | 2 | … min | | |

*À remplir avec tes vraies mesures ce soir (heure de début/fin de chaque ticket, nombre de prompts).*

**Cartes événement**

| Carte | Arbitrage (ce qui entre, ce qui sort) | Qui a validé (A) | Impact (capacité, planning, valeur) |
|---|---|---|---|
| n°1 (lundi 15h00) | HM-13 « comparer » passe de Could à Must (Valeur 13 → 20 pts), avec 2 vraies IA. Il entre au Sprint 3 ; HM-09, HM-10, HM-11 sortent | Uchiwa69 (responsable produit), après accord de Casey | +5 pts d'effort au Sprint 3 ; +20 pts de valeur possibles ; −15 pts de valeur abandonnés |
| n°2 (mardi 10h12) | Limite de 10 prompts IA jusqu'à 11h12 : je finis HM-13 et HM-12, je n'ouvre aucun nouveau ticket | Uchiwa69 | Capacité Sprint 3 recalculée en prompts : 10 prompts pour 7 pts (estimation) |

---

## 4. Ressources et RACI

**Ressources par phase**

| Phase | Ressources humaines | Ressources techniques (IA, outils, postes) |
|---|---|---|
| Conception | Uchiwa69 | GitHub Projects, backlog.md |
| Développement | Uchiwa69 (pilote IA + relecteur) | Claude Code (code), Antigravity (relecture croisée), Node.js, poste Windows |
| Tests | Uchiwa69 (relecteur-testeur) | Navigateur, Claude Code + Antigravity CLI connectés |
| Déploiement | Uchiwa69 + Casey (validation) | GitHub (repo, tag v1), README section 0 |

**RACI**

| Tâche | Uchiwa69 | Claude Code | Antigravity | Client (Casey) |
|---|---|---|---|---|
| Prioriser le backlog | A/R | | | C |
| Écrire le code (HM-01 à HM-13) | A | R | C | I |
| Relire et tester | A/R | | C | |
| Tenir le Board à jour | A/R | | | I |
| Valider une livraison en démo | R | | | A |

*Une IA peut être R, jamais A. Un seul A par ligne.*

---

## 5. Rétroplanning

*Construit à rebours depuis le lancement public du 15/12/2026.* (dates : estimation)

Vue Roadmap : [lien]

| Phase / tâche | Début | Fin | Durée | Dépend de | Marge | Livrable | Responsable (A) |
|---|---|---|---|---|---|---|---|
| Conception | 26/10/2026 | 06/11/2026 | 2 sem. | — | 2 j | Backlog trié, Board rempli | Uchiwa69 |
| Développement : MVP (HM-01 à 04) | 09/11/2026 | 13/11/2026 | 1 sem. | Conception | 1 j | Appli qui répond avec 2 IA | Uchiwa69 |
| Développement : mémoire (HM-05 à 08) | 16/11/2026 | 27/11/2026 | 2 sem. | MVP | 2 j | Mémoire synchronisée | Uchiwa69 |
| Tests (HM-12, HM-13 + recette) | 30/11/2026 | 09/12/2026 | 1,5 sem. | Développement | 2 j | Recette validée par Casey | Casey |
| Déploiement | 10/12/2026 | 15/12/2026 | 4 j | Tests | 1 j | v1 publique + mode d'emploi en ligne | Casey |

**Risques et parades**

| Risque | Probabilité | Impact | Parade (anti-retard) | Où dans le planning |
|---|---|---|---|---|
| Quota d'une IA épuisé | Forte | Moyen | 2 IA connectées ; Antigravity gratuit en secours | Développement et démo |
| `claude -p` bloqué (session imbriquée) | Moyenne | Fort | Lancer l'appli dans un terminal à part (section 0) | Dès le MVP |
| Équipe d'une seule personne | Certaine | Fort | Périmètre réduit aux Must + mémoire ; marge de 20 % | Toutes les phases |

---

## 6. Jalons

| ◆ Jalon | Date | Critère de passage | Livrable vérifié | Qui valide (A) |
|---|---|---|---|---|
| Go : on développe ? | 06/11/2026 | Les 4 Must sont dans le Board avec Valeur et Estimation | Backlog trié | Uchiwa69 |
| Go : on teste ? | 27/11/2026 | L'appli répond avec 2 IA et la mémoire est citée par les 2 | Démo HM-01 à HM-08 | Casey |
| Go : on lance ? | 09/12/2026 | 100 % des Must « Done », 0 bug bloquant | Recette signée | Casey |
| Lancement | 15/12/2026 | — | v1 publique + section 0 du README | Casey |

---

## 7. KPI

| KPI | Famille | Formule | Cible | Source (GitHub, démo…) | Fréquence |
|---|---|---|---|---|---|
| Avancement des Must | Avancement (délai) | Must « Done » ÷ Must prévus | 100 % | Board GitHub | À chaque démo |
| Prompts IA consommés | Avancement (coût) | Prompts utilisés ÷ prompts prévus | ≤ 100 % | Compté à la main au §3 | À chaque sprint |
| Features qui marchent du premier coup | Qualité | Features OK en démo ÷ features présentées | ≥ 80 % | Démo | À chaque démo |
| CLI pilotables | Adoption | Nombre de CLI qui répondent en démo | 3 (réaliste : 2) | Démo | À chaque démo |
| Valeur livrée | Business | Somme des Valeurs « Done » ÷ valeur visée (65 pts) | 100 % | Insights GitHub | À chaque démo |

---

## 8. Tableau de bord

Insights : [capture du graphique « Somme de Valeur par Sprint et Status »]

| Indicateur | Valeur actuelle | Cible | Écart | Tendance | Météo | Mode de suivi | Fréquence | Responsable |
|---|---|---|---|---|---|---|---|---|
| Avancement des Must | … | 100 % | … | | | Board GitHub | Chaque démo | Uchiwa69 |
| Valeur livrée | … / 65 pts | 65 pts | … | | | Insights | Chaque démo | Uchiwa69 |
| Prompts IA consommés | … | ≤ prévu | … | | | Comptage §3 | Chaque sprint | Uchiwa69 |
| CLI pilotables | … | 3 | … | | | Démo | Chaque démo | Uchiwa69 |

*Météo : vert = écart ≤ 5 % · orange = 5 à 15 % · rouge > 15 %.*

**Décision à prendre maintenant** : [une phrase, ex. « Codex absent : on vise 2 CLI en démo et on reporte la 3e à la v1. »]

---

## A. Décision de méthode

| Critère du contexte | Notre situation (donnée) | Ce que ça favorise |
|---|---|---|
| Taille et composition de l'équipe | 1 personne qui cumule les 4 rôles | Une méthode légère, sans cérémonies lourdes |
| Durée et rythme | 3 sprints de 40, 75 et 55 min ; lancement fixe le 15/12/2026 | Des sprints courts + un planning global à date fixe (hybride) |
| Incertitude technique | Appeler des CLI depuis Node sous Windows : jamais fait | Livrer petit et tester tôt (MVP au Sprint 1) |
| Disponibilité du client | Casey change d'avis (cartes événement) et regarde chaque démo | Scrum : démo et réajustement à chaque sprint |

**Méthode retenue** : Scrum allégé, dans un cadre hybride.
**Parce que** : (1) le client change d'avis en cours de route, donc on réajuste le backlog à chaque sprint ; (2) on livre un morceau qui marche toutes les 40 à 75 min, montré en démo ; (3) la date du 15/12/2026 est fixe, donc on garde un rétroplanning avec jalons comme en cycle en V.
**Ce qu'on abandonne de la méthode et pourquoi** : le point quotidien et la séparation des rôles (je suis seul), et les sprints de 1 à 4 semaines (on n'a que 170 min). Pas de cycle en V pur : tester à la fin serait trop risqué avec un client qui change d'avis. Pas de Kanban pur : il nous faut des démos à heure fixe.

---

## B. Journal des rétros

| Sprint | Estimé (pts d'effort) | Livré et qui marche (pts d'effort) | Écart | Valeur livrée (pts de valeur) | Garder | Arrêter | Essayer |
|---|---|---|---|---|---|---|---|
| Sprint 1 | 5 | … | … | … / 14 | | | |
| Sprint 2 | 9 | … | … | … / 26 | | | |
| Sprint 3 | 7 | … | … | … / 25 | | | |
