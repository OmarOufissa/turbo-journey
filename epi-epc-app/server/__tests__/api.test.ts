import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import { createServer } from "../index";
import { pool } from "../db";

const app = createServer();

let adminToken: string;

beforeAll(async () => {
  const res = await request(app).post("/api/auth/login").send({ username: "admin", password: "Admin@2026" });
  adminToken = res.body.token;
});

afterAll(async () => {
  await pool.end();
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
    expect(res.body.user.role).toBe("administrateur");
  });

  it("bloque l'accès à une route protégée sans jeton", async () => {
    const res = await request(app).get("/api/dashboard/kpis");
    expect(res.status).toBe(401);
  });

  it("bloque l'accès à la gestion des utilisateurs pour un rôle non-administrateur", async () => {
    const login = await request(app).post("/api/auth/login").send({ username: "consultation", password: "Lecture@2026" });
    const res = await request(app).get("/api/users").set("Authorization", `Bearer ${login.body.token}`);
    expect(res.status).toBe(403);
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

describe("affectations — règles de stock", () => {
  it("refuse une affectation dont la quantité dépasse le stock disponible", async () => {
    const articles = await request(app).get("/api/articles?pageSize=1").set("Authorization", `Bearer ${adminToken}`);
    const article = articles.body.rows[0];
    const res = await request(app)
      .post("/api/affectations")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        articleId: article.id,
        beneficiaireType: "agent",
        agentId: 1,
        quantite: article.stockDisponible + 1000,
        dateAffectation: "2026-07-02",
      });
    expect(res.status).toBe(409);
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
