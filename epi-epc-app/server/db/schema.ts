import {
  sqliteTable,
  text,
  integer,
  real,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";
import { relations, sql } from "drizzle-orm";

const now = sql`(CURRENT_TIMESTAMP)`;

// ============================================================================
// ORGANISATION — Direction > Division > Service > Équipe > Agent
// ============================================================================

export const divisions = sqliteTable(
  "divisions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    nom: text("nom").notNull(),
    chefAgentId: integer("chef_agent_id"),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({ nomIdx: uniqueIndex("divisions_nom_idx").on(t.nom) }),
);

export const services = sqliteTable(
  "services",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    nom: text("nom").notNull(),
    divisionId: integer("division_id")
      .notNull()
      .references(() => divisions.id, { onDelete: "cascade" }),
    chefAgentId: integer("chef_agent_id"),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    divisionIdx: index("services_division_idx").on(t.divisionId),
    uniqueNamePerDivision: uniqueIndex("services_nom_division_idx").on(t.nom, t.divisionId),
  }),
);

export const equipes = sqliteTable(
  "equipes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    nom: text("nom").notNull(),
    serviceId: integer("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    // "Équipe Lignes", "Équipe TST Postes", ... — drives standard EPI/EPC kit template matching
    teamType: text("team_type"),
    chefAgentId: integer("chef_agent_id"),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    serviceIdx: index("equipes_service_idx").on(t.serviceId),
    teamTypeIdx: index("equipes_team_type_idx").on(t.teamType),
    uniqueNamePerService: uniqueIndex("equipes_nom_service_idx").on(t.nom, t.serviceId),
  }),
);

export const agents = sqliteTable(
  "agents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    matricule: text("matricule").notNull().unique(),
    nom: text("nom").notNull(),
    prenom: text("prenom"),
    photoUrl: text("photo_url"),
    divisionId: integer("division_id").references(() => divisions.id),
    serviceId: integer("service_id").references(() => services.id),
    equipeId: integer("equipe_id").references(() => equipes.id),
    fonction: text("fonction"),
    poste: text("poste"),
    dateEmbauche: text("date_embauche"),
    telephone: text("telephone"),
    email: text("email"),
    statut: text("statut").notNull().default("actif"), // actif | inactif | archive
    note: text("note"),
    createdAt: text("created_at").default(now).notNull(),
    updatedAt: text("updated_at").default(now).notNull(),
  },
  (t) => ({
    matriculeIdx: uniqueIndex("agents_matricule_idx").on(t.matricule),
    divisionIdx: index("agents_division_idx").on(t.divisionId),
    serviceIdx: index("agents_service_idx").on(t.serviceId),
    equipeIdx: index("agents_equipe_idx").on(t.equipeId),
    statutIdx: index("agents_statut_idx").on(t.statut),
  }),
);

export const orgRelations = relations(divisions, ({ many }) => ({
  services: many(services),
}));
export const servicesRelations = relations(services, ({ one, many }) => ({
  division: one(divisions, { fields: [services.divisionId], references: [divisions.id] }),
  equipes: many(equipes),
}));
export const equipesRelations = relations(equipes, ({ one, many }) => ({
  service: one(services, { fields: [equipes.serviceId], references: [services.id] }),
  agents: many(agents),
}));
export const agentsRelations = relations(agents, ({ one, many }) => ({
  division: one(divisions, { fields: [agents.divisionId], references: [divisions.id] }),
  service: one(services, { fields: [agents.serviceId], references: [services.id] }),
  equipe: one(equipes, { fields: [agents.equipeId], references: [equipes.id] }),
  mensurations: many(agentMensurations),
}));

