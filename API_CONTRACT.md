# Contrat HTTP - TP1

Base : `/api`. Sauf inscription et connexion, envoyer `Authorization: Bearer <token>`.

Le contrat HTTP ne dépend pas du choix de persistance : le backend fourni utilise Mongoose et MongoDB. MongoDB conserve les utilisateurs et métadonnées ; les octets des fichiers audio restent sur le disque du serveur.

| Méthode | Route | Requête | Réponse principale |
|---|---|---|---|
| GET | `/health` | - | `{ "status": "ok" }` |
| POST | `/auth/register` | `{name,email,password}` | `201 {token,user}` |
| POST | `/auth/login` | `{email,password}` | `200 {token,user}` |
| GET | `/users/me` | JWT | `200 User` |
| PUT | `/users/me` | `{name}` + JWT | `200 User` |
| GET | `/tracks?page=1&limit=5&search=` | JWT | `Page<Track>` (search optionnel, filtre sur le titre, insensible à la casse) |
| POST | `/tracks` | multipart : `audio`, `title`, `coverImage` (optionnel) | `201 Track` |
| GET | `/tracks/:id/audio` | JWT | flux audio |
| GET | `/tracks/:id/cover` | JWT | flux image (404 si pas de couverture) |
| DELETE | `/tracks/:id` | JWT | `204` (bonus) |

`Page<Track>` est le format natif de `mongoose-aggregate-paginate-v2` : `docs`, `totalDocs`, `limit`, `page`, `totalPages`, `pagingCounter`, `hasPrevPage`, `hasNextPage`, `prevPage`, `nextPage`. Chaque `Track` porte un booléen `hasCover` qui indique si une couverture est disponible via `GET /tracks/:id/cover`. Formats audio acceptés : MP3, WAV, OGG et M4A, 25 Mo maximum. Formats image acceptés pour la couverture : JPEG, PNG et WebP, 5 Mo maximum.

Erreurs courantes : `400` validation, `401` authentification, `404` ressource, `409` email déjà utilisé.
