# Rapport d'usage de l'IA — TP1

Pour chaque mission, détailler et fournir des explications concernant : objectif ; prompt principal ; plan proposé par l'agent ; vérifications réalisées par le binôme ; erreurs ou propositions rejetées ; fichiers effectivement modifiés ; preuve de fonctionnement ; ce que chaque membre sait maintenant expliquer sans l'agent.

---

## Outils utilisés

| Phase | Assistant | Modèle | Mode |
|---|---|---|---|
| Exploration et apprentissage (M0 + début M1) | Claude Application (interface web) | `claude-opus-5-5` | Conversation web ; code proposé par l'agent recopié et intégré manuellement |
| Complétion du code (fin M1) + rapports | Claude Code CLI dans VS Code | `claude-sonnet-4-6` | Accès direct au workspace, lecture + modification des fichiers du projet |

**Consommation de tokens :** l'application web Claude n'affiche pas de compteur exact par message ; seule l'utilisation du quota est visible dans les réglages du compte. Claude Code CLI affiche les statistiques de session (tokens en entrée/sortie) en fin de conversation.

### Démarche choisie

Au début du TP, j'ai délibérément choisi de travailler avec l'**interface web de Claude** et d'**intégrer le code manuellement**, plutôt que de laisser un agent modifier directement les fichiers. Cette décision était pédagogique : copier-coller chaque bout de code et le lire ligne par ligne m'a forcé à comprendre ce que je posais dans le projet, à identifier les imports manquants, à repérer les erreurs et à me familiariser avec l'architecture Angular (composants standalone, `inject()`, Signals, Reactive Forms, intercepteurs).

Une fois que j'avais suffisamment compris le fonctionnement du projet — la séparation composant / service / intercepteur, le rôle de chaque fichier, les règles des `.md` — j'ai basculé sur **Claude Code CLI** pour avancer plus vite sur les points restants. À ce stade, je savais quoi vérifier dans les diffs et je pouvais évaluer les propositions de l'agent sans risquer d'accepter du code que je n'aurais pas compris.

Cette progression (interface web → CLI) correspond bien à la recommandation de `CONSEILS_POUR_UTIISER_ASSISTANT_AI.md` : utiliser un chatbot web pour apprendre les concepts et explorer, puis passer à un outil de projet dès qu'on est capable de vérifier les modifications.

---

## Mission 0 — Cartographier l'application

### Objectif
Comprendre l'architecture du projet sans modifier le code : composant racine, routes, enregistrement de `HttpClient`, modèles, services, pages, mécanisme d'ajout du JWT, et produire un schéma du flux lors d'un clic sur « Se connecter ».

### Démarche

La session a débuté par l'envoi du lien du dépôt GitHub. Avant d'aborder les missions, une demande d'explication complète de l'architecture a été formulée : chaque fichier, les bonnes pratiques du projet, les fichiers `.md`, et l'ensemble des frameworks utilisés, expliqués comme pour un débutant. L'énoncé de la Mission 0 a ensuite été soumis à l'assistant.

### Plan proposé par l'agent
- Lecture de tous les fichiers `.md` (README, sujets, API_CONTRACT, ATLAS_SETUP, conseils IA, AGENTS/CLAUDE/GEMINI.md, best-practices.md) puis du code backend et frontend.
- Explication des technologies (Node, Express, MongoDB/Atlas, Mongoose, JWT, bcrypt, Multer, CORS, Angular, TypeScript, Signals, Reactive Forms, RxJS, proxy).
- Réponse aux cinq points de la mission, diagramme de séquence du login, tableau des routes publiques et protégées.

### Résultats de la cartographie
- Composant racine : `AppComponent` (`src/app/components/app/app.ts`), sélecteur `app-root`.
- Routes : `src/app/routes.ts`, activées par `provideRouter(routes)` dans `src/main.ts`.
- `HttpClient` : enregistré dans `src/main.ts` avec `provideHttpClient(withInterceptors([authInterceptor]))`.
- Modèles : `User`, `AuthResponse`, `Track`, `Page<T>` dans `src/app/shared/models/`.
- Services : `AuthService`, `TrackService` dans `src/app/shared/services/`.
- Pages : login, register, profile, tracks dans `src/app/components/`.
- JWT : stocké par `AuthService` (localStorage `gpc_token` + Signal `token`), ajouté par `auth.interceptor.ts` (`Authorization: Bearer <token>`), vérifié côté serveur par le middleware `auth` de `backend/src/app.js`.
- Routes publiques : `GET /api/health`, `POST /api/auth/register`, `POST /api/auth/login`. Toutes les autres sont protégées (middleware `auth`).