// Profil de mensurations d'un agent — table enfant plutôt que colonnes fixes ou JSON, pour
// qu'une nouvelle mensuration future soit une simple ligne (nouvelle "cle") sans jamais
// nécessiter de migration de schéma.
export const agentMensurations = sqliteTable(
  "agent_mensurations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    agentId: integer("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    // pointure_chaussures | pointure_bottes | taille_pantalon | taille_veste |
    // taille_combinaison | taille_gants | taille_casque | tour_de_tete | taille_harnais |
    // taille_masque_respiratoire | (toute clé future libre)
    cle: text("cle").notNull(),
    valeur: text("valeur").notNull(),
    createdAt: text("created_at").default(now).notNull(),
    updatedAt: text("updated_at").default(now).notNull(),
  },
  (t) => ({
    agentIdx: index("agent_mensurations_agent_idx").on(t.agentId),
    uniqueClePerAgent: uniqueIndex("agent_mensurations_agent_cle_idx").on(t.agentId, t.cle),
  }),
);
export const agentMensurationsRelations = relations(agentMensurations, ({ one }) => ({
  agent: one(agents, { fields: [agentMensurations.agentId], references: [agents.id] }),
}));

// ============================================================================
// UTILISATEURS (comptes applicatifs)
// ============================================================================

// Application à usage unique : un seul compte, sans distinction de rôle.
export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    username: text("username").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    nom: text("nom").notNull(),
    agentId: integer("agent_id").references(() => agents.id),
    actif: integer("actif", { mode: "boolean" }).notNull().default(true),
    derniereConnexion: text("derniere_connexion"),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({ usernameIdx: uniqueIndex("users_username_idx").on(t.username) }),
);

// ============================================================================
// CATALOGUE ARTICLES — Familles / Sous-familles / Articles / Marchés
// ============================================================================

// Hiérarchie unique et extensible : Catégorie générale (niveau 1) > Famille (2) >
// Sous-famille (3) > Type d'équipement (4) > ... — auto-référencée plutôt que 4 tables
// fixes, pour rester enrichissable à n'importe quelle profondeur sans changement de code.
// soumisControleReglementaire est dénormalisé sur CHAQUE nœud (y compris tous les
// descendants d'un nœud marqué) au moment de la construction de l'arbre, pour éviter
// toute remontée récursive à l'exécution : une simple jointure suffit partout où le
// flag est utilisé (tableau de bord, contrôles, affectations).
export const equipementHierarchie = sqliteTable(
  "equipement_hierarchie",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    parentId: integer("parent_id").references((): AnySQLiteColumn => equipementHierarchie.id, { onDelete: "cascade" }),
    code: text("code").notNull().unique(),
    // Abréviation courte (ex. "EPI", "CAS") utilisée par codificationService pour composer
    // les codes d'article de référence/article — générée automatiquement, éditable via
    // l'interface de gestion de la hiérarchie.
    codeAbrege: text("code_abrege"),
    nom: text("nom").notNull(),
    niveau: integer("niveau").notNull(), // 1=catégorie générale, 2=famille, 3=sous-famille… (indicatif, non structurant)
    ordre: integer("ordre").notNull().default(0),
    // soumisControleReglementaire est dénormalisé (cascade complète, y compris héritage) —
    // soumisControleReglementaireExplicite distingue "posé sur ce nœud" d'"hérité d'un
    // ancêtre", indispensable dès que le flag devient éditable (voir
    // hierarchieService.recomputeReglementaireCascade).
    soumisControleReglementaire: integer("soumis_controle_reglementaire", { mode: "boolean" }).notNull().default(false),
    soumisControleReglementaireExplicite: integer("soumis_controle_reglementaire_explicite", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    parentIdx: index("equipement_hierarchie_parent_idx").on(t.parentId),
    uniqueNomParent: uniqueIndex("equipement_hierarchie_nom_parent_idx").on(t.nom, t.parentId),
    uniqueAbregeParent: uniqueIndex("equipement_hierarchie_parent_abrege_idx").on(t.parentId, t.codeAbrege),
  }),
);

