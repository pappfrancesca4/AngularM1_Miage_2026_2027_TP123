# Rapport TP2 — Bibliothèque, Upload et Lecture Audio

## Mission 2 — Bibliothèque paginée

### Analyse de `TrackService.list(page, limit)`

La méthode était déjà correctement implémentée avant le TP2 :

```ts
list(page = 1, limit = 5) {
  return this.http.get<Page<Track>>('/api/tracks', {
    params: { page, limit },
  });
}
```

`params` encode automatiquement les valeurs en query string : `GET /api/tracks?page=1&limit=5`. Il n'y a pas eu besoin de construire l'URL à la main, ce qui aurait risqué des problèmes d'encodage.

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

## Usage de l'IA

Voir le fichier `RAPPORT_IA_MODELE.md`, section TP2.