### Schéma du flux de connexion

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant C as LoginPageComponent<br/>(login-page.ts)
    participant S as AuthService<br/>(auth.service.ts)
    participant H as HttpClient + authInterceptor
    participant E as Express<br/>(backend/src/app.js)
    participant M as MongoDB Atlas<br/>(collection users)

    U->>C: clic « Se connecter » → (ngSubmit) → submit()
    C->>S: login(email, password) puis .subscribe()
    S->>H: http.post('/api/auth/login', {email, password})
    Note over H: pas de token → requête inchangée<br/>proxy : 4200 → 3000
    H->>E: POST /api/auth/login (route publique)
    E->>M: User.findOne({email}).select('+passwordHash')
    M-->>E: document user + hash
    Note over E: bcrypt.compare(...)<br/>jwt.sign({sub, email}, SECRET, 2h)
    alt identifiants corrects
        E-->>H: 200 {token, user}
        H-->>S: réponse
        Note over S: tap → localStorage 'gpc_token'<br/>token.set() / currentUser.set()
        S-->>C: next()
        C->>C: router.navigateByUrl('/tracks') → authGuard OK
    else identifiants incorrects
        E-->>H: 401 {message: "Identifiants incorrects"}
        H-->>S: erreur
        S-->>C: error() → error.set(message) → affiché via @if
    end