// TEMPORAIRE (à supprimer dans une migration de nettoyage séparée, une fois les
// données transférées vers equipement_hierarchie) — évite toute ambiguïté de
// "rename" pour drizzle-kit generate en scindant l'évolution en add-puis-drop.
// Ne pas supprimer avant une version ultérieure : sur une base déjà installée,
// migrateHierarchieIfNeeded() (server/db/migrateHierarchie.ts) doit encore
// pouvoir lire ces tables pour transférer les données existantes — les migrations
// Drizzle s'appliquent avant ce contrôle, donc les droper ici les ferait
// disparaître avant tout transfert possible.
export const familles = sqliteTable("familles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  nom: text("nom").notNull().unique(),
  ordre: integer("ordre").notNull().default(0),
  soumisControleReglementaire: integer("soumis_controle_reglementaire", { mode: "boolean" }).notNull().default(false),
});
export const sousFamilles = sqliteTable(
  "sous_familles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    familleId: integer("famille_id").notNull().references(() => familles.id, { onDelete: "cascade" }),
    nom: text("nom").notNull(),
  },
  (t) => ({
    familleIdx: index("sous_familles_famille_idx").on(t.familleId),
    uniqueNamePerFamille: uniqueIndex("sous_familles_nom_famille_idx").on(t.nom, t.familleId),
  }),
);

export const marches = sqliteTable(
  "marches",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    numero: text("numero").notNull(),
    annee: integer("annee").notNull(),
    objet: text("objet").notNull(),
    fournisseur: text("fournisseur").notNull(),
    montant: real("montant"),
    dateNotification: text("date_notification"),
    dateLivraison: text("date_livraison"),
    statut: text("statut").notNull().default("notifie"), // notifie | en_cours | livre | solde
    observations: text("observations"),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({ numeroIdx: uniqueIndex("marches_numero_annee_idx").on(t.numero, t.annee) }),
);

// Article de référence — modèle normalisé de l'équipement (bibliothèque technique utilisée
// pour tous les achats). Tout article physique doit obligatoirement y être rattaché
// (articles.articleReferenceId). hierarchieParentId pointe vers le nœud immédiat de
// equipement_hierarchie sous lequel la référence est classée — niveau 2 (famille) pour la
// plupart des branches, niveau 3 (sous-famille) pour les branches qui vont plus profond
// (Appareils de levage, Appareils sous pression) ; profondeur variable, non fixe.
export const articlesReference = sqliteTable(
  "articles_reference",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(), // auto-généré (codificationService), éditable
    hierarchieParentId: integer("hierarchie_parent_id")
      .notNull()
      .references(() => equipementHierarchie.id),
    designation: text("designation").notNull(),
    caracteristiquesTechniques: text("caracteristiques_techniques", { mode: "json" }), // {clé, valeur, unite?}[]
    ficheTechniquePdfUrl: text("fiche_technique_pdf_url"),
    photoUrl: text("photo_url"),
    normes: text("normes", { mode: "json" }), // string[]
    certifications: text("certifications", { mode: "json" }), // string[]
    dureeVieRecommandeeMois: integer("duree_vie_recommandee_mois"),
    // Préremplissage UI uniquement (ligne de gabarit de dotation) — jamais lu par le moteur
    // de calcul de besoin, qui se base sur kit_template_lignes.quantite (voir besoinService).
    quantiteReference: integer("quantite_reference"),
    typeDotation: text("type_dotation"), // individuelle | collective (indicatif, éditable)
    observations: text("observations"),
    actif: integer("actif", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").default(now).notNull(),
    updatedAt: text("updated_at").default(now).notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("articles_reference_code_idx").on(t.code),
    parentIdx: index("articles_reference_parent_idx").on(t.hierarchieParentId),
    designationIdx: index("articles_reference_designation_idx").on(t.designation),
  }),
);

