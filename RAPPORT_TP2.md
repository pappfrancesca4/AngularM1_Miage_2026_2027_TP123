# Rapport TP2 — Bibliothèque, Upload et Lecture Audio

## Mission 2 — Bibliothèque paginée

### Analyse de `TrackService.list(page, limit)`

La méthode était déjà correctement implémentée avant le TP2. Elle accepte deux paramètres avec des valeurs par défaut (`page = 1`, `limit = 5`) et les passe directement à `HttpClient` via l'option `params`. Angular encode automatiquement ces valeurs en query string (`GET /api/tracks?page=1&limit=5`) sans qu'il soit nécessaire de construire l'URL manuellement — ce qui aurait risqué des problèmes d'encodage.

**Pourquoi la requête est dans le service et pas dans le composant :** séparation des responsabilités — le service connaît l'API, le composant connaît l'UI. Si l'URL change, on ne modifie qu'un seul endroit.

**Pourquoi le service ne fait pas de `.subscribe()` :** un Observable est paresseux. Le service retourne l'Observable, c'est le composant qui décide quand l'exécuter (et combien de fois). Faire le `subscribe()` dans le service rendrait la logique incontrôlable et non testable.

**Pourquoi l'état de la liste est dans le composant et non dans `TrackService` :** la liste des pistes ne concerne que la page bibliothèque. `currentUser` est dans `AuthService` parce que plusieurs pages y accèdent (nav, profil, tracks). `tracks` ne sert nulle part ailleurs — la mettre dans le service serait une abstraction prématurée.

**Pourquoi `limit` n'est pas un Signal :** une valeur constante n'a pas besoin d'être réactive. Un Signal a un coût (enregistrement, recalcul) ; on ne l'utilise que quand la valeur change au cours du temps.

### Flux de pagination

```text
TracksPageComponent.go(n)
  → page.set(n)
  → load()
    → TrackService.list(page(), 5)
      → HttpClient GET /api/tracks?page=n&limit=5
        → Express → MongoDB .skip((n-1)*5).limit(5)
          → { items, page, limit, total, pages }
        → tracks.set(items), pages.set(pages)
```

Chaque clic sur « Précédent » ou « Suivant » déclenche une **nouvelle requête HTTP** vers le serveur. Il est interdit de charger toutes les pistes d'un coup et de les découper localement : cela irait à l'encontre de la pagination serveur et chargerait des données inutiles en mémoire.

### Signals de l'état

| Signal | Type | Rôle |
|---|---|---|
| `tracks` | `Track[]` | Liste des pistes de la page courante |
| `page` | `number` | Page courante (commence à 1) |
| `pages` | `number` | Nombre total de pages renvoyé par le serveur |
| `loading` | `boolean` | Vrai pendant la requête HTTP |
| `loadError` | `string` | Message d'erreur si `list()` échoue |

`loading.set(false)` doit être appelé **dans `next` ET dans `error`** : si on ne le faisait que dans `next`, un échec laisserait le spinner bloqué indéfiniment.

---

## Mission 3 — Upload et lecture audio

### Identification des mécanismes dans le code

| Mécanisme | Fichier | Méthode / ligne |
|---|---|---|
| Choix du fichier | `tracks-page.ts` | `choose(event)` — lit `event.target.files[0]` |
| Validation frontend | `tracks-page.ts` | `choose()` — vérifie `type` MIME et `size` |
| Construction du `FormData` | `track.service.ts` | `upload()` — `body.append('audio', file)` + `body.append('title', title)` |
| Appel HTTP d'upload | `track.service.ts` | `upload()` — `http.post<Track>('/api/tracks', body)` |
| Récupération du `Blob` | `track.service.ts` | `audio()` — `responseType: 'blob'` |
| Création de l'`ObjectURL` | `tracks-page.ts` | `play()` — `URL.createObjectURL(blob)` |
| Révocation de l'ancienne URL | `tracks-page.ts` | `play()` — `URL.revokeObjectURL(previousUrl)` avant la nouvelle |
| Révocation à la destruction | `tracks-page.ts` | `ngOnDestroy()` — révocation si une URL existe encore |
| Affectation au lecteur audio | `tracks-page.html` | `<audio [src]="audioUrl()">` |

### Flux composant → service → API → Blob → lecteur

```text
1. Utilisateur clique ▶ sur une piste
2. TracksPageComponent.play(track)
3. TrackService.audio(track.id) → Observable<Blob>
4. authInterceptor ajoute Authorization: Bearer <token>
5. GET /api/tracks/:id/audio → Express vérifie JWT, ouvre le fichier sur disque
6. Express stream le fichier audio en réponse (Content-Type: audio/mpeg etc.)
7. HttpClient reçoit la réponse complète → émet un Blob
8. play() révoque l'ObjectURL précédente si elle existe
9. URL.createObjectURL(blob) → URL temporaire locale (blob:http://...)
10. audioUrl.set(url) → <audio src="blob:..."> → navigateur lit le fichier
```