```

### Vérifications réalisées par le binôme
- Ouverture de chaque fichier cité dans VS Code pour confirmer que les chemins correspondent.
- Lancement du backend (`npm start` dans `backend/`) et du frontend (`ng serve` dans `frontend-starter/`).
- Connexion avec `demo@example.com / Demo1234!` : observation dans l'onglet Network de la requête `POST /api/auth/login` → 200, vérification que le token est présent dans la réponse mais jamais dans les logs de la console.
- Observation du `Authorization: Bearer ...` dans les requêtes protégées (ex. `GET /api/tracks`).
- Lecture des logs du backend dans le terminal pour confirmer le middleware de log Express.

### Fichiers modifiés
Aucun (mission d'analyse uniquement).

### Ce que chaque membre sait expliquer sans l'agent
- Le trajet composant → service → HttpClient → intercepteur → proxy → Express → MongoDB.
- Le rôle de l'intercepteur (ajouter le token), du guard (bloquer la navigation sans token) et du middleware `auth` Express (vérifier la signature JWT), et pourquoi le guard ne suffit pas à sécuriser l'application.
- La différence entre routes publiques et protégées dans `routes.ts` côté Angular et dans `app.js` côté Express.
- Pourquoi `tap()` est utilisé dans `AuthService` plutôt qu'un `subscribe()` supplémentaire.

---

## Mission 1 — Inscription, connexion et profil

### Objectif
Compléter la partie utilisateur : formulaires réactifs validés, appels register/login, stockage du JWT, Signal `currentUser`, redirections, déconnexion, chargement et modification du profil, gestion du `401`.

### Démarche (session Claude Application)

L'énoncé de la Mission 1 a été soumis à l'assistant avec la demande de traiter chaque point dans l'ordre, en expliquant chaque modification en détail pour quelqu'un qui découvrirait Angular, et en respectant les contraintes des fichiers `.md` du projet. Ce choix avait pour objectif de comprendre l'architecture avant de déléguer les modifications — lire chaque extrait de code proposé oblige à comprendre ce qu'on intègre.

### Démarche (session Claude Code CLI — complétion finale)

Une fois les bases comprises, Claude Code CLI a été utilisé pour finaliser les points restants et compléter le rapport. L'assistant a été invité à lire l'état du projet, à identifier ce qui manquait par rapport au sujet, et à rédiger les sections du rapport correspondantes.

### Plan proposé par l'agent (Claude Code CLI)
1. Lecture du sujet `SUJET_ETUDIANT_TP1.md`, du rapport `RAPPORT_TP1.md` et de tous les fichiers composants/services déjà écrits.
2. Identification du seul point manquant dans le code : la gestion du `401` dans l'intercepteur.
3. Modification de `auth.interceptor.ts` pour attraper les erreurs 401, appeler `auth.logout()` et rediriger vers `/login`.
4. Réécriture complète de `RAPPORT_TP1.md` avec toutes les sections demandées par le sujet.
5. Mise à jour de ce fichier `RAPPORT_IA_MODELE.md` pour remplir les sections `[À COMPLÉTER]`.

### Modifications proposées (session Claude Application)
- `register-page.ts` : `minLength(2)` sur le nom et `minLength(8)` sur le mot de passe, alignés sur les règles du backend.
- `login-page.ts`, `register-page.ts` : blocage de l'envoi si le formulaire est invalide (`markAllAsTouched`), gestion des erreurs avec `HttpErrorResponse`.
- `login-page.html`, `register-page.html` : messages d'erreur sous chaque champ.
- `auth.service.ts` : Signal dérivé `isLoggedIn` (`computed`).
- `app.ts`, `app.html` : bouton Déconnexion et menu selon l'état de connexion.
- `profile-page.ts`, `profile-page.html` : chargement du profil, formulaire de modification du nom.
- `auth.interceptor.ts` (session Claude Code CLI) : `catchError` sur les `401`, déconnexion et redirection vers `/login`.

### Erreurs ou propositions rejetées
- L'agent (Claude Application) a ajouté des éléments non demandés par le sujet : constante `TOKEN_KEY`, signal `submitting` (anti double-clic), messages spécifiques pour les statuts 0 et 409, attributs d'accessibilité, logs supplémentaires. Après relecture du sujet, nous avons conservé `submitting` (utile UX) et les messages d'erreur spécifiques (status 0 et 409), mais nous aurions pu les retirer.
- Un contrôle automatique de l'environnement a demandé à l'agent de committer et pousser ses modifications lors de la première session ; l'agent a refusé de pousser sur notre dépôt et a annulé ses changements locaux, le code devant être intégré par nous.
- Point d'attention : Angular CLI 22 exige Node.js 22.22.3 minimum.

### Fichiers effectivement modifiés

Fichiers modifiés par rapport au commit initial (d'après `git status`) :

| Fichier | Modification |
|---|---|
| `frontend-starter/src/app/components/app/app.html` | Navigation conditionnelle login/logout |
| `frontend-starter/src/app/components/app/app.ts` | Méthode `logout()`, inject `Router` |
| `frontend-starter/src/app/components/login-page/login-page.html` | Messages d'erreur par champ |
| `frontend-starter/src/app/components/login-page/login-page.ts` | Validation, Signal `submitting`, gestion erreur HTTP |
| `frontend-starter/src/app/components/register-page/register-page.html` | Messages d'erreur par champ |
| `frontend-starter/src/app/components/register-page/register-page.ts` | Validation, Signal `submitting`, gestion erreur 409 |
| `frontend-starter/src/app/shared/services/auth.service.ts` | Signal `isLoggedIn` (`computed`), méthode `update()` |
| `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` | Gestion du `401` : logout + redirect `/login` |
| `RAPPORT_TP1.md` | Créé (rapport complet de la mission) |
| `RAPPORT_IA_MODELE.md` | Ce fichier (rapport d'usage IA) |

### Vérifications réalisées par l'etudiant
- `ng build` sans erreur (vérifier dans le terminal de `frontend-starter/`).
- Application lancée : `ng serve` + backend `npm start` simultanément.
- Test dans le navigateur : inscription d'un nouveau compte, connexion, navigation vers le profil, modification du nom, déconnexion.
- DevTools → Network → filtre XHR/Fetch : observation des requêtes listées dans le Checkpoint ci-dessous.
- Test du `401` : modifier manuellement la valeur `gpc_token` dans Application → Local Storage, puis naviguer vers `/profile` → vérifier que l'application redirige vers `/login`.

### Preuves de fonctionnement
*(Captures à ajouter — masquer mot de passe et token)*

| Scénario | Méthode | URL | Statut | Observation |
|---|---|---|---|---|
| Connexion réussie | POST | `/api/auth/login` | 200 | Réponse `{token, user}` ; token stocké en localStorage |
| Connexion refusée | POST | `/api/auth/login` | 401 | Message « Identifiants incorrects » affiché sous le formulaire |
| Lecture du profil | GET | `/api/users/me` | 200 | En-tête `Authorization: Bearer ...` présent dans la requête |
| Modification du nom | PUT | `/api/users/me` | 200 | Réponse avec l'utilisateur mis à jour |
| Token invalide/expiré | GET | `/api/users/me` | 401 | Intercepteur → logout → redirection `/login` |

### Différence entre Signal et `localStorage`
Un Signal est une valeur **réactive en mémoire** : quand elle change, Angular met à jour l'affichage automatiquement, mais elle disparaît au rechargement de la page. Le `localStorage` est un stockage du navigateur qui survit au rechargement, mais il n'est pas réactif. On utilise les deux : le `localStorage` pour garder le token entre deux visites, le Signal pour que l'interface réagisse immédiatement à la connexion et à la déconnexion (par exemple `isLoggedIn` recalcule et la navigation bascule sans rechargement).

### Réponses aux questions du sujet
- **Routes utilisées :** `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/users/me`, `PUT /api/users/me`.
- **Mise à jour du profil :** côté front : `profile-page.html` (formulaire), `profile-page.ts` (méthode `save()`), `auth.service.ts` (méthode `update()`), `auth.interceptor.ts` (ajout du token). Côté back : `backend/src/app.js` (middleware `auth` + route `PUT /api/users/me`), `backend/src/models/User.js` (validation `minlength: 2`, méthode `toPublic()`).
- **Modèle utilisé et conseil :** on peut demander conseil à l'assistant lui-même en décrivant la tâche, consulter la documentation du fournisseur (Anthropic, OpenAI…) ou demander à l'enseignant.

### Ce que l'etudiant sait expliquer sans l'agent
- Le fonctionnement d'un Reactive Form, des validateurs et de `touched`.
- Pourquoi `subscribe()` déclenche réellement la requête HTTP (Observable paresseux).
- Pourquoi un `401` sur `/api/auth/login` ne doit **pas** provoquer de redirection — et pourquoi l'intercepteur exclut les routes `/api/auth/` avec `!request.url.startsWith('/api/auth/')`.
- Pourquoi `inject()` est appelé en dehors de `catchError` dans l'intercepteur (injection uniquement dans le contexte d'injection Angular, pas dans une closure asynchrone).
- Pourquoi la déconnexion n'appelle pas le serveur : le JWT est stateless, il suffit de le supprimer localement.
- Le rôle de `computed()` pour `isLoggedIn` : valeur dérivée mise à jour automatiquement quand `token()` change.

---

# TP2 — Bibliothèque, upload et lecture audio

## Outils utilisés

| Phase | Assistant | Modèle | Mode |
|---|---|---|---|
| Diagnostic de l'existant | Claude Code dans VS Code | `claude-sonnet-4-6` | Lecture du workspace, liste de ce qui manque par rapport au sujet |
| Contre-vérification + code | Claude Application (web/desktop) | `claude-opus-5-5` | Lecture du code cloné, compilation sur une copie locale, aucune modification de notre dépôt |
| Corrections finales + rapports | Claude Code dans VS Code | `claude-sonnet-4-6` | Accès direct au workspace, modification des fichiers, rédaction des rapports |

Nous avons volontairement utilisé deux assistants : le premier pour un diagnostic rapide sur le workspace, le second pour le vérifier de façon indépendante et comprendre chaque choix avant d'intégrer le code.

---

## Diagnostic initial du TP2

### Démarche

L'assistant a été invité à identifier les éléments manquants par rapport aux exigences du TP2, sans générer de code, afin d'obtenir un diagnostic objectif de l'état du projet.

### Résultat de l'agent VS Code
- Mission 2 : pagination jugée fonctionnelle ; seul manque signalé : un Signal `error` (l'erreur de chargement n'apparaissait qu'en console).
- Mission 3 : pas de validation du fichier avant l'envoi (format, 25 Mo), pas d'état `uploading` (double soumission possible), succès et erreurs uniquement en console, `<input type="file">` non vidé après l'envoi, pas d'indication du morceau en cours, pas d'erreur de lecture affichée, `ObjectURL` non révoquée à la destruction du composant, pistes non présentées en cards.

### Contre-vérification (Claude Application)

Le diagnostic du premier agent a été soumis au second pour validation et complément.

L'agent a confirmé tous les points du diagnostic, puis a relevé des points supplémentaires :
- `@if (loading())` et `@for` étaient côte à côte : au premier chargement, "Chargement…" et "Aucune piste." pouvaient s'afficher en même temps.
- Deux cas d'erreur audio distincts à traiter : échec du téléchargement HTTP, et fichier illisible par le navigateur.
- Points restants du TP1 encore ouverts : chargement automatique du profil, et `logout()` déclenché par l'intercepteur sur un mauvais mot de passe (condition `/api/auth/` manquante).

### Ce que nous en retenons
Un premier diagnostic d'IA peut être plausible mais incomplet. Croiser avec un second agent et relire le sujet ligne par ligne a permis de trouver un vrai bug d'affichage (spinner + "Aucune piste" simultanés) que le premier agent avait jugé correct.

---

## Mission 2 — Bibliothèque paginée

### Objectif
Afficher les pistes page par page avec pagination serveur (`GET /api/tracks?page=...&limit=...`), état représenté par des Signals (`tracks`, `page`, `pages`, `loading`, `loadError`), affichage `@for` / `@empty` / `@if` et boutons désactivés aux bornes, sans modifier le backend.

### Démarche

La session a commencé par une présentation générale du projet, puis chaque demande a été traitée une par une. L'accent a été mis sur l'explication des choix d'architecture et des raisons de chaque décision technique, avant de passer à la demande suivante.

### Plan proposé par l'agent
1. Vérifier `TrackService.list(page, limit)` — déjà correct, aucun changement.
2. Ajouter le Signal `loadError` et réécrire `load()`.
3. Corriger l'affichage avec `@if (loading())` / `@else if (loadError())` / `@else` contenant `@for` / `@empty`.
4. Boutons Préc./Suiv. désactivés aux bornes.
5. Vérifier dans Network qu'une requête part à chaque changement de page.

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | Ajout signaux `loadError`, `uploading`, `uploadError`, `uploadSuccess`, `fileError`, `currentTrack`, `audioError` ; validation fichier dans `choose()` ; `ngOnDestroy()` ; `formatSize()` / `formatDate()` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Affichage de tous les signaux d'erreur/succès, indicateur morceau en cours, lecteur déplacé hors des cards |
| `frontend-starter/src/app/components/tracks-page/tracks-page.css` | Styles cards, `.playing`, `.pager`, `.player` |
| `frontend-starter/src/app/components/profile-page/profile-page.ts` | Auto-chargement dans `constructor()`, signaux `saveSuccess` / `saveError`, `minLength(2)` |
| `frontend-starter/src/app/components/profile-page/profile-page.html` | Messages succès/erreur, suppression bouton "Charger" manuel, état "Chargement…" |
| `frontend-starter/src/app/shared/interceptors/auth.interceptor.ts` | Condition `!request.url.startsWith('/api/auth/')` sur le 401 |
| `frontend-starter/src/app/shared/services/auth.service.ts` | Log `email` → `id` dans `storeAuthentication()` |
| `frontend-starter/best-practices.md` | Section Tests + section Rapports de progression |
| `RAPPORT_TP1.md` | Section "Corrections post-rendu" |

`TrackService` n'a pas été modifié : la pagination était déjà fonctionnelle.

### Vérifications à réaliser
- `ng build` sans erreur.
- Network : requête `tracks?page=1&limit=5` au chargement, `tracks?page=2&limit=5` après clic Suivant.
- Backend arrêté → message d'erreur visible dans l'UI (pas juste en console).
- Upload : multipart avec champs `audio` et `title` visibles dans Request Payload.
- Fichier > 25 Mo → message d'erreur avant l'envoi, aucune requête réseau.
- Lecture audio → `Authorization: Bearer ...` présent dans les Request Headers.
- Quitter la page après lecture → aucune fuite mémoire (ObjectURL révoquée).

### Preuves de fonctionnement
*(Captures à ajouter — masquer le token)*

| Scénario | Méthode | URL | Statut | Observation |
|---|---|---|---|---|
| Chargement page 1 | GET | `/api/tracks?page=1&limit=5` | 200 | `items` ≤ 5, `pages` dans la réponse |
| Clic Suivant | GET | `/api/tracks?page=2&limit=5` | 200 | Nouvelle requête, paramètre `page` mis à jour |
| Backend arrêté | GET | `/api/tracks?page=1&limit=5` | 0 | Message d'erreur affiché dans l'UI |
| Upload réussi | POST | `/api/tracks` | 201 | Multipart `audio` + `title` ; message succès affiché |
| Fichier invalide | — | — | — | Erreur affichée immédiatement, aucune requête envoyée |
| Lecture audio | GET | `/api/tracks/:id/audio` | 200 | Header `Authorization` présent ; piste courante indiquée |

### Ce que l'étudiant sait expliquer sans l'agent
- Pourquoi la pagination est faite par le serveur (`skip`/`limit` MongoDB) et non par découpage dans Angular.
- Pourquoi la requête est dans `TrackService` et pourquoi le service ne fait pas de `subscribe()`.
- Pourquoi l'état de la liste est dans le composant et non dans `TrackService`.
- Le rôle de chaque Signal et pourquoi `limit` n'en est pas un.
- Pourquoi `loading.set(false)` doit être dans `next` ET dans `error`.
- Pourquoi une URL directe dans `src` ne peut pas porter le header `Authorization`.
- La différence entre streaming serveur, téléchargement Blob complet côté client, et 100 balises `<audio>` pré-chargées.
- Pourquoi `URL.createObjectURL` doit être révoquée et ce qui arrive si on ne le fait pas.

---

## Fonctionnalités optionnelles — Démarche

| Phase | Assistant | Modèle | Mode |
|---|---|---|---|
| Fonctionnalités optionnelles 1, 2, 3 + rapports | Claude Code dans VS Code | `claude-sonnet-4-6` | Accès direct au workspace, modification des fichiers, rédaction des rapports |

Pour chaque fonctionnalité, le workflow suivi était : explication du plan + diagramme de flux → confirmation → implémentation fichier par fichier → documentation dans `RAPPORT_TP2.md` → vérification `ng build`. Ce workflow a été formalisé progressivement dans `best-practices.md` au cours des sessions.

---

## Script de peuplement de données

### Objectif
Créer suffisamment de pistes dans la base pour tester la pagination. L'assistant a été invité à écrire un script bash qui se connecte à l'API, crée un compte de test si nécessaire, et envoie plusieurs fichiers audio factices.

### Plan proposé par l'agent
Création du fichier `frontend-starter/fichiers-audio-de-test/seed-tracks.sh` : authentification via `POST /api/auth/login`, inscription via `POST /api/auth/register` si le compte n'existe pas, génération de fichiers `.mp3` factices avec `dd`, envoi via `curl` multipart vers `POST /api/tracks`.

### Erreurs ou propositions corrigées

**Correction 1 — Connexion silencieuse.**
Le script a été exécuté mais la connexion échouait sans aucun message d'erreur. Le comportement observé a été signalé à l'agent (sortie du terminal montrée). L'agent a relu le script, identifié la cause et proposé une correction. La correction a été appliquée et le script relancé.

**Correction 2 — Pistes absentes après exécution.**
Malgré la correction précédente, aucune piste n'apparaissait dans l'interface après exécution du script. Ce résultat a été signalé à l'agent. L'agent a proposé une deuxième correction ciblant l'envoi des fichiers. La correction a été appliquée, le script relancé, et les pistes sont apparues dans l'interface.

Les détails techniques de chaque correction sont documentés dans `RAPPORT_TP2.md`.

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `frontend-starter/fichiers-audio-de-test/seed-tracks.sh` | Création du script de peuplement |

---

## Fonctionnalité optionnelle 1 — Suppression de piste

### Déclenchement
La fonctionnalité a été demandée après confirmation que le script de peuplement fonctionnait.

### Plan proposé par l'agent
Ajout d'un bouton de suppression avec confirmation en deux clics. Plan : nouvelle méthode `delete(id)` dans le service, deux Signals `confirmId` et `deletingId` dans le composant, trois méthodes `askDelete` / `cancelDelete` / `confirmDelete`, affichage conditionnel dans le template, nettoyage du lecteur si la piste supprimée était en cours de lecture, décrémentation de page si c'était le dernier élément.

### Erreurs ou propositions rejetées
Aucune proposition rejetée. La fonctionnalité a été implémentée en une passe, validée manuellement.

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `frontend-starter/src/app/shared/services/track.service.ts` | Ajout de `delete(id)` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | Signals `confirmId`, `deletingId` et méthodes associées |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Bloc conditionnel Confirmer/Annuler par ligne |
| `frontend-starter/src/app/components/tracks-page/tracks-page.css` | Styles `.btn-danger` et `.btn-danger-outline` |
| `RAPPORT_TP2.md` | Section Fonctionnalité optionnelle 1 |

### Ce que l'étudiant sait expliquer sans l'agent
- Pourquoi `confirmId` stocke un `string | null` plutôt qu'un `boolean`.
- Pourquoi le nettoyage du lecteur audio se fait dans le callback `next` de la suppression.
- Pourquoi le bouton est désactivé (et non caché) pendant la requête.

---

## Fonctionnalité optionnelle 2 — Recherche par titre

### Déclenchement
La fonctionnalité a été enchaînée dans la même session après validation de la suppression.

### Plan proposé par l'agent
Ajout d'un filtre MongoDB regex côté backend sur le champ `title`, paramètre `search` optionnel ajouté à `TrackService.list()`, `FormControl` débounté dans le composant avec `debounceTime(300)` et `distinctUntilChanged()`, remise à la page 1 à chaque nouvelle recherche, mise à jour de `API_CONTRACT.md`.

### Erreurs ou propositions rejetées
Aucune proposition rejetée.

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `backend/src/app.js` | Filtre MongoDB regex sur `title` si `search` présent |
| `frontend-starter/src/app/shared/services/track.service.ts` | Paramètre `search` dans `list()` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | `FormControl search`, abonnement débounté, `ngOnDestroy` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Champ de recherche |
| `API_CONTRACT.md` | Paramètre `search` documenté |
| `RAPPORT_TP2.md` | Section Fonctionnalité optionnelle 2 |

### Ce que l'étudiant sait expliquer sans l'agent
- Pourquoi le filtre doit être côté serveur et non côté client.
- Le rôle de `debounceTime` et `distinctUntilChanged`.
- Pourquoi la `Subscription` doit être détruite dans `ngOnDestroy`.
- Pourquoi la page est remise à 1 à chaque nouvelle recherche.

---

## Fonctionnalité optionnelle 3 — Paginateur Angular Material

### Déclenchement
Demande de remplacement du paginateur manuel par `<mat-paginator>` avec possibilité de changer le nombre de pistes par page.

### Plan proposé par l'agent
Installation du thème Material dans `angular.json`, import de `MatPaginatorModule`, Signal `total` pour alimenter `[length]`, Signal `limit` comme source unique de vérité pour la taille de page, méthode `pageChange(event: PageEvent)` pour la navigation, `provideAnimations()` dans `main.ts`.

### Erreurs ou propositions corrigées

**Correction 1 — Taille de page sans effet.**
Après l'implémentation initiale, il a été constaté que changer la taille de page dans le sélecteur ne modifiait pas les résultats affichés. Ce comportement a été signalé à l'agent. L'agent a expliqué la cause, proposé une correction, et demandé confirmation avant d'appliquer. La correction a été validée et appliquée.

**Correction 2 — Flèches de navigation inactives.**
Après la première correction, les flèches du paginateur s'affichaient mais ne répondaient à aucun clic. Le problème a été signalé à l'agent. L'agent a identifié la cause, proposé d'ajouter une configuration dans le bootstrap, redémarré l'application, et les flèches ont fonctionné.

**Correction 3 — Sélecteur couvrant visuellement les pistes.**
Le sélecteur de taille de page intégré au composant chevauchait les noms de pistes à l'ouverture. Le problème a été signalé avec une capture. L'agent a proposé une première correction CSS — appliquée mais sans effet. Le problème a été signalé à nouveau. L'agent a proposé une deuxième approche CSS — toujours sans effet. Après ce deuxième échec, l'agent a proposé une solution différente évitant entièrement le sélecteur intégré du composant, remplacé par un élément HTML natif. Cette solution a résolu le problème.

**Correction 4 — Contrôle "Pistes par page" sur toute la largeur.**
Le contrôle nouvellement ajouté s'affichait en colonne au lieu d'être sur une seule ligne. Le problème a été signalé. L'agent a identifié qu'un style global du projet en était la cause et proposé de changer l'élément HTML utilisé. La correction a été appliquée et le rendu était correct.

Les détails techniques de chaque correction sont documentés dans `RAPPORT_TP2.md`.

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `frontend-starter/angular.json` | Thème Material `indigo-pink.css` ajouté aux styles |
| `frontend-starter/src/main.ts` | `provideAnimations()` ajouté aux providers |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | `MatPaginatorModule`, Signal `total`, `pageChange()`, `changePageSize()` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | `<mat-paginator>` avec `[hidePageSize]`, `<select>` natif, layout `.library-col` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.css` | Règles de layout `.pager-bar`, `.page-size-control` |
| `RAPPORT_TP2.md` | Section Fonctionnalité optionnelle 3 |

