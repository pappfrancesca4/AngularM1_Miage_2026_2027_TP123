import express from "express";
import cors from "cors";
import multer from "multer";
import jwt from "jsonwebtoken";
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { Track } from "./models/Track.js";

// Les fichiers audio restent sur le disque du serveur dans ce TP.
// MongoDB ne conserve que leurs métadonnées : titre, nom, taille, etc.
const UPLOADS = path.resolve("data/uploads");

try {
  // mkdirSync est utilisé au démarrage : l'application doit disposer de ce
  // dossier avant de pouvoir accepter le premier upload.
  fs.mkdirSync(UPLOADS, { recursive: true });
  console.log(`[startup] Dossier des uploads prêt : ${UPLOADS}`);
} catch (error) {
  console.error("[startup] Impossible de créer le dossier des uploads", error);
  throw error;
}

/**
 * Supprime un fichier du dossier uploads en mode « meilleur effort » :
 * l'échec est journalisé mais n'interrompt pas l'appelant. Utilisé pour nettoyer
 * les fichiers orphelins (upload échoué) et les couvertures à la suppression.
 */
async function removeUpload(filename) {
  if (!filename) return;
  const target = path.join(UPLOADS, filename);
  try {
    await fsPromises.unlink(target);
    console.log(`[tracks] Fichier supprimé : ${target}`);
  } catch (error) {
    console.error(`[tracks] Impossible de supprimer ${target}`, error);
  }
}

// Ce secret reste côté serveur. Il ne doit jamais être copié dans Angular.
const SECRET = process.env.JWT_SECRET || "tp1-development-secret";

// La taille maximale d'un fichier audio est de 25 Mo. Les fichiers plus gros
// sont refusés par Multer avant d'être écrits sur le disque.
const MAX_FILE_SIZE = 25 * 1024 * 1024;

// Une image de couverture est bien plus légère qu'un morceau : 5 Mo suffisent.
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

// Les types MIME audio autorisés correspondent aux formats demandés dans le sujet.
const allowedAudio = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/x-m4a",
]);

// Formats image acceptés pour la couverture. WebP est inclus pour sa compression moderne.
const allowedImage = new Set(["image/jpeg", "image/png", "image/webp"]);

/**
 * Crée un jeton JWT contenant uniquement l'identité nécessaire à l'API.
 * Le mot de passe n'est jamais placé dans le token. `sub` signifie subject
 * et contient l'identifiant MongoDB de l'utilisateur.
 */
function token(user) {
  console.log(`[auth] Création d'un token pour l'utilisateur ${user.id}`);
  return jwt.sign({ sub: user.id, email: user.email }, SECRET, {
    expiresIn: "2h",
  });
}

/** Middleware Express qui protège les routes privées. */
function auth(req, res, next) {
  const raw = req.headers.authorization;

  // Le token est transmis dans l'en-tête Authorization sous la forme
    // "Authorization: Bearer <token>". Le préfixe "Bearer " est obligatoire pour que
    // le middleware sache qu'il s'agit d'un JWT et non d'un autre type de jeton.
  if (!raw?.startsWith("Bearer ")) {
    console.warn(`[auth] Authorization absente pour ${req.method} ${req.path}`);
    return res.status(401).json({ message: "Authentification requise" });
  }

  try {
    // jwt.verify vérifie la signature et la date d'expiration du token.
    // On ne logue jamais sa valeur, car un JWT permettrait une usurpation.
    req.auth = jwt.verify(raw.slice(7), SECRET);
    console.log(`[auth] Token accepté pour ${req.auth.sub}`);
    next();
  } catch (error) {
    console.error("[auth] Token invalide ou expiré", error);
    return res.status(401).json({ message: "Jeton invalide ou expiré" });
  }
}

/*
 * Multer transforme une requête HTTP multipart/form-data en données exploitables
 * par Express et traite les fichiers envoyés par un formulaire HTML.
 * Documentation officielle : https://github.com/expressjs/multer
 *
 * diskStorage indique que Multer écrit directement le fichier sur disque.
 * Chaque callback doit appeler cb(error, value) : null signifie qu'il n'y a
 * pas d'erreur. Le nom aléatoire évite les collisions entre utilisateurs.
 */
const storage = multer.diskStorage({
  destination: (_request, _file, callback) => {
    console.debug(`[multer] Destination sélectionnée : ${UPLOADS}`);
    callback(null, UPLOADS);
  },
  filename: (_request, file, callback) => {
    const filename =
      crypto.randomUUID() + path.extname(file.originalname).toLowerCase();
    console.log(`[multer] Nom de stockage généré pour ${file.originalname}`);
    callback(null, filename);
  },
});

/*
 * limits.fileSize protège le serveur contre les fichiers trop volumineux.
 * fileFilter est appelé avant l'enregistrement : accepter le fichier appelle
 * callback(null, true), le refuser transmet une vraie Error à Express.
 */