export const articles = sqliteTable(
  "articles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    codeArticle: text("code_article").notNull().unique(),
    codeInterne: text("code_interne"),
    codeFournisseur: text("code_fournisseur"),
    // Article de référence auquel ce lot/article physique est obligatoirement rattaché —
    // porte les caractéristiques techniques inhérentes à ce type d'équipement (héritées,
    // non dupliquées ici).
    articleReferenceId: integer("article_reference_id").references(() => articlesReference.id),
    // Pointe vers le nœud le plus précis de equipement_hierarchie auquel appartient
    // l'article. TEMPORAIRE (à supprimer dans une migration de nettoyage séparée, une fois
    // les données transférées vers articles_reference) — voir familles/sousFamilles
    // ci-dessus pour le même principe : migrateArticlesReferenceIfNeeded() doit encore
    // pouvoir lire cette colonne pour transférer les bases déjà installées.
    hierarchieId: integer("hierarchie_id").references(() => equipementHierarchie.id),
    // TEMPORAIRE (à supprimer dans la migration de nettoyage — voir familles/sousFamilles ci-dessus)
    familleId: integer("famille_id").references(() => familles.id),
    sousFamilleId: integer("sous_famille_id").references(() => sousFamilles.id),
    familleSecondaireId: integer("famille_secondaire_id").references(() => familles.id),
    designation: text("designation").notNull(),
    description: text("description"),
    photoUrl: text("photo_url"),
    referenceFabricant: text("reference_fabricant"),
    constructeur: text("constructeur"),
    marque: text("marque"),
    modele: text("modele"),
    normes: text("normes"),
    certification: text("certification"),
    dateFabrication: text("date_fabrication"),
    // Date d'acquisition du lot — distincte de dateFabrication (fabrication du matériel).
    dateAcquisition: text("date_acquisition"),
    // Numéro de série du lot lorsque celui-ci constitue lui-même une unité physique
    // sérialisée (ex. un pont roulant de rechange en stock avant affectation) — distinct de
    // affectations.numeroSerie, qui suit une unité individuelle une fois affectée.
    numeroSerie: text("numero_serie"),
    dureeVieMois: integer("duree_vie_mois"),
    dateLimiteUtilisation: text("date_limite_utilisation"),
    noticePdfUrl: text("notice_pdf_url"),
    ficheTechniquePdfUrl: text("fiche_technique_pdf_url"),
    poidsKg: real("poids_kg"),
    dimensions: text("dimensions"),
    couleur: text("couleur"),
    aTaille: integer("a_taille", { mode: "boolean" }).notNull().default(false),
    aPointure: integer("a_pointure", { mode: "boolean" }).notNull().default(false),
    dateMiseEnService: text("date_mise_en_service"),
    observations: text("observations"),
    prixUnitaire: real("prix_unitaire"),
    marcheId: integer("marche_id").references(() => marches.id),
    fournisseur: text("fournisseur"),
    garantieMois: integer("garantie_mois"),
    stockMin: integer("stock_min").notNull().default(0),
    stockMax: integer("stock_max"),
    // Compteurs dérivés du ledger stock_mouvements, maintenus par l'API pour lecture rapide
    stockDisponible: integer("stock_disponible").notNull().default(0),
    stockReserve: integer("stock_reserve").notNull().default(0),
    stockCommande: integer("stock_commande").notNull().default(0),
    unite: text("unite").notNull().default("pièce"),
    actif: integer("actif", { mode: "boolean" }).notNull().default(true),
    createdAt: text("created_at").default(now).notNull(),
    updatedAt: text("updated_at").default(now).notNull(),
  },
  (t) => ({
    codeIdx: uniqueIndex("articles_code_idx").on(t.codeArticle),
    articleReferenceIdx: index("articles_article_reference_idx").on(t.articleReferenceId),
    hierarchieIdx: index("articles_hierarchie_idx").on(t.hierarchieId),
    designationIdx: index("articles_designation_idx").on(t.designation),
    stockDisponibleIdx: index("articles_stock_disponible_idx").on(t.stockDisponible),
  }),
);