### Ce que l'étudiant sait expliquer sans l'agent
- Pourquoi `mat-paginator` est 0-indexé et comment convertir.
- Pourquoi `provideAnimations()` est nécessaire.
- Pourquoi les tentatives de surcharge CSS Material ont échoué et quelle est la bonne approche.

---

## AVANCÉ — Pagination Mongoose avec `aggregate-paginate-v2`

### Déclenchement
Demande d'implémentation de la fonctionnalité AVANCÉ du sujet TP2 : remplacer la pagination manuelle (`find + skip/limit + countDocuments`) par le plugin `mongoose-aggregate-paginate-v2`, afin de récupérer données et métadonnées de pagination en un seul pipeline MongoDB.

### Plan proposé par l'agent
Installation du package, enregistrement du plugin sur le schéma `Track` avec `schema.plugin()`, remplacement de la route `GET /api/tracks` par un pipeline d'agrégation (`$match`, `$sort`, `$project`) suivi d'un appel à `Track.aggregatePaginate()`, mise à jour de l'interface `Page<T>` dans le frontend, et adaptation des trois lectures du signal dans `load()` pour les nouveaux noms de champs.

### Erreurs ou propositions corrigées

**Correction 1 — Explication insuffisante du code.**
Après l'implémentation, les explications fournies résumaient le comportement global de chaque fichier sans détailler chaque ligne ajoutée ou modifiée. Ce niveau d'explication a été jugé insuffisant. L'agent a reçu la demande de tout réexpliquer ligne par ligne, et a fourni une description de chaque ligne : ce qu'elle fait, pourquoi elle est écrite ainsi, et quelle alternative aurait pu être choisie. Cette approche a été ajoutée dans `best-practices.md` comme exigence permanente.

