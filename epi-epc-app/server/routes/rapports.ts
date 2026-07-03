import { Router } from "express";
import ExcelJS from "exceljs";
import { db } from "../db";
import { agents, articles, affectations, equipes, services, divisions, familles, marches, historique, controlesPeriodiques } from "../db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { startPdf, pdfTable } from "../services/pdfService";

export const rapportsRouter = Router();

async function sendWorkbook(res: any, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

function styleHeader(ws: ExcelJS.Worksheet) {
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F0FB" } };
  ws.autoFilter = { from: "A1", to: { row: 1, column: ws.columnCount } } as any;
}

// ---------------------------------------------------------------------------
// PDF — Dotation individuelle
// ---------------------------------------------------------------------------
rapportsRouter.get("/dotation-individuelle/:agentId", async (req, res) => {
  const agentId = Number(req.params.agentId);
  const [agent] = await db
    .select({ id: agents.id, matricule: agents.matricule, nom: agents.nom, fonction: agents.fonction, equipeNom: equipes.nom, serviceNom: services.nom, divisionNom: divisions.nom })
    .from(agents)
    .leftJoin(equipes, eq(agents.equipeId, equipes.id))
    .leftJoin(services, eq(agents.serviceId, services.id))
    .leftJoin(divisions, eq(agents.divisionId, divisions.id))
    .where(eq(agents.id, agentId));
  if (!agent) return res.status(404).json({ error: "Agent introuvable" });

  const dotations = await db
    .select({ designation: articles.designation, quantite: affectations.quantite, taille: affectations.taille, pointure: affectations.pointure, date: affectations.dateAffectation, statut: affectations.statut })
    .from(affectations)
    .innerJoin(articles, eq(affectations.articleId, articles.id))
    .where(eq(affectations.agentId, agentId))
    .orderBy(desc(affectations.dateAffectation));

  const doc = startPdf(res, `dotation-${agent.matricule}.pdf`, "Fiche de dotation individuelle");
  doc.fontSize(11).text(`${agent.nom}  —  Matricule ${agent.matricule}`);
  doc.fontSize(9).fillColor("#52514e").text(`${agent.fonction ?? ""}`);
  doc.text(`${agent.divisionNom ?? ""} / ${agent.serviceNom ?? ""} / ${agent.equipeNom ?? "—"}`);
  doc.moveDown(1);
  doc.fillColor("#0b0b0b");
  pdfTable(
    doc,
    ["Article", "Qté", "Taille", "Pointure", "Date", "Statut"],
    dotations.map((d) => [d.designation, d.quantite, d.taille ?? "-", d.pointure ?? "-", d.date, d.statut]),
    [230, 35, 60, 60, 75, 55],
  );
  doc.end();
});

// ---------------------------------------------------------------------------
// PDF — Dotation par équipe
// ---------------------------------------------------------------------------
rapportsRouter.get("/dotation-equipe/:equipeId", async (req, res) => {
  const equipeId = Number(req.params.equipeId);
  const [equipe] = await db
    .select({ id: equipes.id, nom: equipes.nom, serviceNom: services.nom, divisionNom: divisions.nom })
    .from(equipes)
    .leftJoin(services, eq(equipes.serviceId, services.id))
    .leftJoin(divisions, eq(services.divisionId, divisions.id))
    .where(eq(equipes.id, equipeId));
  if (!equipe) return res.status(404).json({ error: "Équipe introuvable" });

  const [epc, epiParAgent] = await Promise.all([
    db
      .select({ designation: articles.designation, quantite: affectations.quantite, date: affectations.dateAffectation })
      .from(affectations)
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .where(and(eq(affectations.equipeId, equipeId), eq(affectations.beneficiaireType, "equipe"))),
    db
      .select({ agentNom: agents.nom, designation: articles.designation, quantite: affectations.quantite })
      .from(affectations)
      .innerJoin(articles, eq(affectations.articleId, articles.id))
      .innerJoin(agents, eq(affectations.agentId, agents.id))
      .where(eq(agents.equipeId, equipeId)),
  ]);

  const doc = startPdf(res, `dotation-equipe-${equipe.id}.pdf`, "Fiche de dotation collective");
  doc.fontSize(11).text(equipe.nom);
  doc.fontSize(9).fillColor("#52514e").text(`${equipe.divisionNom ?? ""} / ${equipe.serviceNom ?? ""}`);
  doc.moveDown(1);
  doc.fillColor("#0b0b0b").fontSize(10).text("Équipement de protection collective (EPC)", { underline: true });
  doc.moveDown(0.3);
  pdfTable(doc, ["Article", "Qté équipe", "Date"], epc.map((e) => [e.designation, e.quantite, e.date]), [350, 90, 75]);

  doc.moveDown(0.5);
  doc.fontSize(10).text("Dotation individuelle des membres (EPI)", { underline: true });
  doc.moveDown(0.3);
  pdfTable(doc, ["Agent", "Article", "Qté"], epiParAgent.map((e) => [e.agentNom, e.designation, e.quantite]), [180, 275, 60]);
  doc.end();
});

// ---------------------------------------------------------------------------
// Excel — État des stocks
// ---------------------------------------------------------------------------
rapportsRouter.get("/etat-stock.xlsx", async (_req, res) => {
  const rows = await db
    .select({
      code: articles.codeArticle,
      designation: articles.designation,
      famille: familles.nom,
      disponible: articles.stockDisponible,
      reserve: articles.stockReserve,
      commande: articles.stockCommande,
      min: articles.stockMin,
      max: articles.stockMax,
      prix: articles.prixUnitaire,
    })
    .from(articles)
    .leftJoin(familles, eq(articles.familleId, familles.id))
    .where(eq(articles.actif, true))
    .orderBy(familles.nom, articles.designation);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("État des stocks");
  ws.columns = [
    { header: "Code", key: "code", width: 12 },
    { header: "Désignation", key: "designation", width: 50 },
    { header: "Famille", key: "famille", width: 24 },
    { header: "Disponible", key: "disponible", width: 12 },
    { header: "Réservé", key: "reserve", width: 10 },
    { header: "Commandé", key: "commande", width: 10 },
    { header: "Stock min", key: "min", width: 10 },
    { header: "Stock max", key: "max", width: 10 },
    { header: "Prix unitaire (MAD)", key: "prix", width: 16 },
    { header: "État", key: "etat", width: 14 },
  ];
  rows.forEach((r) => {
    const etat = r.disponible === 0 ? "Rupture" : r.disponible <= r.min ? "Stock faible" : "Normal";
    ws.addRow({ ...r, prix: r.prix ? Number(r.prix) : null, etat });
  });
  styleHeader(ws);
  await sendWorkbook(res, wb, "etat-stock.xlsx");
});

// ---------------------------------------------------------------------------
// Excel — Inventaire complet
// ---------------------------------------------------------------------------
rapportsRouter.get("/inventaire.xlsx", async (_req, res) => {
  const rows = await db
    .select({
      code: articles.codeArticle,
      codeInterne: articles.codeInterne,
      designation: articles.designation,
      famille: familles.nom,
      constructeur: articles.constructeur,
      normes: articles.normes,
      fournisseur: articles.fournisseur,
      disponible: articles.stockDisponible,
      unite: articles.unite,
      prix: articles.prixUnitaire,
      dateLimiteUtilisation: articles.dateLimiteUtilisation,
      garantieMois: articles.garantieMois,
    })
    .from(articles)
    .leftJoin(familles, eq(articles.familleId, familles.id))
    .where(eq(articles.actif, true));

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Inventaire");
  ws.columns = [
    { header: "Code article", key: "code", width: 12 },
    { header: "Code interne", key: "codeInterne", width: 14 },
    { header: "Désignation", key: "designation", width: 50 },
    { header: "Famille", key: "famille", width: 24 },
    { header: "Constructeur", key: "constructeur", width: 18 },
    { header: "Normes", key: "normes", width: 16 },
    { header: "Fournisseur", key: "fournisseur", width: 20 },
    { header: "Qté disponible", key: "disponible", width: 12 },
    { header: "Unité", key: "unite", width: 10 },
    { header: "Prix unitaire", key: "prix", width: 12 },
    { header: "Limite d'utilisation", key: "dateLimiteUtilisation", width: 16 },
    { header: "Garantie (mois)", key: "garantieMois", width: 12 },
  ];
  rows.forEach((r) => ws.addRow({ ...r, prix: r.prix ? Number(r.prix) : null }));
  styleHeader(ws);
  await sendWorkbook(res, wb, "inventaire.xlsx");
});

// ---------------------------------------------------------------------------
// Excel — État des marchés
// ---------------------------------------------------------------------------
rapportsRouter.get("/marches.xlsx", async (_req, res) => {
  const rows = await db.select().from(marches).orderBy(marches.dateNotification);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Marchés");
  ws.columns = [
    { header: "Numéro", key: "numero", width: 16 },
    { header: "Année", key: "annee", width: 10 },
    { header: "Objet", key: "objet", width: 50 },
    { header: "Fournisseur", key: "fournisseur", width: 22 },
    { header: "Montant (MAD)", key: "montant", width: 16 },
    { header: "Date notification", key: "dateNotification", width: 16 },
    { header: "Date livraison", key: "dateLivraison", width: 16 },
    { header: "Statut", key: "statut", width: 12 },
  ];
  rows.forEach((r) => ws.addRow({ ...r, montant: r.montant ? Number(r.montant) : null }));
  styleHeader(ws);
  await sendWorkbook(res, wb, "marches.xlsx");
});

// ---------------------------------------------------------------------------
// Excel — Consommation annuelle
// ---------------------------------------------------------------------------
rapportsRouter.get("/consommation-annuelle.xlsx", async (_req, res) => {
  const rows = await db
    .select({
      annee: sql<string>`strftime('%Y', ${affectations.dateAffectation})`,
      designation: articles.designation,
      famille: familles.nom,
      quantite: sql<number>`sum(${affectations.quantite})`,
    })
    .from(affectations)
    .innerJoin(articles, eq(affectations.articleId, articles.id))
    .leftJoin(familles, eq(articles.familleId, familles.id))
    .groupBy(sql`strftime('%Y', ${affectations.dateAffectation})`, articles.designation, familles.nom)
    .orderBy(sql`strftime('%Y', ${affectations.dateAffectation})`);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Consommation annuelle");
  ws.columns = [
    { header: "Année", key: "annee", width: 10 },
    { header: "Famille", key: "famille", width: 24 },
    { header: "Désignation", key: "designation", width: 50 },
    { header: "Quantité distribuée", key: "quantite", width: 18 },
  ];
  rows.forEach((r) => ws.addRow(r));
  styleHeader(ws);
  await sendWorkbook(res, wb, "consommation-annuelle.xlsx");
});

// ---------------------------------------------------------------------------
// Excel — Articles à renouveler / expirés
// ---------------------------------------------------------------------------
rapportsRouter.get("/a-renouveler.xlsx", async (_req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const in60 = new Date();
  in60.setDate(in60.getDate() + 60);
  const rows = await db
    .select({
      designation: articles.designation,
      type: controlesPeriodiques.type,
      datePlanifiee: controlesPeriodiques.datePlanifiee,
      statut: controlesPeriodiques.statut,
    })
    .from(controlesPeriodiques)
    .innerJoin(articles, eq(controlesPeriodiques.articleId, articles.id))
    .where(sql`${controlesPeriodiques.statut} != 'realise' and ${controlesPeriodiques.datePlanifiee} <= ${in60.toISOString().slice(0, 10)}`)
    .orderBy(controlesPeriodiques.datePlanifiee);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("À renouveler / contrôler");
  ws.columns = [
    { header: "Article", key: "designation", width: 50 },
    { header: "Type de contrôle", key: "type", width: 20 },
    { header: "Échéance", key: "datePlanifiee", width: 14 },
    { header: "Statut", key: "statut", width: 14 },
  ];
  rows.forEach((r) => {
    const row = ws.addRow(r);
    if (r.datePlanifiee < today) row.getCell("statut").font = { color: { argb: "FFD03B3B" }, bold: true };
  });
  styleHeader(ws);
  await sendWorkbook(res, wb, "a-renouveler.xlsx");
});

// ---------------------------------------------------------------------------
// Excel — Historique complet
// ---------------------------------------------------------------------------
rapportsRouter.get("/historique.xlsx", async (_req, res) => {
  const rows = await db
    .select({
      date: historique.dateEvenement,
      type: historique.typeEvenement,
      entiteType: historique.entiteType,
      entiteId: historique.entiteId,
      agentNom: agents.nom,
    })
    .from(historique)
    .leftJoin(agents, eq(historique.agentId, agents.id))
    .orderBy(desc(historique.dateEvenement))
    .limit(5000);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Historique");
  ws.columns = [
    { header: "Date", key: "date", width: 20 },
    { header: "Type d'événement", key: "type", width: 24 },
    { header: "Entité", key: "entiteType", width: 16 },
    { header: "ID", key: "entiteId", width: 10 },
    { header: "Agent lié", key: "agentNom", width: 24 },
  ];
  rows.forEach((r) => ws.addRow(r));
  styleHeader(ws);
  await sendWorkbook(res, wb, "historique.xlsx");
});

// ---------------------------------------------------------------------------
// Excel — Budget par division / famille
// ---------------------------------------------------------------------------
rapportsRouter.get("/budget.xlsx", async (_req, res) => {
  const rows = await db
    .select({
      division: divisions.nom,
      famille: familles.nom,
      montant: sql<number>`coalesce(sum(${affectations.quantite} * ${articles.prixUnitaire}), 0)`,
    })
    .from(affectations)
    .innerJoin(articles, eq(affectations.articleId, articles.id))
    .leftJoin(familles, eq(articles.familleId, familles.id))
    .leftJoin(agents, eq(affectations.agentId, agents.id))
    .leftJoin(divisions, eq(agents.divisionId, divisions.id))
    .groupBy(divisions.nom, familles.nom);

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Budget");
  ws.columns = [
    { header: "Division", key: "division", width: 30 },
    { header: "Famille", key: "famille", width: 24 },
    { header: "Montant (MAD)", key: "montant", width: 16 },
  ];
  rows.forEach((r) => ws.addRow({ ...r, division: r.division ?? "Dotation collective (équipe)", montant: Number(r.montant) }));
  styleHeader(ws);
  await sendWorkbook(res, wb, "budget.xlsx");
});
