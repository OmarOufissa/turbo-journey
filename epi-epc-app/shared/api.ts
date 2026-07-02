/**
 * Types partagés entre le client et le serveur.
 */

export type Role = "administrateur" | "gestionnaire_stock" | "responsable_hse" | "chef_equipe" | "consultation";

export interface AuthUser {
  id: number;
  username: string;
  nom: string;
  role: Role;
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

export const ROLE_LABELS: Record<Role, string> = {
  administrateur: "Administrateur",
  gestionnaire_stock: "Gestionnaire de stock",
  responsable_hse: "Responsable HSE",
  chef_equipe: "Chef d'équipe",
  consultation: "Consultation",
};