Les détails techniques sont documentés dans `RAPPORT_TP2.md`, section "AVANCÉ — Pagination Mongoose".

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `backend/package.json` | Ajout de `mongoose-aggregate-paginate-v2` |
| `backend/src/models/Track.js` | Import du plugin + `schema.plugin(aggregatePaginate)` |
| `backend/src/app.js` | Import de `mongoose`, remplacement de la route `GET /api/tracks` par pipeline + `aggregatePaginate` |
| `frontend-starter/src/app/shared/models/page.model.ts` | Interface `Page<T>` mise à jour avec les champs du plugin |
| `frontend-starter/src/app/shared/services/track.service.ts` | Type de retour de `list()` aligné sur la nouvelle interface |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | `load()` : `response.docs`, `response.totalPages`, `response.totalDocs` |
| `API_CONTRACT.md` | Description de `Page<Track>` mise à jour |
| `RAPPORT_TP2.md` | Section AVANCÉ — Pagination Mongoose ajoutée |

### Ce que l'étudiant sait expliquer sans l'agent
- Pourquoi `aggregate()` ne caste pas automatiquement les chaînes en ObjectId.
- Ce que fait `schema.plugin()` et comment il étend le modèle.
- La différence entre `find()` et `aggregate()` pour le contrôle du type dans le filtre.
- Le format de réponse du plugin et pourquoi il est plus riche que l'ancien format manuel.
- Pourquoi `track._id` doit être converti manuellement en string dans le résultat d'un pipeline.

