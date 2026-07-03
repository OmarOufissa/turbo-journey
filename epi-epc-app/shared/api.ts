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