const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_request, file, callback) => {
    // La validation dépend du champ : "audio" accepte les formats audio,
    // "coverImage" accepte les formats image. On distingue grâce à fieldname.
    if (file.fieldname === "audio") {
      if (allowedAudio.has(file.mimetype)) {
        console.log(`[multer] Audio accepté : ${file.mimetype}`);
        return callback(null, true);
      }
      const error = new Error("Format audio non accepté");
      console.error(`[multer] Audio refusé : ${file.mimetype}`, error);
      return callback(error);
    }

    if (file.fieldname === "coverImage") {
      if (allowedImage.has(file.mimetype)) {
        console.log(`[multer] Image acceptée : ${file.mimetype}`);
        return callback(null, true);
      }
      const error = new Error("Format image non accepté");
      console.error(`[multer] Image refusée : ${file.mimetype}`, error);
      return callback(error);
    }

    // Tout autre nom de champ est rejeté : le formulaire n'envoie que ces deux-là.
    const error = new Error("Champ de fichier inattendu");
    console.error(`[multer] Champ refusé : ${file.fieldname}`, error);
    return callback(error);
  },
});

/**
 * Construit l'application Express sans ouvrir de port.
 * Cette séparation permet au serveur réel et aux tests de créer la même
 * application. Le port est ouvert uniquement dans server.js.
 */