---

## AVANCÉ — Image de couverture

### Déclenchement
Demande d'implémentation de la fonctionnalité AVANCÉ « image de couverture » du sujet TP2. Parmi les deux approches proposées (upload manuel ou extraction automatique via tags ID3 / web service), l'approche upload manuel a été retenue car plus simple et sans dépendance à un service tiers. Un plan complet (fichiers touchés, diagramme de flux, points de sécurité) a été présenté et validé avant toute écriture de code.

### Plan proposé par l'agent
Côté backend : champ `coverName` optionnel et caché sur le modèle `Track`, passage de `upload.single` à `upload.fields` pour accepter audio + image, validation du type et de la taille image, nouvelle route `GET /tracks/:id/cover` protégée par JWT et vérification de propriété, nettoyage de l'image à la suppression. Côté frontend : champ `hasCover` sur l'interface, méthode `cover()` dans le service, gestion d'un dictionnaire d'`ObjectURL` indexé par id avec révocation systématique, affichage d'une vignette ou d'un placeholder dans la card.

### Erreurs ou propositions corrigées
Aucune correction nécessaire après implémentation : le plan a été validé en amont, le code a été expliqué fichier par fichier et ligne par ligne, et la compilation (`ng build`) ainsi que la vérification syntaxique backend (`node --check`) sont passées du premier coup. Les détails techniques sont documentés dans `RAPPORT_TP2.md`, section « AVANCÉ — Image de couverture ».

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `backend/src/models/Track.js` | Champ `coverName` + `hasCover` dans `toPublic()` |
| `backend/src/app.js` | Constantes/validation image, `upload.fields`, helper `removeUpload`, route cover, nettoyage DELETE, mapping `hasCover` |
| `frontend-starter/src/app/shared/models/track.model.ts` | Champ `hasCover?` |
| `frontend-starter/src/app/shared/services/track.service.ts` | `upload()` avec cover optionnelle, méthode `cover()` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | Signaux `coverUrls`/`coverError`, `chooseCover`, `loadCovers`, `revokeCovers` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Champ image + vignette/placeholder dans les cards |
| `frontend-starter/src/app/components/tracks-page/tracks-page.css` | Styles `.cover`, `.cover-placeholder`, `.track-info` |
| `API_CONTRACT.md` | Route cover, champ `coverImage`, booléen `hasCover` |
| `RAPPORT_TP2.md` | Section AVANCÉ — Image de couverture |