export const equipementHierarchieRelations = relations(equipementHierarchie, ({ one, many }) => ({
  parent: one(equipementHierarchie, {
    fields: [equipementHierarchie.parentId],
    references: [equipementHierarchie.id],
    relationName: "hierarchieParent",
  }),
  enfants: many(equipementHierarchie, { relationName: "hierarchieParent" }),
  articles: many(articles),
  articlesReference: many(articlesReference),
}));
export const articlesReferenceRelations = relations(articlesReference, ({ one, many }) => ({
  hierarchieParent: one(equipementHierarchie, { fields: [articlesReference.hierarchieParentId], references: [equipementHierarchie.id] }),
  articles: many(articles),
  kitTemplateLignes: many(kitTemplateLignes),
}));
export const articlesRelations = relations(articles, ({ one, many }) => ({
  articleReference: one(articlesReference, { fields: [articles.articleReferenceId], references: [articlesReference.id] }),
  hierarchie: one(equipementHierarchie, { fields: [articles.hierarchieId], references: [equipementHierarchie.id] }),
  marche: one(marches, { fields: [articles.marcheId], references: [marches.id] }),
  mouvements: many(stockMouvements),
  affectations: many(affectations),
}));
export const marchesRelations = relations(marches, ({ many }) => ({ articles: many(articles) }));

// ============================================================================
// KITS STANDARD (dotation type) — panier EPI/EPC par type d'équipe ou poste
// ============================================================================

export const kitTemplates = sqliteTable(
  "kit_templates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull().unique(),
    label: text("label").notNull(),
    appliesToType: text("applies_to_type").notNull(), // team_type | poste | service
    appliesToValue: text("applies_to_value").notNull(),
    categorie: text("categorie").notNull(), // EPI | EPC
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({ codeIdx: uniqueIndex("kit_templates_code_idx").on(t.code) }),
);

export const kitTemplateLignes = sqliteTable(
  "kit_template_lignes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kitTemplateId: integer("kit_template_id")
      .notNull()
      .references(() => kitTemplates.id, { onDelete: "cascade" }),
    // TEMPORAIRE (à supprimer dans une migration de nettoyage — voir familles/sousFamilles) :
    // conservé le temps que migrateArticlesReferenceIfNeeded() puisse encore en dériver
    // articleReferenceId sur une base déjà installée.
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id),
    // Référence authentique du moteur de besoin (besoinService) — quantité type par
    // poste/type d'équipe pour cette référence, indépendamment du lot/article physique acheté.
    articleReferenceId: integer("article_reference_id").references(() => articlesReference.id),
    quantite: integer("quantite").notNull().default(1),
  },
  (t) => ({ kitIdx: index("kit_template_lignes_kit_idx").on(t.kitTemplateId) }),
);

export const kitTemplatesRelations = relations(kitTemplates, ({ many }) => ({ lignes: many(kitTemplateLignes) }));
export const kitTemplateLignesRelations = relations(kitTemplateLignes, ({ one }) => ({
  kitTemplate: one(kitTemplates, { fields: [kitTemplateLignes.kitTemplateId], references: [kitTemplates.id] }),
  article: one(articles, { fields: [kitTemplateLignes.articleId], references: [articles.id] }),
  articleReference: one(articlesReference, { fields: [kitTemplateLignes.articleReferenceId], references: [articlesReference.id] }),
}));

// ============================================================================
// STOCK — mouvements (ledger append-only)
// ============================================================================

// type: entree_achat | entree_retour | sortie_affectation | sortie_reforme | sortie_perte | ajustement
export const stockMouvements = sqliteTable(
  "stock_mouvements",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id),
    type: text("type").notNull(),
    quantite: integer("quantite").notNull(), // signé : + entrée, - sortie
    referenceType: text("reference_type"), // marche | affectation | reforme | manuel
    referenceId: integer("reference_id"),
    motif: text("motif"),
    dateMouvement: text("date_mouvement").default(now).notNull(),
    creeParUserId: integer("cree_par_user_id").references(() => users.id),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    articleIdx: index("stock_mouvements_article_idx").on(t.articleId),
    dateIdx: index("stock_mouvements_date_idx").on(t.dateMouvement),
  }),
);

// ============================================================================
// AFFECTATIONS — dotation nominative ou collective
// ============================================================================

