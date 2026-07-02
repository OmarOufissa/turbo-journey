import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { db } from "../db";
import { documents } from "../db/schema";
import { and, eq } from "drizzle-orm";
import { logHistorique } from "../services/historiqueService";
import type { AuthedRequest } from "../middleware/auth";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads", "documents");
fs.mkdirSync(UPLOAD_ROOT, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_ROOT),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const safe = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = [".pdf", ".png", ".jpg", ".jpeg", ".webp", ".doc", ".docx"];
    cb(null, allowed.includes(path.extname(file.originalname).toLowerCase()));
  },
});

export const documentsRouter = Router();

documentsRouter.get("/", async (req, res) => {
  const { entiteType, entiteId } = req.query as Record<string, string>;
  if (!entiteType || !entiteId) return res.status(400).json({ error: "entiteType et entiteId requis" });
  const rows = await db.select().from(documents).where(and(eq(documents.entiteType, entiteType), eq(documents.entiteId, Number(entiteId))));
  res.json(rows);
});

documentsRouter.post("/upload", upload.single("fichier"), async (req: AuthedRequest, res) => {
  const { entiteType, entiteId, typeDocument } = req.body as { entiteType: string; entiteId: string; typeDocument: string };
  if (!req.file) return res.status(400).json({ error: "Fichier requis (pdf, image, doc)" });
  if (!entiteType || !entiteId || !typeDocument) return res.status(400).json({ error: "entiteType, entiteId et typeDocument requis" });

  const url = `/uploads/documents/${req.file.filename}`;
  const [row] = await db
    .insert(documents)
    .values({
      entiteType,
      entiteId: Number(entiteId),
      typeDocument,
      nomFichier: req.file.originalname,
      url,
      tailleOctets: req.file.size,
      uploadedByUserId: req.user?.id,
    })
    .returning();
  await logHistorique({ typeEvenement: "ajout_document", entiteType, entiteId: Number(entiteId), utilisateurId: req.user?.id, details: { typeDocument, nomFichier: req.file.originalname } });
  res.status(201).json(row);
});