### Pourquoi une URL directe dans `src` ne reçoit pas le header `Authorization`

Quand le navigateur charge un `src="https://..."` sur un élément `<audio>` ou `<img>`, il fait une requête navigateur ordinaire, pas une requête `fetch`/`XHR`. Les intercepteurs Angular n'interviennent que sur les appels `HttpClient`. Le navigateur n'ajoute pas d'en-tête `Authorization` de lui-même — la requête arriverait sans token, le middleware Express refuserait avec un 401, et l'audio ne jouerait pas.

La solution retenue (Blob + ObjectURL) contourne ce problème : `HttpClient` télécharge le fichier avec le header JWT, puis on crée une URL locale que le navigateur lit sans requête réseau supplémentaire.

### Contrôles backend identifiés dans le code

Dans `backend/src/app.js`, le middleware Multer est configuré pour :
- n'accepter que les fichiers dont le `mimetype` est `audio/mpeg`, `audio/wav`, `audio/ogg` ou `audio/mp4` ;
- refuser les fichiers de plus de **25 Mo** (`limits: { fileSize: 25 * 1024 * 1024 }`).

Le frontend construit bien le FormData avec exactement les champs `audio` (le fichier) et `title` (le texte), ce que le backend attend.

### Validation frontend vs validation backend

La validation frontend (vérification du type MIME et de la taille avant l'envoi) **améliore l'expérience utilisateur** : l'erreur est immédiate, avant même de démarrer un transfert potentiellement long. Mais elle ne remplace pas la validation backend pour deux raisons :
1. N'importe qui peut envoyer une requête HTTP directement (Postman, curl) en contournant Angular.
2. Le type MIME envoyé par le navigateur peut être falsifié ; le backend doit vérifier lui-même le contenu réel du fichier.

### Corrections apportées au composant

| Problème | Solution |
|---|---|
| Pas de validation fichier | `choose()` vérifie le type MIME et la taille ; si invalide, reset de l'input et message `fileError` |
| Double soumission possible | Signal `uploading` — bouton désactivé pendant la requête |
| Succès/erreur upload invisibles | Signaux `uploadSuccess` et `uploadError` affichés dans le template |
| `<input type="file">` non vidé | Référence `fileInput` conservée ; `fileInput.value = ''` après succès |
| Pas d'indication du morceau en cours | Signal `currentTrack` — classe CSS `playing` et bouton "▶ En cours" |
| Erreur audio invisible | Signal `audioError` affiché sous le lecteur |
| `ObjectURL` non révoquée en quittant la page | `ngOnDestroy()` appelle `URL.revokeObjectURL()` |

---

## Questions — Mémoire, buffering et streaming

**1. Le backend envoie-t-il le fichier entier en mémoire ou progressivement depuis le disque ?**

Le backend Express utilise `res.sendFile()` (ou un `fs.createReadStream()` via Multer). Express streame le fichier par morceaux (*chunks*) directement depuis le disque sans le charger entièrement en mémoire. C'est ce qu'on appelle le **streaming côté serveur** : la mémoire consommée par le serveur ne dépend pas de la taille du fichier.

**2. Avec `HttpClient` et `responseType: "blob"`, à quel moment le composant reçoit-il généralement le fichier ?**

`HttpClient` attend que la réponse HTTP soit **entièrement reçue** avant d'émettre dans l'Observable. Le composant reçoit donc le Blob complet d'un coup, une fois que tous les octets sont arrivés dans le navigateur. Ce n'est pas du streaming côté navigateur : si le fichier fait 20 Mo, Angular attend les 20 Mo avant d'appeler `next()`.

**3. Si la bibliothèque contient 100 morceaux, les 100 fichiers audio sont-ils chargés en mémoire dès l'affichage de la liste ?**

Non. `GET /api/tracks?page=1&limit=5` ne retourne que les **métadonnées** (`id`, `title`, `originalName`, `mimeType`, `size`, `createdAt`) — aucun octet audio. Les fichiers audio ne sont téléchargés que quand l'utilisateur clique sur ▶, via `GET /api/tracks/:id/audio`. En affichant la liste, seules les métadonnées des 5 pistes de la page courante sont en mémoire.

**4. Quelle différence y aurait-il avec 100 éléments `<audio>` utilisant directement une URL HTTP ?**

Si 100 `<audio src="/api/tracks/:id/audio">` étaient dans la page, le navigateur déclencherait jusqu'à 100 requêtes HTTP pour pré-charger/bufferiser les fichiers dès le rendu. Cela provoquerait :
- une surcharge réseau et mémoire immédiate ;
- des échecs 401 car les balises `<audio>` n'envoient pas l'en-tête `Authorization` — les fichiers protégés ne pourraient pas être lus.

**5. Pourquoi l'URL créée par `URL.createObjectURL` doit-elle être révoquée ?**

`URL.createObjectURL(blob)` crée une référence interne (`blob:http://...`) que le navigateur associe au Blob en mémoire. Cette référence **n'est pas libérée par le ramasse-miettes** tant qu'on ne l'a pas révoquée explicitement, même si la variable qui la référençait est sortie de portée. Sans `URL.revokeObjectURL()`, chaque lecture d'un morceau alloue un nouveau Blob en mémoire sans jamais le libérer — une fuite mémoire progressive.

---

## Checkpoint Network

| Scénario | Méthode | URL | Statut | Observation |
|---|---|---|---|---|
| Chargement page 1 | GET | `/api/tracks?page=1&limit=5` | 200 | `items` ≤ 5, `pages` dans la réponse |
| Clic « Suivant » | GET | `/api/tracks?page=2&limit=5` | 200 | Nouvelle requête, `page: 2` |
| Upload réussi | POST | `/api/tracks` | 201 | Request payload : multipart avec champs `audio` et `title` |
| Upload fichier trop grand | — | — | — | Erreur affichée avant l'envoi (validation frontend) |
| Upload format invalide | — | — | — | Erreur affichée avant l'envoi (validation frontend) |
| Lecture audio | GET | `/api/tracks/:id/audio` | 200 | `Authorization: Bearer ...` présent ; réponse de type `audio/*` |
| Piste lue par un autre compte | GET | `/api/tracks/:id/audio` | 404 ou 403 | La piste n'appartient pas à l'utilisateur |

---

## Fonctionnalité optionnelle 1 — Suppression de piste

### Description

Ajout d'un bouton de suppression sur chaque piste, avec confirmation en deux clics pour éviter les suppressions accidentelles.

### Flux de données

```
User clicks 🗑 button
  → askDelete(id)
      → confirmId.set(id)           // shows Confirm/Cancel buttons on that row
User clicks Confirmer
  → confirmDelete(id)
      → confirmId.set(null)         // close confirmation immediately
      → deletingId.set(id)          // show "…" on that row
      → TrackService.delete(id)
        → DELETE /api/tracks/:id    [HTTP, JWT]
          → MongoDB deleteOne + fs.unlink
          → 204 No Content
      → deletingId.set(null)
      → if currentTrack.id === id: revoke blob URL, clear player
      → if last track on page > 1: page.set(page - 1)
      → load()
```

### Fichiers modifiés

**`track.service.ts` — nouvelle méthode `delete()`**

Une méthode `delete(id)` a été ajoutée au service. Elle envoie une requête `DELETE` vers `/api/tracks/:id` en utilisant l'identifiant de la piste. Elle retourne un `Observable<void>` car le backend répond `204 No Content` sans corps — le composant s'abonne et gère lui-même les changements d'état.

---

**`tracks-page.ts` — signals et méthodes**

- `readonly confirmId = signal<string | null>(null)` — contient l'`id` de la piste dont la suppression est en attente. Utilise `string | null` et non `boolean` : plusieurs pistes coexistent, un booléen ne permettrait pas de savoir laquelle est concernée.
- `readonly deletingId = signal<string | null>(null)` — contient l'`id` de la piste dont la requête DELETE est en cours, pour afficher `"…"` sur la bonne ligne.
- `askDelete(id)` : `confirmId.set(id)` — ouvre la confirmation sur cette ligne.
- `cancelDelete()` : `confirmId.set(null)` — ferme sans rien faire.
- `confirmDelete(id)` : ferme la confirmation, marque la piste comme en cours de suppression, appelle `service.delete()`. Dans le `next` callback : nettoie le lecteur audio si la piste lue était celle supprimée, décrémente la page si c'était la dernière piste d'une page > 1, puis recharge.

---

**`tracks-page.html` — template**

Pour chaque piste, le template utilise un bloc `@if` conditionnel basé sur `confirmId()`. Si `confirmId` est égal à l'identifiant de la piste en cours, on affiche deux boutons : « Confirmer » (rouge plein) et « Annuler ». Sinon, on affiche le bouton 🗑 habituel. Ce bouton est désactivé (`[disabled]`) pendant que la requête DELETE est en cours et affiche `"…"` à la place de l'icône pour indiquer l'état d'attente.

---

**`tracks-page.css`**

- `.btn-danger` : bouton rouge plein (Confirmer).
- `.btn-danger-outline` : bouton rouge contour (🗑).

### Vérification

- `ng build` : zéro erreur.
- Happy path : clic 🗑 → boutons Confirmer/Annuler apparaissent sur la bonne ligne → clic Confirmer → piste disparaît, liste rechargée.
- Annulation : clic Annuler → retour à l'état normal, aucune requête envoyée.
- Suppression de la piste en cours de lecture → lecteur audio fermé.
- Suppression de la dernière piste d'une page > 1 → retour automatique à la page précédente.

---

## Fonctionnalité optionnelle 2 — Recherche par titre

### Description

Ajout d'un champ de recherche débounté qui filtre les pistes côté serveur via une regex MongoDB insensible à la casse.

### Flux de données

```
User types in search input
  → FormControl.valueChanges
      → debounceTime(300ms)          // wait 300ms after last keystroke
      → distinctUntilChanged()       // skip if value unchanged
      → page.set(1) + load()
          → TrackService.list(page, limit, search)
            → GET /api/tracks?page=1&limit=5&search=blues   [HTTP, JWT]
              → Express: if (req.query.search)
                  filter.title = { $regex: search, $options: 'i' }
              → MongoDB filters entire collection
              → { items, pages, total }
          → tracks.set(items), pages.set(pages), total.set(total)
  → @for renders filtered list
```

**Pourquoi côté serveur et non côté client :** un filtre client ne parcourt que la page courante (5 items). Avec 50 pistes, 45 seraient invisibles. Le filtre doit être envoyé au backend pour que MongoDB filtre la totalité de la collection.

**Pourquoi `debounceTime(300)` :** sans délai, chaque frappe envoie une requête HTTP. Avec 10 caractères tapés rapidement, 10 requêtes partent. Le debounce attend 300 ms après la dernière frappe avant d'envoyer, réduisant à 1 requête dans la plupart des cas.

**Pourquoi `distinctUntilChanged()` :** si l'utilisateur tape « a » puis efface, la valeur revient à « » — sans ce filtre, une requête partirait inutilement. `distinctUntilChanged` compare la valeur courante à la précédente et ignore les doublons.

### Fichiers modifiés

**`backend/src/app.js` — route GET /api/tracks**

Le filtre MongoDB est construit conditionnellement : si le paramètre `search` est présent dans la query string, un filtre regex est ajouté sur le champ `title`. Le flag `$options: 'i'` rend la comparaison insensible à la casse. Si `search` est absent ou vide, aucun filtre n'est ajouté et tous les documents sont renvoyés — une chaîne vide ne génère pas de regex inutile.

---

**`track.service.ts` — méthode `list()`**

Un troisième paramètre `search = ''` a été ajouté à la méthode `list()`. L'objet `params` commence avec `page` et `limit`, puis `search` n'est ajouté que s'il est non vide. Ainsi l'URL reste propre (`?page=1&limit=5`) quand il n'y a pas de recherche active, et le backend n'évalue pas de regex inutile.

---

**`tracks-page.ts` — FormControl et abonnement**

Un `FormControl` non-nullable a été ajouté pour le champ de recherche. Dans le constructeur, on s'abonne à ses `valueChanges` en appliquant deux opérateurs RxJS : `debounceTime(300)` pour attendre 300 ms après la dernière frappe, et `distinctUntilChanged()` pour ignorer si la valeur n'a pas changé. À chaque émission, on remet la page à 1 et on recharge. La `Subscription` est stockée dans une propriété privée `searchSub` et détruite dans `ngOnDestroy` pour éviter une fuite mémoire si le composant est détruit lors d'une navigation.

---

**`tracks-page.html` — input de recherche**

Un champ `<input>` lié au `FormControl` `search` avec `[formControl]` a été ajouté au-dessus de la liste des pistes. La liaison réactive fait que chaque frappe met à jour le contrôle, déclenchant le pipeline `valueChanges` décrit ci-dessus.

---

**`API_CONTRACT.md`**

Route mise à jour : `GET /tracks?page=1&limit=5&search=` — paramètre `search` optionnel, filtre sur le titre, insensible à la casse.

### Vérification

- Taper `blues` → 1 résultat.
- Taper `jazz` → 1 résultat.
- Vider le champ → tous les résultats réapparaissent.
- DevTools Network : une seule requête part 300 ms après la dernière frappe.
- La pagination repart de la page 1 à chaque nouvelle recherche.

---

## Fonctionnalité optionnelle 3 — Paginateur Angular Material

### Description

Remplacement du paginateur manuel (boutons Préc./Suiv. et texte « Page X / Y ») par le composant `<mat-paginator>` d'Angular Material, avec un sélecteur de taille de page natif placé en dehors de la carte pour éviter les problèmes de superposition.

### Flux de données

```
User clicks paginator arrow
  → MatPaginator emits (page) event  →  pageChange(event: PageEvent)
      → page.set(event.pageIndex + 1)   // 0-indexed → 1-indexed
      → load()
          → TrackService.list(page, limit, search)
            → GET /api/tracks?page=X&limit=5
              → Track.aggregatePaginate(pipeline, { page, limit })
              → { docs, totalDocs, totalPages, ... }
          → tracks.set(docs), pages.set(totalPages), total.set(totalDocs)
  → <mat-paginator [length]="total()" [pageIndex]="page() - 1">

User changes native <select>
  → changePageSize(size)
      → limit.set(size)
      → page.set(1)
      → load()
```

### Fichiers modifiés

**`angular.json` — styles**

Le thème pré-construit `indigo-pink` d'Angular Material a été ajouté au tableau `styles` de `angular.json`, avant `src/styles.css`. `mat-paginator` est un composant Material et nécessite un thème CSS chargé globalement. Le thème pré-construit évite de configurer un thème sur-mesure avec Sass.

---

**`main.ts` — `provideAnimations()`**

`provideAnimations()` a été ajouté au tableau `providers` du bootstrap. Angular Material utilise le module d'animations Angular pour ses interactions (ondulations sur les boutons, transitions). Sans cet appel, les boutons de `mat-paginator` s'affichent mais ne répondent pas aux clics — le composant est visuellement présent mais inactif.

---

**`tracks-page.ts` — signals et méthodes**

- `MatPaginatorModule` et `PageEvent` importés depuis `@angular/material/paginator`.
- `readonly limit = signal(5)` : source unique de vérité pour la taille de page — passé à `service.list()` et lié à `[pageSize]` dans le template.
- `readonly total = signal(0)` : `mat-paginator` en a besoin pour calculer le nombre de pages. Alimenté par `total.set(response.totalDocs)` dans `load()`.
- `pageChange(event: PageEvent)` : `page.set(event.pageIndex + 1)` puis `load()`. Conversion nécessaire : `mat-paginator` est 0-indexé, le backend est 1-indexé.
- `changePageSize(size: number)` : `limit.set(size)` + `page.set(1)` + `load()`. Appelé par le `<select>` natif.

---

**`tracks-page.html` — layout**

La carte des pistes et la barre de pagination sont enveloppées dans un `div.library-col` en `flex-direction: column`. La barre de pagination (`.pager-bar`) contient deux éléments côte à côte : un contrôle de taille de page à gauche et `<mat-paginator>` à droite. `mat-paginator` est configuré avec `[length]` (total d'items), `[pageSize]` (lié au signal `limit`), `[pageIndex]` (lié à `page() - 1` pour la conversion d'indexation) et `[hidePageSize]="true"` pour masquer son propre sélecteur.

**Pourquoi `[hidePageSize]="true"` :** `mat-paginator` inclut un sélecteur de taille basé sur Angular CDK. Quand le composant est en bas de l'écran, le CDK ouvre le dropdown *vers le haut*, au-dessus des noms de pistes. Masquer ce sélecteur avec `[hidePageSize]="true"` et le remplacer par un `<select>` HTML natif élimine complètement le problème — le `<select>` natif est géré par le navigateur et ne passe pas par le CDK.

---

**`tracks-page.css`**

Nouvelles règles ajoutées : `.library-col` en flex colonne pour empiler la carte et la barre de pagination. `.pager-bar` en flex row avec `justify-content: space-between` pour séparer le sélecteur de taille à gauche et `mat-paginator` à droite. Un `margin-top: 5rem` pousse la barre sous la carte car `mat-paginator` a des paddings internes qui créent une hauteur visuellement plus grande que le composant affiché. `.page-size-control` en flex row avec `align-items: center` pour aligner le texte et le `<select>` sur la même ligne.

**Pourquoi `<div class="page-size-control">` et non `<label>` :** le fichier `styles.css` global contient une règle `label { display: grid }`, ce qui empilait le texte et le `<select>` verticalement. Utiliser un `<div>` évite de modifier les styles globaux (qui s'appliquent à tous les formulaires du projet) juste pour ce cas particulier.

### Bugs rencontrés et solutions

| Problème | Cause | Solution |
|---|---|---|
| Flèches ne répondent pas aux clics | `provideAnimations()` absent de `main.ts` | Ajout de `provideAnimations()` |
| Dropdown CDK s'ouvre vers le haut et couvre les pistes | Angular CDK positionne les overlays vers le haut quand ils sont proches du bas du viewport | Remplacement par un `<select>` natif + `[hidePageSize]="true"` |
| `!important` CSS ignoré sur `.mat-mdc-paginator-container` | Angular Material injecte ses styles *après* `styles.css` dans le bundle — ils gagnent par ordre de cascade | Ne pas utiliser `!important` contre Material ; préférer `[hidePageSize]` pour supprimer l'élément |
| `"Pistes par page"` s'affiche sur toute la largeur | `label { display: grid }` dans `styles.css` global | Utiliser `<div class="page-size-control">` au lieu de `<label>` |

### Vérification

- `ng build` : zéro erreur TypeScript, zéro avertissement Angular.
- Flèches « précédent » et « suivant » fonctionnent, la page change et une nouvelle requête HTTP part.
- Changer la taille (5 → 10 → 25) repart de la page 1 avec le nouveau `limit`.
- Aucun dropdown ne chevauche les noms de pistes.
- Recherche active + changement de page → les deux paramètres sont envoyés au backend.

---

## AVANCÉ — Pagination Mongoose avec `aggregate-paginate-v2`

### Description

Remplacement de la pagination manuelle (`find + skip/limit + countDocuments`) par le plugin `mongoose-aggregate-paginate-v2`, qui utilise un pipeline d'agrégation MongoDB pour récupérer les données et les métadonnées de pagination en un seul appel.

### Flux de données

```
GET /api/tracks?page=1&limit=5&search=blues
  → auth middleware (JWT → req.auth.sub)
  → filter = { ownerId: ObjectId(req.auth.sub) }
             + { title: { $regex: "blues", $options: "i" } }  // si search présent
  → Track.aggregate([
      { $match: filter },
      { $sort: { createdAt: -1 } },
      { $project: { storedName: 0 } },
    ])
  → Track.aggregatePaginate(aggregate, { page, limit })
    → MongoDB: $facet interne (pipeline + count)
    → { docs, totalDocs, totalPages, pagingCounter, hasPrevPage, ... }
  → docs.map(track => ({ ...track, id: String(track._id), _id: undefined }))
  → res.json({ ...result, docs })
```

### Fichiers modifiés

**`backend/package.json`**

Le package `mongoose-aggregate-paginate-v2` a été ajouté aux dépendances. Ce plugin étend les modèles Mongoose avec une méthode `aggregatePaginate()` qui prend un pipeline d'agrégation et des options de pagination, et renvoie un objet enrichi avec les métadonnées.

---

**`backend/src/models/Track.js`**

Deux lignes ajoutées :
- `import aggregatePaginate from "mongoose-aggregate-paginate-v2"` — importe le plugin.
- `schema.plugin(aggregatePaginate)` — enregistre la méthode `Track.aggregatePaginate()` sur le modèle. Ce pattern `schema.plugin()` est la façon standard d'étendre un modèle Mongoose sans modifier son schéma.

---

**`backend/src/app.js` — route `GET /api/tracks`**

L'approche précédente utilisait `Track.find(filter).skip(...).limit(...)` et `Track.countDocuments(filter)` en parallèle. Elle fonctionnait mais envoyait deux requêtes MongoDB indépendantes.

La nouvelle approche construit d'abord un pipeline d'agrégation :
- `$match : { ownerId: new mongoose.Types.ObjectId(req.auth.sub) }` — filtre les pistes par propriétaire. `new mongoose.Types.ObjectId()` est nécessaire car les pipelines d'agrégation ne castent pas automatiquement les chaînes en ObjectId, contrairement à `find()`.
- `$match : { title: { $regex: ..., $options: "i" } }` — ajouté conditionnellement si `req.query.search` est présent, pour la recherche par titre insensible à la casse.
- `$sort : { createdAt: -1 }` — trie du plus récent au plus ancien.
- `$project : { storedName: 0 }` — exclut le champ `storedName` (chemin disque) de la réponse.

`Track.aggregatePaginate(aggregate, { page, limit })` reçoit ce pipeline et utilise un `$facet` en interne pour exécuter en une seule requête : les documents paginés (avec `$skip` et `$limit`) ET le total (`$count`). Il renvoie `{ docs, totalDocs, totalPages, pagingCounter, hasPrevPage, hasNextPage, prevPage, nextPage }`.

La transformation finale `docs.map(track => ({ ...track, id: String(track._id), _id: undefined }))` remap l'identifiant : `aggregate()` renvoie des objets JavaScript bruts (pas des documents Mongoose), donc `track._id` est un `ObjectId` qu'il faut convertir manuellement en string `id` — là où `toPublic()` s'en chargeait avant.

---

**`frontend-starter/src/app/shared/models/page.model.ts`**

L'interface `Page<T>` a été mise à jour pour refléter le format natif du plugin : `docs` (au lieu de `items`), `totalDocs` (au lieu de `total`), `totalPages` (au lieu de `pages`), plus les champs supplémentaires `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`.

---

**`frontend-starter/src/app/shared/services/track.service.ts`**

La méthode `list()` renvoie maintenant `Observable<Page<Track>>` avec le nouvel type, sans modification de la requête HTTP elle-même.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.ts` — `load()`**

Trois lignes mises à jour dans le callback `next` :
- `this.tracks.set(response.docs)` — remplace `response.items`.
- `this.pages.set(response.totalPages)` — remplace `response.pages`.
- `this.total.set(response.totalDocs)` — remplace `response.total`.

---

**`API_CONTRACT.md`**

La description de `Page<Track>` a été mise à jour pour documenter le format natif du plugin.

### Vérification

- `ng build` : zéro erreur TypeScript.
- `GET /api/tracks` renvoie bien `docs`, `totalDocs`, `totalPages`, etc.
- Pagination, recherche et taille de page fonctionnent identiquement à avant.
- Aucune donnée n'est supprimée ou modifiée : c'est une refactorisation de la couche de lecture.

---

## AVANCÉ — Image de couverture

### Description

L'utilisateur peut joindre une image de couverture optionnelle (JPEG, PNG ou WebP, 5 Mo max) lors de l'upload d'une piste. L'image s'affiche en vignette dans la card. Sans image, un placeholder ♪ est affiché. L'approche retenue est l'upload manuel par l'utilisateur ; l'extraction automatique via tags ID3 ou web service reste une évolution possible.

### Flux de données

```
=== UPLOAD ===
User selects audio + (optionnel) cover image
  → upload()
      → FormData: 'audio', 'title', 'coverImage'? (si présente)
      → POST /api/tracks   [multipart, JWT]
          → multer.fields([audio, coverImage])
              → fileFilter par fieldname (audio vs image)
          → audio stocké → storedName ; image stockée → coverName
          → vérif taille image ≤ 5 Mo (sinon nettoyage + 400)
          → Track.create({ ..., coverName? })
          → { ..., hasCover: true/false }

=== AFFICHAGE ===
load() reçoit { docs } → loadCovers(docs)
  → pour chaque doc.hasCover === true :
      → GET /api/tracks/:id/cover   [JWT]
          → findOne(ownerId) + sendFile
          → flux image
      → Blob → createObjectURL → coverUrls[id]
  → @if (coverUrls()[track.id]) <img> @else placeholder ♪
```

### Fichiers modifiés

**`backend/src/models/Track.js`**

- `coverName: { type: String, select: false }` — nom de fichier disque de l'image. Pas de `required` (optionnel), `select: false` comme `storedName` : le chemin disque n'est jamais exposé par une requête normale.
- `hasCover: Boolean(this.coverName)` dans `toPublic()` — le frontend reçoit seulement un booléen, pas le nom de fichier. Il sait ainsi s'il doit requêter la couverture.

---

**`backend/src/app.js`**

- Constantes `MAX_IMAGE_SIZE` (5 Mo) et `allowedImage` (`image/jpeg`, `image/png`, `image/webp`). Le set audio est renommé `allowedAudio` pour la clarté.
- Helper `removeUpload(filename)` : supprime un fichier du dossier uploads en meilleur effort (log en cas d'échec, pas d'interruption). Factorisé car utilisé par le POST (nettoyage orphelins) et le DELETE (nettoyage couverture).
- `fileFilter` : la validation dépend de `file.fieldname`. Le champ `audio` est validé contre `allowedAudio`, le champ `coverImage` contre `allowedImage`, tout autre champ est rejeté.
- POST `/api/tracks` : `upload.single("audio")` devient `upload.fields([{audio}, {coverImage}])`. Les fichiers arrivent dans `req.files.audio[0]` et `req.files.coverImage[0]`. La limite image de 5 Mo est vérifiée dans le handler (multer n'a qu'une limite globale), avec nettoyage des deux fichiers si dépassée. `coverName: coverFile?.filename` est enregistré.
- Mapping `GET /api/tracks` : la déstructuration `({ _id, coverName, ...rest })` calcule `hasCover` et retire `coverName` du résultat.
- Nouvelle route `GET /api/tracks/:id/cover` : vérifie `ownerId`, charge `coverName` avec `select("+coverName")`, renvoie 404 si pas de couverture, sinon `sendFile` (le Content-Type est déduit de l'extension du fichier stocké).
- DELETE `/api/tracks/:id` : `select("+storedName +coverName")` puis `removeUpload(track.coverName)` en meilleur effort après la suppression de l'audio.
- Gestionnaire d'erreurs : les messages `"Format image non accepté"` et `"Champ de fichier inattendu"` renvoient aussi un 400.

---

**`frontend-starter/src/app/shared/models/track.model.ts`**

Champ `hasCover?: boolean` ajouté à l'interface `Track`.

---

**`frontend-starter/src/app/shared/services/track.service.ts`**

- `upload(file, title, cover?)` : 3e paramètre optionnel, ajouté au `FormData` sous `coverImage` seulement s'il est présent.
- `cover(id)` : GET en `responseType: 'blob'`, comme `audio(id)`, pour récupérer les octets de l'image.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.ts`**

- Constantes `ACCEPTED_IMAGE_TYPES` et `MAX_IMAGE_BYTES`.
- Signaux `coverUrls` (map `id → ObjectURL`) et `coverError`. Propriétés `coverFile` et `coverInput`.
- `chooseCover(event)` : valide type et taille côté client (meilleure UX), remplit `coverError` et vide l'input en cas d'échec. La validation backend reste la vraie barrière.
- `revokeCovers()` : révoque toutes les URLs blob et vide la map, pour éviter les fuites mémoire.
- `loadCovers(tracks)` : pour chaque piste avec `hasCover`, requête la cover, crée un `ObjectURL` et le stocke dans `coverUrls` via `.update()` (fusion immuable).
- `load()` : appelle `revokeCovers()` avant `tracks.set()` et `loadCovers()` après — les anciennes URLs sont libérées à chaque changement de page.
- `upload()` : transmet `coverFile` et le réinitialise (avec l'input et `coverError`) après succès.
- `ngOnDestroy()` : appelle `revokeCovers()` en plus de la révocation de l'URL audio.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.html`**

- Champ fichier image `accept="image/jpeg,image/png,image/webp"` dans la card d'upload, avec affichage de `coverError`.
- Dans la card piste : `@if (coverUrls()[track.id])` affiche `<img>` avec `alt` accessible, sinon un placeholder `<div>♪</div>` en `aria-hidden`.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.css`**

- `.cover` : vignette 48×48, `object-fit: cover` (recadre sans déformer), `flex-shrink: 0`.
- `.cover-placeholder` : centre le ♪ en couleur atténuée.
- `.track-info { flex: 1 }` : fait grandir la colonne info entre cover (gauche) et actions (droite).

---

**`API_CONTRACT.md`**

Route `GET /tracks/:id/cover` documentée, champ `coverImage` optionnel sur le POST, booléen `hasCover` sur chaque `Track`, formats image et limite de 5 Mo.

### Points de sécurité

- La route cover vérifie `ownerId: req.auth.sub` — impossible d'accéder à la couverture d'une piste qu'on ne possède pas.
- Types MIME image validés côté backend (jamais seulement côté client).
- Taille image limitée à 5 Mo côté backend, avec nettoyage disque si dépassée.
- Les `ObjectURL` sont révoqués à chaque changement de page et à la destruction du composant.

### Vérification

- `ng build` : zéro erreur TypeScript, zéro avertissement Angular.
- `node --check` : backend sans erreur de syntaxe.
- Upload avec image → vignette affichée dans la card.
- Upload sans image → placeholder ♪ affiché.
- Image > 5 Mo ou format non supporté → message d'erreur, upload bloqué.
- Suppression d'une piste → fichier image nettoyé sur le disque.

---

## Amélioration facultative — Barre de progression de l'upload

### Description

Pendant l'envoi d'une piste, une barre de progression affiche le pourcentage d'octets réellement transférés au serveur. La progression est mesurée **côté client** par le navigateur : aucun changement backend n'est nécessaire.

### Flux de données

```
User clique « Envoyer »
  → upload()
      → uploading.set(true), uploadProgress.set(0)
      → service.upload(...) avec { reportProgress: true, observe: 'events' }
        → POST /api/tracks   [multipart, JWT]
        → Observable<HttpEvent<Track>> émet plusieurs événements :
            HttpEventType.UploadProgress { loaded, total }  (plusieurs fois)
              → uploadProgress.set(round(loaded / total * 100))
            HttpEventType.Response { body: Track }           (une fois à la fin)
              → uploading.set(false), reset formulaire, load()
  → @if (uploading()) <progress [value]="uploadProgress()" max="100">
```

### Fichiers modifiés

**`frontend-starter/src/app/shared/services/track.service.ts` — `upload()`**

Les options `{ reportProgress: true, observe: 'events' }` ont été ajoutées à l'appel `http.post`. Sans elles, `HttpClient` n'émet qu'une seule valeur (la réponse finale). Avec `observe: 'events'`, l'Observable émet toute la séquence d'événements HTTP, et `reportProgress: true` active spécifiquement les événements `UploadProgress` qui portent `loaded` et `total` (octets envoyés / octets totaux). Le type de retour devient `Observable<HttpEvent<Track>>`.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.ts` — `upload()`**

- `import { HttpEventType } from '@angular/common/http'` — enum pour distinguer les types d'événements.
- `readonly uploadProgress = signal(0)` — pourcentage courant, remis à 0 au début de chaque envoi.
- Le callback `next` reçoit désormais un `HttpEvent<Track>` au lieu d'un `Track`. Deux cas sont traités :
  - `event.type === HttpEventType.UploadProgress && event.total` : on calcule `Math.round(event.loaded / event.total * 100)`. Le garde `event.total` évite une division par `undefined` quand la taille totale n'est pas calculable.
  - `event.type === HttpEventType.Response && event.body` : c'est la réponse finale. TypeScript affine `event` en `HttpResponse<Track>` ; le garde `event.body` donne un `track` non-null. La logique de succès (reset formulaire, rechargement) est inchangée.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.html`**

Un bloc `@if (uploading())` affiche un élément natif `<progress>` lié à `uploadProgress()` avec `max="100"`, accompagné du pourcentage en texte. L'élément `<progress>` est accessible nativement (pas de dépendance) et porte un `aria-label` dynamique. Il disparaît dès que `uploading()` repasse à `false`.

---

**`frontend-starter/src/app/components/tracks-page/tracks-page.css`**

`.upload-progress` en flex row (barre + pourcentage alignés), la `<progress>` prenant la largeur restante avec `flex: 1`.

### Note sur le comportement

Une fois les octets transférés (100 %), le serveur traite encore la requête (écriture disque, insertion MongoDB) avant de renvoyer la `Response`. La barre reste donc à 100 % avec « Envoi en cours… » pendant ce court instant — c'est normal : la progression mesure l'upload réseau, pas le traitement serveur.

### Vérification

- `ng build` : zéro erreur TypeScript, zéro avertissement Angular.
- Upload d'un fichier volumineux → la barre progresse de 0 à 100 %.
- Onglet Network : la requête reste unique (`POST /api/tracks`), la progression est purement locale au navigateur.
- Après succès → la barre disparaît, le formulaire est vidé, la liste rechargée.

---

## Usage de l'IA

Voir le fichier `RAPPORT_IA_MODELE.md`, section TP2.