// beneficiaireType: agent | equipe · statut: actif | retourne | perdu | reforme
export const affectations = sqliteTable(
  "affectations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id),
    beneficiaireType: text("beneficiaire_type").notNull(),
    agentId: integer("agent_id").references(() => agents.id),
    equipeId: integer("equipe_id").references(() => equipes.id),
    quantite: integer("quantite").notNull().default(1),
    taille: text("taille"),
    pointure: text("pointure"),
    // Nullable : les dotations reprises depuis les fichiers sources n'ont pas de date
    // documentée. Les nouvelles affectations créées via l'application doivent en fournir une
    // (contrôle applicatif dans server/routes/affectations.ts), sans contrainte NOT NULL en base.
    dateAffectation: text("date_affectation"),
    motif: text("motif"),
    validateurAgentId: integer("validateur_agent_id").references(() => agents.id),
    signatureUrl: text("signature_url"),
    statut: text("statut").notNull().default("actif"),
    dateRetour: text("date_retour"),
    etatRetour: text("etat_retour"), // bon | usage_normal | endommage | hors_service
    // Date à laquelle le statut a quitté "actif" — enregistrée automatiquement par /retour,
    // /perdu et /reforme, quel que soit le motif ; contrairement à dateRetour (propre au
    // retour), couvre uniformément toutes les transitions de statut.
    dateClotureStatut: text("date_cloture_statut"),
    kitTemplateId: integer("kit_template_id").references(() => kitTemplates.id),
    // Champs de suivi par unité physique — utilisés pour les équipements soumis à
    // contrôle règlementaire (appareils de levage, extincteurs/LCI, appareils sous
    // pression, perches isolantes) où chaque affectation représente un appareil
    // individuel plutôt qu'un lot ; sans objet pour les EPI/EPC classiques (restent
    // null). dateAffectation fait déjà office de « date de mise en service », et
    // controles_periodiques (dateRealisee / prochaineEcheance) fait office de
    // « date de vérification / prochaine échéance » pour ces mêmes unités.
    numeroSerie: text("numero_serie"),
    lieuEmplacement: text("lieu_emplacement"),
    marque: text("marque"),
    dateFabricationUnite: text("date_fabrication_unite"),
    observations: text("observations"),
    // Caractéristiques propres à la famille (force, capacité en litres, pression en
    // bar, longueur, diamètre, embout, isolement, type d'agent extincteur...) —
    // volontairement en JSON libre plutôt qu'une colonne par famille, tant les
    // champs varient d'un type d'équipement à l'autre.
    caracteristiques: text("caracteristiques", { mode: "json" }),
    createdAt: text("created_at").default(now).notNull(),
    updatedAt: text("updated_at").default(now).notNull(),
  },
  (t) => ({
    articleIdx: index("affectations_article_idx").on(t.articleId),
    agentIdx: index("affectations_agent_idx").on(t.agentId),
    equipeIdx: index("affectations_equipe_idx").on(t.equipeId),
    statutIdx: index("affectations_statut_idx").on(t.statut),
    dateIdx: index("affectations_date_idx").on(t.dateAffectation),
    numeroSerieIdx: index("affectations_numero_serie_idx").on(t.numeroSerie),
  }),
);

export const affectationsRelations = relations(affectations, ({ one }) => ({
  article: one(articles, { fields: [affectations.articleId], references: [articles.id] }),
  agent: one(agents, { fields: [affectations.agentId], references: [agents.id] }),
  equipe: one(equipes, { fields: [affectations.equipeId], references: [equipes.id] }),
  kitTemplate: one(kitTemplates, { fields: [affectations.kitTemplateId], references: [kitTemplates.id] }),
}));

// ============================================================================
// CONTRÔLES PÉRIODIQUES
// ============================================================================