export function createApp() {
  const app = express();

  // Journaliser la fin de chaque requête permet de suivre méthode, URL,
  // statut et durée sans exposer les corps contenant des mots de passe.
  app.use((req, res, next) => {
    const startedAt = Date.now();
    res.on("finish", () => {
      console.log(
        `[http] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - startedAt} ms)`,
      );
    });
    next();
  });

  // CORS est nécessaire pour que le frontend Angular puisse appeler l'API.
  // C'est-à-dire que le navigateur autorise les requêtes cross-origin depuis localhost:4200.
  // Dans un vrai projet, il est recommandé de limiter les origines autorisées.
  app.use(cors());

  // Express ne gère pas nativement le JSON : ce middleware transforme le corps JSON en objet JavaScript 
  // accessible via req.body.
  // Il est placé avant les routes pour que toutes les requêtes JSON soient traitées.
  app.use(express.json());

  /** Endpoint public utilisé pour vérifier que l'API répond. */
  app.get("/api/health", (_req, res) => {
    console.log("[health] Vérification de l'API");
    res.json({ status: "ok" });
  });

  /** Requête POST pour "insertion" de donnée.
   * Inscrit un utilisateur et renvoie un token avec ses données publiques. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
   */
  app.post("/api/auth/register", async (req, res, next) => {
    try {
      const { name, email, password } = req.body || {};
      console.log(`[auth] Tentative d'inscription pour ${email || "email absent"}`);

      if (!name || !email || !password || password.length < 8) {
        console.warn("[auth] Inscription refusée : données invalides ou incomplètes");
        return res.status(400).json({
          message: "Nom, email et mot de passe de 8 caractères requis",
        });
      }

      // Vérifie si l'email est déjà utilisé avant de créer un nouvel utilisateur.
      if (await User.exists({ email: String(email).toLowerCase() })) {
        console.warn(`[auth] Email déjà utilisé : ${email}`);
        return res.status(409).json({ message: "Email déjà utilisé" });
      }

      // Crée l'utilisateur et le stocke dans MongoDB. Le mot de passe est haché
      // par le hook pre('validate') défini dans le schéma Mongoose.
      const user = await User.create({ name, email, password });
      console.log(`[auth] Utilisateur créé : ${user.id}`);
      res.status(201).json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant l'inscription", error);
      next(error);
    }
  });

  /** Vérifie les identifiants et ouvre une session JWT. Les identifiants sont envoyés dans le corps de la 
   * requête par un HTTP POST. */
  app.post("/api/auth/login", async (req, res, next) => {
    try {
        // req.body est déjà un objet JavaScript grâce au middleware express.json() placé plus haut.
        // il contient les champs email et password envoyés par le frontend Angular.
      const email = String(req.body?.email || "").toLowerCase();
      console.log(`[auth] Tentative de connexion pour ${email || "email absent"}`);

      // Sélectionne le mot de passe haché pour vérifier les identifiants.
      // User est un modèle Mongoose qui correspond au schéma défini dans models/User.js.
      // on envoie les requête à MongoDB via cet objet. Le mot de passe haché est stocké dans 
      // passwordHash, mais il n'est pas renvoyé par défaut dans les requêtes pour 
      // des raisons de sécurité.
      const user = await User.findOne({ email }).select("+passwordHash");

      if (!user || !(await user.verifyPassword(req.body?.password || ""))) {
        console.warn(`[auth] Identifiants incorrects pour ${email}`);
        return res.status(401).json({ message: "Identifiants incorrects" });
      }

      console.log(`[auth] Connexion réussie : ${user.id}`);
      res.json({ token: token(user), user: user.toPublic() });
    } catch (error) {
      console.error("[auth] Erreur pendant la connexion", error);
      next(error);
    }
  });

  /** Retourne le profil public de l'utilisateur identifié par le JWT. 
   * Les paramètres sont :
   * @param auth - Le middleware qui vérifie le JWT et ajoute req.auth. 
   * @param {Object} req - La requête HTTP.
   * @param {Object} res - La réponse HTTP.
   * @param {Function} next - La fonction de middleware suivante.
  */
  app.get("/api/users/me", auth, async (req, res, next) => {
    try {
        // req.auth.sub contient l'identifiant MongoDB de l'utilisateur 
        // extrait du JWT par le middleware auth. ici req.auth est un objet ajouté par le middleware 
        // auth à la requête, et sub est la propriété qui contient l'identifiant de l'utilisateur.
      const user = await User.findById(req.auth.sub);
      if (!user) {
        console.warn(`[user] Profil introuvable : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Profil envoyé : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de lecture du profil", error);
      next(error);
    }
  });

  /** Modifie uniquement le nom de l'utilisateur connecté. */
  app.put("/api/users/me", auth, async (req, res, next) => {
    try {
      const user = await User.findByIdAndUpdate(
        req.auth.sub,
        { $set: { name: req.body?.name } },
        { new: true, runValidators: true },
      );

      if (!user) {
        console.warn(`[user] Mise à jour impossible : ${req.auth.sub}`);
        return res.status(404).json({ message: "Utilisateur inconnu" });
      }

      console.log(`[user] Nom mis à jour : ${user.id}`);
      res.json(user.toPublic());
    } catch (error) {
      console.error("[user] Erreur de mise à jour du profil", error);
      next(error);
    }
  });

  /** Retourne une page des pistes appartenant exclusivement à l'utilisateur. */
  app.get("/api/tracks", auth, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(20, Math.max(1, Number(req.query.limit) || 5));
      // aggregate() ne caste pas automatiquement les strings en ObjectId, contrairement à find().
      const filter = { ownerId: new mongoose.Types.ObjectId(req.auth.sub) };

      if (req.query.search) {
        filter.title = { $regex: req.query.search, $options: 'i' };
      }

      console.log(`[tracks] Lecture page=${page}, limit=${limit}, search="${req.query.search ?? ''}", user=${req.auth.sub}`);

      // aggregatePaginate fait le find + le countDocuments en un seul pipeline,
      // et renvoie directement les métadonnées de pagination (totalDocs, totalPages, etc.).
      const aggregate = Track.aggregate([
        { $match: filter },
        { $sort: { createdAt: -1 } },
        { $project: { storedName: 0 } },
      ]);

      const result = await Track.aggregatePaginate(aggregate, { page, limit });

      // On retire _id (renommé id) et coverName (détail interne) du résultat.
      // hasCover indique au frontend s'il doit requêter la route de couverture.
      const docs = result.docs.map(({ _id, coverName, ...rest }) => ({
        ...rest,
        id: String(_id),
        hasCover: Boolean(coverName),
      }));

      console.log(`[tracks] ${docs.length} piste(s) envoyée(s) sur ${result.totalDocs}`);

      res.json({ ...result, docs });
    } catch (error) {
      console.error("[tracks] Erreur de pagination", error);
      next(error);
    }
  });

  /**
   * Reçoit le champ multipart audio (requis), le champ coverImage (optionnel)
   * et le champ texte title. upload.fields() traite les deux fichiers nommés et
   * les place dans req.files, tandis que req.body.title contient le champ texte.
   * C'est ici qu'est fait l'upload de fichiers sur le serveur.
   * Le middleware auth vérifie le JWT avant d'accepter l'upload.
   * Si les fichiers sont acceptés, ils sont stockés sur le disque et les
   * métadonnées (dont le nom de la couverture) sont enregistrées dans MongoDB.
   */
  app.post(
    "/api/tracks",
    auth,
    upload.fields([
      { name: "audio", maxCount: 1 },
      { name: "coverImage", maxCount: 1 },
    ]),
    async (req, res, next) => {
      // Avec upload.fields(), les fichiers arrivent dans req.files groupés par
      // nom de champ : req.files.audio[0] et req.files.coverImage[0].
      const audioFile = req.files?.audio?.[0];
      const coverFile = req.files?.coverImage?.[0];

      try {
        if (!audioFile) {
          console.warn(`[tracks] Upload sans fichier audio par ${req.auth.sub}`);
          return res.status(400).json({ message: "Fichier audio requis" });
        }

        // Multer impose une limite globale (25 Mo) ; la limite image plus stricte
        // est vérifiée ici, après écriture, puis les deux fichiers sont nettoyés.
        if (coverFile && coverFile.size > MAX_IMAGE_SIZE) {
          console.warn(`[tracks] Image trop volumineuse par ${req.auth.sub}`);
          await removeUpload(coverFile.filename);
          await removeUpload(audioFile.filename);
          return res.status(400).json({ message: "Image trop volumineuse (maximum 5 Mo)" });
        }

        const track = await Track.create({
          ownerId: req.auth.sub,
          title: req.body.title || audioFile.originalname,
          originalName: audioFile.originalname,
          storedName: audioFile.filename,
          coverName: coverFile?.filename,
          mimeType: audioFile.mimetype,
          size: audioFile.size,
        });

        console.log(`[tracks] Upload enregistré : ${track.id}`);
        res.status(201).json(track.toPublic());
      } catch (error) {
        console.error("[tracks] Erreur après l'enregistrement du fichier", error);
        // Si MongoDB échoue après l'écriture disque, on nettoie les orphelins.
        await removeUpload(audioFile?.filename);
        await removeUpload(coverFile?.filename);
        next(error);
      }
    },
  );

  /** Envoie le contenu binaire d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/audio", auth, async (req, res, next) => {
    try {
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName");

      if (!track) {
        console.warn(`[tracks] Audio introuvable ou interdit : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      res.type(track.mimeType);
      // Ce callback permet de loguer le succès ou l'erreur du transfert.
      res.sendFile(audioPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi audio ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Audio envoyé : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation du flux audio", error);
      next(error);
    }
  });

  /** Envoie l'image de couverture d'une piste après vérification de sa propriété. */
  app.get("/api/tracks/:id/cover", auth, async (req, res, next) => {
    try {
      // La vérification ownerId empêche d'accéder à la couverture d'autrui.
      // select("+coverName") force le chargement du champ caché par défaut.
      const track = await Track.findOne({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+coverName");

      if (!track || !track.coverName) {
        console.warn(`[tracks] Couverture absente ou interdite : ${req.params.id}`);
        return res.status(404).json({ message: "Pas de couverture" });
      }

      // sendFile déduit le Content-Type de l'extension du fichier stocké
      // (.jpg, .png, .webp), on n'a donc pas besoin de stocker le type MIME.
      const coverPath = path.join(UPLOADS, track.coverName);
      res.sendFile(coverPath, (error) => {
        if (error) {
          console.error(`[tracks] Erreur d'envoi couverture ${track.id}`, error);
          if (!res.headersSent) next(error);
          return;
        }
        console.log(`[tracks] Couverture envoyée : ${track.id}`);
      });
    } catch (error) {
      console.error("[tracks] Erreur de préparation de la couverture", error);
      next(error);
    }
  });

  /** Supprime la métadonnée et le fichier physique correspondant. */
  app.delete("/api/tracks/:id", auth, async (req, res, next) => {
    try {
      const track = await Track.findOneAndDelete({
        _id: req.params.id,
        ownerId: req.auth.sub,
      }).select("+storedName +coverName");

      if (!track) {
        console.warn(`[tracks] Suppression impossible : ${req.params.id}`);
        return res.status(404).json({ message: "Piste inconnue" });
      }

      const audioPath = path.join(UPLOADS, track.storedName);
      try {
        await fsPromises.unlink(audioPath);
        console.log(`[tracks] Fichier supprimé : ${audioPath}`);
      } catch (error) {
        // L'exception n'est volontairement pas ignorée : l'administrateur doit
        // voir ce fichier orphelin si sa suppression échoue.
        console.error(`[tracks] Fichier audio non supprimé : ${audioPath}`, error);
        return res.status(500).json({
          message: "Métadonnée supprimée, mais fichier audio non supprimé",
        });
      }

      // La couverture est nettoyée en meilleur effort : son absence ne doit pas
      // transformer une suppression réussie en erreur 500.
      await removeUpload(track.coverName);

      res.status(204).end();
    } catch (error) {
      console.error("[tracks] Erreur de suppression", error);
      next(error);
    }
  });

  /** Gestionnaire central des erreurs connues de l'application. */
  app.use((error, _req, res, next) => {
    console.error("[error] Erreur reçue par le gestionnaire central", error);

    const rejectedUploads = new Set([
      "Format audio non accepté",
      "Format image non accepté",
      "Champ de fichier inattendu",
    ]);
    if (error instanceof multer.MulterError || rejectedUploads.has(error?.message)) {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "ValidationError") {
      return res.status(400).json({ message: error.message });
    }
    if (error?.name === "CastError") {
      return res.status(404).json({ message: "Ressource inconnue" });
    }

    next(error);
  });

  return app;
}
