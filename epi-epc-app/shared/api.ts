/**
 * Types partagés entre le client et le serveur.
 */

export interface AuthUser {
  id: number;
  username: string;
  nom: string;
  agentId: number | null;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  user: AuthUser;
}

export interface DashboardKpis {
  totalArticles: number;
  totalReferences: number;
  stockDisponible: number;
  stockReserve: number;
  stockDistribue: number;
  articlesRupture: number;
  articlesStockFaible: number;
  articlesARenouveler: number;
  totalBeneficiaires: number;
  totalEquipes: number;
  alertesNonLues: number;
  controlesEnRetard: number;
  valeurStockDisponible: number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface DashboardCharts {
  repartitionFamille: ChartPoint[];
  repartitionDivision: ChartPoint[];
  repartitionService: ChartPoint[];
  evolutionDotations: { mois: string; epi: number; epc: number }[];
  evolutionAchats: { mois: string; montant: number }[];
  coutParDivision: ChartPoint[];
  tauxCouverture: { equipe: string; taux: number }[];
}

// Familles soumises à un contrôle et une réépreuve périodiques règlementaires
// (appareils de levage, extincteurs/LCI, appareils sous pression, perches
// isolantes) — chaque unité physique est une affectation, son contrôle une
// ligne controles_periodiques liée par affectationId.
export interface ReglementaireFamilleStats {
  familleId: number;
  familleNom: string;
  nbUnites: number;
  nbControlesEnRetard: number;
  nbControlesAVenir30j: number;
  nbSansControlePlanifie: number;
}

export interface ReglementaireEcheance {
  controleId: number;
  familleNom: string;
  designation: string;
  lieuEmplacement: string | null;
  numeroSerie: string | null;
  type: string;
  datePlanifiee: string;
  statut: string;
}

export interface DashboardReglementaire {
  parFamille: ReglementaireFamilleStats[];
  expires: ReglementaireEcheance[];
  aVenir: ReglementaireEcheance[];
}

// Référentiel de classification des équipements (Catégorie générale > Famille >
// Sous-famille, profondeur variable — les feuilles d'origine sont désormais des
// ArticleReference) — voir server/db/schema.ts, equipement_hierarchie et
// GET /api/articles/hierarchie?parentId=.
export interface HierarchieNode {
  id: number;
  parentId: number | null;
  code: string;
  codeAbrege?: string | null;
  nom: string;
  niveau: number;
  ordre: number;
  soumisControleReglementaire: boolean;
  soumisControleReglementaireExplicite?: boolean;
}

export interface Division {
  id: number;
  code: string;
  nom: string;
  chefAgentId: number | null;
}

export interface Service {
  id: number;
  code: string;
  nom: string;
  divisionId: number;
  chefAgentId: number | null;
}

export interface Equipe {
  id: number;
  code: string;
  nom: string;
  serviceId: number;
  teamType: string | null;
  chefAgentId: number | null;
}

export interface AgentMensuration {
  cle: string;
  valeur: string;
}

// Champs communs à GET /agents (liste) et GET /agents/:id (détail) ; le détail
// ajoute email/note/dotations/mensurations, absents de la liste.
export interface Agent {
  id: number;
  matricule: string;
  nom: string;
  prenom: string | null;
  photoUrl: string | null;
  fonction: string | null;
  poste: string | null;
  statut: string;
  telephone: string | null;
  email?: string | null;
  note?: string | null;
  dateEmbauche: string | null;
  divisionId: number | null;
  serviceId: number | null;
  equipeId: number | null;
  divisionNom: string | null;
  serviceNom: string | null;
  equipeNom: string | null;
  mensurations?: AgentMensuration[];
}

// Forme jointe renvoyée par GET /affectations (le schéma brut a davantage de
// colonnes internes — validateurAgentId, signatureUrl, kitTemplateId… — non
// exposées ici).
export interface Affectation {
  id: number;
  articleId: number;
  designation: string;
  codeArticle: string;
  beneficiaireType: "agent" | "equipe";
  agentId: number | null;
  agentNom: string | null;
  equipeId: number | null;
  equipeNom: string | null;
  quantite: number;
  taille: string | null;
  pointure: string | null;
  dateAffectation: string | null;
  motif: string | null;
  statut: string;
  dateRetour: string | null;
  dateClotureStatut?: string | null;
  numeroSerie: string | null;
  lieuEmplacement: string | null;
  marque: string | null;
  dateFabricationUnite: string | null;
  observations: string | null;
  caracteristiques: Record<string, unknown> | null;
  soumisControleReglementaire: boolean | null;
}

// Forme jointe renvoyée par GET /controles.
export interface Controle {
  id: number;
  articleId: number | null;
  designation: string | null;
  hierarchieNom: string | null;
  soumisControleReglementaire: boolean | null;
  affectationId: number | null;
  numeroSerie: string | null;
  lieuEmplacement: string | null;
  type: string;
  datePlanifiee: string;
  dateRealisee: string | null;
  resultat: string | null;
  prochaineEcheance: string | null;
  statut: string;
  realiseParAgentId: number | null;
  realiseParNom: string | null;
}

// Article de référence (base de catalogue) — GET /articles-reference/:id renvoie
// en plus hierarchie/articles/kitLignes/documents ; GET /articles-reference
// (liste) renvoie hierarchieParentNom/nbArticles à la place des champs
// techniques détaillés. Les deux formes sont donc partiellement optionnelles ici.
export interface ArticleReference {
  id: number;
  code: string;
  designation: string;
  hierarchieParentId: number;
  hierarchieParentNom?: string | null;
  soumisControleReglementaire?: boolean | null;
  caracteristiquesTechniques?: Record<string, unknown> | null;
  ficheTechniquePdfUrl?: string | null;
  photoUrl?: string | null;
  normes?: string[] | null;
  certifications?: string[] | null;
  dureeVieRecommandeeMois: number | null;
  quantiteReference: number | null;
  typeDotation: string | null;
  observations?: string | null;
  actif: boolean;
  nbArticles?: number;
}

// Moteur unique de calcul besoin (kitTemplates vs. affectations actives),
// voir server/services/besoinService.ts.
export interface BesoinLine {
  beneficiaireType: "agent" | "equipe";
  agentId?: number;
  agentNom?: string;
  equipeId?: number;
  equipeNom?: string;
  divisionId: number | null;
  articleReferenceId: number;
  referenceDesignation: string;
  quantiteBesoin: number;
  quantiteDotee: number;
  ecart: number;
  tauxSatisfaction: number;
}