// type: inspection | essai_dielectrique | etalonnage | maintenance | renouvellement
// statut: planifie | realise | en_retard | annule
export const controlesPeriodiques = sqliteTable(
  "controles_periodiques",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id").references(() => articles.id),
    affectationId: integer("affectation_id").references(() => affectations.id),
    type: text("type").notNull(),
    datePlanifiee: text("date_planifiee").notNull(),
    dateRealisee: text("date_realisee"),
    resultat: text("resultat"), // conforme | non_conforme | a_revoir
    prochaineEcheance: text("prochaine_echeance"),
    realiseParAgentId: integer("realise_par_agent_id").references(() => agents.id),
    observations: text("observations"),
    statut: text("statut").notNull().default("planifie"),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    articleIdx: index("controles_article_idx").on(t.articleId),
    dateIdx: index("controles_date_planifiee_idx").on(t.datePlanifiee),
    statutIdx: index("controles_statut_idx").on(t.statut),
  }),
);

// ============================================================================
// RÉFORMES
// ============================================================================

export const reformes = sqliteTable(
  "reformes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    articleId: integer("article_id")
      .notNull()
      .references(() => articles.id),
    affectationId: integer("affectation_id").references(() => affectations.id),
    dateReforme: text("date_reforme").notNull(),
    quantite: integer("quantite").notNull().default(1),
    motif: text("motif").notNull(),
    decision: text("decision"),
    valideParAgentId: integer("valide_par_agent_id").references(() => agents.id),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({ articleIdx: index("reformes_article_idx").on(t.articleId) }),
);

// ============================================================================
// DOCUMENTS — pièces jointes polymorphes
// ============================================================================

// entiteType: article | article_reference | agent | marche | affectation
// typeDocument: notice | photo | certificat | declaration_ce | norme | pv_essai | rapport | autre
export const documents = sqliteTable(
  "documents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    entiteType: text("entite_type").notNull(),
    entiteId: integer("entite_id").notNull(),
    typeDocument: text("type_document").notNull(),
    nomFichier: text("nom_fichier").notNull(),
    url: text("url").notNull(),
    tailleOctets: integer("taille_octets"),
    uploadedByUserId: integer("uploaded_by_user_id").references(() => users.id),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({ entiteIdx: index("documents_entite_idx").on(t.entiteType, t.entiteId) }),
);

// ============================================================================
// ALERTES
// ============================================================================

// type: stock_faible | rupture | fin_de_vie | controle_a_faire | inspection | etalonnage | garantie_expiree | livraison_attendue
// niveau: info | warning | critical
export const alertes = sqliteTable(
  "alertes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type").notNull(),
    entiteType: text("entite_type"),
    entiteId: integer("entite_id"),
    niveau: text("niveau").notNull().default("info"),
    message: text("message").notNull(),
    lue: integer("lue", { mode: "boolean" }).notNull().default(false),
    traitee: integer("traitee", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    typeIdx: index("alertes_type_idx").on(t.type),
    lueIdx: index("alertes_lue_idx").on(t.lue),
    niveauIdx: index("alertes_niveau_idx").on(t.niveau),
  }),
);

// ============================================================================
// HISTORIQUE — journal d'audit append-only (aucune donnée supprimée)
// ============================================================================

export const historique = sqliteTable(
  "historique",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    typeEvenement: text("type_evenement").notNull(),
    entiteType: text("entite_type").notNull(),
    entiteId: integer("entite_id"),
    agentId: integer("agent_id").references(() => agents.id),
    equipeId: integer("equipe_id").references(() => equipes.id),
    articleId: integer("article_id").references(() => articles.id),
    utilisateurId: integer("utilisateur_id").references(() => users.id),
    details: text("details", { mode: "json" }),
    dateEvenement: text("date_evenement").default(now).notNull(),
    createdAt: text("created_at").default(now).notNull(),
  },
  (t) => ({
    typeIdx: index("historique_type_idx").on(t.typeEvenement),
    entiteIdx: index("historique_entite_idx").on(t.entiteType, t.entiteId),
    dateIdx: index("historique_date_idx").on(t.dateEvenement),
    // append-only: chaque ligne est immuable une fois créée (pas d'UPDATE/DELETE côté API)
    uniqueAppendOnly: uniqueIndex("historique_id_created_at_idx").on(t.id, t.createdAt),
  }),
);
