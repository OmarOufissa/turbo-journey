import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createServer } from "../index";
import { sqlite } from "../db";

let app: Awaited<ReturnType<typeof createServer>>;
let adminToken: string;

beforeAll(async () => {
  app = await createServer();
  const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "Admin@2026" });
  adminToken = res.body.token;
});

afterAll(() => {
  sqlite.close();
});

describe("authentification", () => {
  it("refuse un mot de passe incorrect", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "mauvais" });
    expect(res.status).toBe(401);
  });

  it("accepte les identifiants de démonstration et renvoie un jeton", async () => {
    const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "Admin@2026" });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.username).toBe("admin");
  });

  it("bloque l'accès à une route protégée sans jeton", async () => {
    const res = await request(app).get("/api/dashboard/kpis");
    expect(res.status).toBe(401);
  });
});

describe("dashboard", () => {
  it("renvoie des indicateurs cohérents avec les données réelles chargées", async () => {
    const res = await request(app).get("/api/dashboard/kpis").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalReferences).toBeGreaterThan(0);
    expect(res.body.totalBeneficiaires).toBeGreaterThan(0);
    expect(res.body.totalEquipes).toBe(58);
  });

  it("renvoie les séries de graphiques attendues", async () => {
    const res = await request(app).get("/api/dashboard/charts").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.repartitionFamille)).toBe(true);
    expect(res.body.repartitionFamille.length).toBeGreaterThan(0);
    expect(Array.isArray(res.body.tauxCouverture)).toBe(true);
  });
});

describe("articles", () => {
  it("liste les articles avec pagination", async () => {
    const res = await request(app).get("/api/articles?pageSize=5").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.rows.length).toBeLessThanOrEqual(5);
    expect(res.body.total).toBeGreaterThan(0);
  });

  it("refuse la création d'un article sans désignation", async () => {
    const res = await request(app).post("/api/articles").set("Authorization", `Bearer ${adminToken}`).send({ codeArticle: "X-1" });
    expect(res.status).toBe(400);
  });
});

describe("affectations", () => {
  // Régression : l'ancien modèle bloquait toute affectation sur un article fraîchement créé
  // (stockDisponible démarrait à 0 et n'était jamais réellement alimenté par un flux d'achat
  // réel), donc l'affectation renvoyait systématiquement 409. Le modèle affectation/besoin
  // n'a plus de compteur à alimenter au préalable : la création doit réussir directement.
  it("affecte avec succès un article tout juste créé, sans aucune alimentation préalable", async () => {
    const references = await request(app).get("/api/articles-reference?pageSize=1&actif=true").set("Authorization", `Bearer ${adminToken}`);
    const reference = references.body.rows[0];

    const createArticle = await request(app)
      .post("/api/articles")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ articleReferenceId: reference.id, designation: "Article de test — affectation immédiate" });
    expect(createArticle.status).toBe(201);

    const res = await request(app)
      .post("/api/affectations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        articleId: createArticle.body.id,
        beneficiaireType: "agent",
        agentId: 1,
        quantite: 1,
        dateAffectation: "2026-07-02",
      });
    expect(res.status).toBe(201);
  });
});

describe("recherche avancée", () => {
  it("trouve des résultats inter-entités pour un terme réel du catalogue", async () => {
    const res = await request(app).get("/api/recherche?q=casque").set("Authorization", `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.articles.length).toBeGreaterThan(0);
  });

  it("renvoie des listes vides pour un terme trop court", async () => {
    const res = await request(app).get("/api/recherche?q=a").set("Authorization", `Bearer ${adminToken}`);
    expect(res.body.articles).toEqual([]);
  });
});
