# Angular 22 coding instructions

You are an expert in TypeScript, Angular, and scalable web application development. Write functional, maintainable, performant, and accessible code.

## TypeScript and Angular

- Use strict type checking and avoid `any`; use `unknown` when the type is uncertain.
- Use standalone components. Do not set `standalone: true`: it is the default in Angular 22.
- Do not explicitly set `ChangeDetectionStrategy.OnPush`: it is the default in Angular 22.
- Use Signals for local state, `computed()` for derived state, and `inject()` for dependency injection.
- Prefer lazy-loaded feature routes where appropriate.
- Use native control flow (`@if`, `@for`, `@switch`) instead of structural directives.
- Prefer Reactive Forms (or Signal Forms for new forms) and keep templates simple.
- Use external templates/styles when a component is not trivial; paths are relative to its TypeScript file.

## Components and services

- Keep components small and focused on one responsibility.
- Use `input()` and `output()` functions instead of decorators for new APIs.
- Use `providedIn: 'root'` for singleton services.
- Organize reusable services, guards, interceptors, and models under `src/app/shared`.
- Never put passwords, API keys, or JWT secrets in Angular source code.

## Accessibility

- Follow WCAG AA minimums, including keyboard focus, labels, semantic HTML, and sufficient color contrast.
- Use `NgOptimizedImage` for static images.

## Testing — chaque fonctionnalité doit être testée

Toute fonctionnalité ajoutée au projet doit être vérifiée selon les trois niveaux suivants, dans l'ordre.

### 1. Build sans erreur

Avant de considérer une fonctionnalité terminée, lancer :

```bash
cd frontend-starter
ng build
```

Zéro erreur TypeScript et zéro avertissement Angular est la barre minimale. Un build qui passe ne garantit pas le bon fonctionnement, mais un build qui échoue signifie que la fonctionnalité est incomplète.

### 2. Test manuel dans le navigateur

Pour chaque fonctionnalité, tester au minimum :

- **Le chemin nominal (happy path) :** l'action produit le résultat attendu (UI mise à jour, requête HTTP correcte, statut 2xx).
- **Les cas d'erreur :** formulaire invalide, serveur injoignable (status 0), ressource non trouvée (404), accès non autorisé (401), données incorrectes (400/409).
- **L'état de chargement :** le bouton est désactivé pendant la requête, l'indicateur s'affiche, puis disparaît.
- **La persistence :** rechargement de la page (F5) → l'état est-il cohérent ?

Ouvrir systématiquement les **DevTools → onglet Network** (filtre XHR/Fetch) et vérifier pour chaque requête :
- méthode et URL ;
- corps de la requête (Request Payload) ;
- statut de la réponse ;
- présence ou absence de l'en-tête `Authorization`.

Ouvrir également la **console** pour confirmer l'absence d'erreurs inattendues.

### 3. Tests unitaires (`.spec.ts`)

Pour les services et les guards, créer un fichier `.spec.ts` dans le même dossier que le fichier testé. Les composants simples peuvent être testés manuellement ; les services avec logique HTTP ou les guards avec conditions doivent avoir un test automatisé. Lancer :

```bash
ng test
```

Un test unitaire minimal pour un service vérifie :
- que la bonne URL et la bonne méthode HTTP sont utilisées ;
- que le Signal ou la valeur de retour est correct en cas de succès ;
- que l'erreur est propagée en cas d'échec.

> **Priorité :** build → test manuel → test unitaire. Ne pas bloquer une livraison sur l'absence de tests unitaires, mais ne pas laisser une fonctionnalité sans test manuel documenté.

## Rapports de progression

### TP 1, 2 et 3

Créer un fichier `RAPPORT_TP{n}.md` à la racine du dépôt pour chaque TP (ex. `RAPPORT_TP1.md`, `RAPPORT_TP2.md`, `RAPPORT_TP3.md`). Ce fichier doit contenir :

- les réponses aux questions posées dans `SUJET_ETUDIANT_TP{n}.md` (missions, cartographie, routes, explication des mécanismes) ;
- la liste des fichiers modifiés et le rôle de chaque modification ;
- les vérifications effectuées (build, Network, tests manuels) ;
- les preuves de fonctionnement (captures DevTools, description des scénarios) ;
- le lien vers `RAPPORT_IA_MODELE.md` pour la partie usage de l'IA.

### Après les TP guidés — développement libre

Dès que le sujet de TP n'impose plus le contenu à développer, continuer à documenter le travail dans des rapports réguliers. Deux formes acceptées :

**Par fonctionnalité :** créer un fichier `RAPPORT_FEATURE_{nom}.md` à chaque nouvelle fonctionnalité ajoutée au projet (ex. `RAPPORT_FEATURE_player.md`). Y décrire :
- l'objectif fonctionnel et les fichiers concernés ;
- les choix techniques retenus et les alternatives écartées ;
- les routes API créées ou modifiées (`API_CONTRACT.md` doit être mis à jour en même temps) ;
- les vérifications et preuves de fonctionnement.

**Par journée de travail :** tenir un journal `JOURNAL.md` à la racine avec une entrée par séance, au format :
```
## AAAA-MM-JJ
- Fonctionnalité travaillée : …
- Fichiers modifiés : …
- Problèmes rencontrés et solutions : …
- Ce qui reste à faire : …
```

Dans les deux cas, mettre à jour `RAPPORT_IA_MODELE.md` avec les prompts utilisés, les fichiers lus ou modifiés par l'assistant et les vérifications réalisées sans l'agent.