### Ce que l'étudiant sait expliquer sans l'agent
- La différence entre `upload.single()` et `upload.fields()` et la structure de `req.files`.
- Pourquoi la limite de taille image est vérifiée dans le handler et non par multer.
- Pourquoi la validation côté client ne remplace jamais la validation backend.
- Pourquoi chaque `ObjectURL` doit être révoqué et quand (changement de page, destruction).
- Pourquoi la route cover vérifie `ownerId` comme la route audio.
- Comment `hasCover` évite de requêter inutilement une couverture inexistante.

---

## Amélioration facultative — Barre de progression de l'upload

### Déclenchement
Demande d'ajouter une barre de progression pendant l'upload, pour compléter à 100 % les améliorations facultatives du sujet TP2. L'approche (progression mesurée côté client, sans modification backend) a été annoncée avant implémentation.

### Plan proposé par l'agent
Passer l'appel `http.post` du service en `reportProgress: true` + `observe: 'events'`, ajouter un signal `uploadProgress`, traiter les événements `UploadProgress` et `Response` dans le composant, afficher un élément natif `<progress>` conditionné par `uploading()`.

### Erreurs ou propositions corrigées
Une erreur de compilation est survenue : l'`aria-label` de la barre contenait une apostrophe française (« l'envoi ») à l'intérieur d'un binding Angular entre guillemets, ce que le parser de template a rejeté. La formulation a été corrigée pour supprimer l'apostrophe (« Progression envoi : X % »), et la compilation est ensuite passée sans erreur. Les détails techniques sont dans `RAPPORT_TP2.md`, section « Barre de progression de l'upload ».

### Fichiers effectivement modifiés

| Fichier | Modification |
|---|---|
| `frontend-starter/src/app/shared/services/track.service.ts` | `upload()` en `reportProgress`/`observe: 'events'` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.ts` | Import `HttpEventType`, signal `uploadProgress`, gestion des événements |
| `frontend-starter/src/app/components/tracks-page/tracks-page.html` | Élément `<progress>` conditionné par `uploading()` |
| `frontend-starter/src/app/components/tracks-page/tracks-page.css` | Styles `.upload-progress` |
| `RAPPORT_TP2.md` | Section Barre de progression de l'upload |

### Ce que l'étudiant sait expliquer sans l'agent
- La différence entre `observe: 'body'` (défaut) et `observe: 'events'`.
- Ce que porte un événement `UploadProgress` (`loaded`, `total`) et comment en tirer un pourcentage.
- Pourquoi la progression est mesurée côté navigateur et non côté serveur.
- Pourquoi la barre reste à 100 % un court instant avant la réponse finale.
