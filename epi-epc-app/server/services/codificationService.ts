import { eq, and, isNull, like } from "drizzle-orm";
import { db } from "../db";
import { equipementHierarchie, articlesReference, articles, affectations } from "../db/schema";
import { getAncestorChain } from "./hierarchieService";

const STOPWORDS = new Set(["de", "des", "du", "la", "le", "les", "et", "à", "d", "l"]);

function stripAccents(str: string) {
  return str
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

function significantWords(nom: string): string[] {
  return stripAccents(nom)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
}

/**
 * Dérive une abréviation candidate (majuscules, sans accents) à partir d'un nom : un seul
 * mot significatif -> ses N premières lettres ; plusieurs mots -> initiale de chaque mot,
 * complétée par les lettres suivantes du premier mot si moins de N mots significatifs.
 */
export function deriveAbbrev(nom: string, maxLen = 4): string {
  const words = significantWords(nom);
  if (words.length === 0) return "XXX".slice(0, maxLen);
  if (words.length === 1) return words[0].slice(0, maxLen).toUpperCase();
  let abbrev = words.map((w) => w[0]).join("");
  if (abbrev.length < maxLen) abbrev += words[0].slice(1, maxLen - abbrev.length + 1);
  return abbrev.slice(0, maxLen).toUpperCase();
}

/** Dérive un codeAbrege garanti unique parmi les frères (même parentId), avec suffixe numérique sur collision. */
export async function generateCodeAbrege(nom: string, parentId: number | null, maxLen = 4): Promise<string> {
  const siblings = await db
    .select({ codeAbrege: equipementHierarchie.codeAbrege })
    .from(equipementHierarchie)
    .where(parentId == null ? isNull(equipementHierarchie.parentId) : eq(equipementHierarchie.parentId, parentId));
  const taken = new Set(siblings.map((s) => s.codeAbrege).filter((c): c is string => !!c));
  const base = deriveAbbrev(nom, maxLen);
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 100; suffix++) {
    const candidate = `${base.slice(0, maxLen - String(suffix).length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Impossible de générer un codeAbrege unique pour "${nom}"`);
}

function pad(n: number, width: number) {
  return String(n).padStart(width, "0");
}

async function insertWithUniqueRetry<T>(fn: () => Promise<T>, maxAttempts = 5): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastErr = err;
      const isUniqueViolation = err?.code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/i.test(String(err?.message));
      if (!isUniqueViolation) throw err;
    }
  }
  throw lastErr;
}

/**
 * Code d'un article de référence : abréviations de la chaîne d'ancêtres (2 segments pour
 * les branches courtes, 3 pour les branches profondes — Appareils de levage/sous pression —
 * jamais un nombre de segments fixe) + un numéro séquentiel sur 4 chiffres, unique parmi
 * les références déjà rattachées au même hierarchieParentId.
 */
export async function generateReferenceCode(hierarchieParentId: number): Promise<string> {
  return insertWithUniqueRetry(async () => {
    const chain = await getAncestorChain(hierarchieParentId);
    const prefix = chain.map((n) => n.codeAbrege ?? deriveAbbrev(n.nom)).join("-");
    const existing = await db
      .select({ code: articlesReference.code })
      .from(articlesReference)
      .where(eq(articlesReference.hierarchieParentId, hierarchieParentId));
    const nextSeq = 1 + existing.reduce((max, r) => {
      const match = r.code.match(/(\d{4})$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}-${pad(nextSeq, 4)}`;
  });
}

/** Code d'un article physique : code de sa référence + un numéro séquentiel sur 3 chiffres, unique parmi les articles de cette référence. */
export async function generateArticleCode(articleReferenceId: number): Promise<string> {
  return insertWithUniqueRetry(async () => {
    const [reference] = await db.select().from(articlesReference).where(eq(articlesReference.id, articleReferenceId));
    if (!reference) throw new Error(`Article de référence introuvable (id=${articleReferenceId})`);
    const existing = await db
      .select({ codeArticle: articles.codeArticle })
      .from(articles)
      .where(and(eq(articles.articleReferenceId, articleReferenceId), like(articles.codeArticle, `${reference.code}-%`)));
    const nextSeq = 1 + existing.reduce((max, a) => {
      const match = a.codeArticle.match(/(\d{3})$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${reference.code}-${pad(nextSeq, 3)}`;
  });
}

/**
 * Numéro de série généré automatiquement pour une unité affectée : préfixe = codeAbrege du
 * nœud de classification le plus précis de l'article (même convention que
 * generateReferenceCode/generateArticleCode), suffixe séquentiel sur 6 chiffres, unique dans
 * toute la table affectations (contrainte garantie en base par l'index unique sur
 * affectations.numeroSerie — voir server/db/schema.ts).
 */
export async function generateNumeroSerie(articleId: number): Promise<string> {
  return insertWithUniqueRetry(async () => {
    const [article] = await db.select().from(articles).where(eq(articles.id, articleId));
    if (!article) throw new Error(`Article introuvable (id=${articleId})`);

    let prefix = "MAT";
    if (article.articleReferenceId) {
      const [reference] = await db.select().from(articlesReference).where(eq(articlesReference.id, article.articleReferenceId));
      if (reference) {
        const [leaf] = await db.select().from(equipementHierarchie).where(eq(equipementHierarchie.id, reference.hierarchieParentId));
        if (leaf?.codeAbrege) prefix = leaf.codeAbrege;
      }
    }

    const existing = await db
      .select({ numeroSerie: affectations.numeroSerie })
      .from(affectations)
      .where(like(affectations.numeroSerie, `${prefix}-%`));
    const nextSeq = 1 + existing.reduce((max, a) => {
      const match = a.numeroSerie?.match(/-(\d{6})$/);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0);
    return `${prefix}-${pad(nextSeq, 6)}`;
  });
}
