export interface HabRowData {
  domaine: string;
  ouvrage: string;
  indication: string;
}

export type HabRows = Partial<Record<'H0V_B0V' | 'H1V_B1V' | 'H2V_B2V' | 'HC_BC' | 'BR' | 'SF6' | 'H1N' | 'H1T' | 'H2N' | 'H2T', HabRowData>>;

export interface EmployeeVersion {
  id: number;
  versionNumber: number;
  stCodes: string[];
  htCodes: string[];
  nDeTitre: string;
  nDeTitreHt?: string | null;
  nDeTitreSt?: string | null;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId?: number | null;
  division: string;
  service: string;
  equipe?: string | null;
  habRows?: HabRows | null;
  dateValidation: string;
  dateExpiration: string;
  // Per-type validity (HT and ST are independent). May be null when the agent
  // holds no symbol of that type; falls back to the shared date for legacy rows.
  dateValidationHt?: string | null;
  dateExpirationHt?: string | null;
  dateValidationSt?: string | null;
  dateExpirationSt?: string | null;
  pdfPath?: string | null;
  pdfStatus?: "draft" | "signed" | null;
  pdfPathSt?: string | null;
  pdfStatusSt?: "draft" | "signed" | null;
  createdAt: string;
}

export interface Employee {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  aptitudeMedicale?: string | null;
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
  currentVersion: EmployeeVersion | null;
  versions?: EmployeeVersion[];
}

export interface EmployeesPage {
  employees: Employee[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateEmployeeRequest {
  matricule: string;
  nom: string;
  prenom: string;
  stCodes: string[];
  htCodes: string[];
  nDeTitre: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId?: number | null;
  habRows?: HabRows | null;
  dateValidation: string;
  dateExpiration: string;
}

export interface UpdateEmployeeRequest {
  nom?: string;
  prenom?: string;
  stCodes: string[];
  htCodes: string[];
  nDeTitre: string;
  fonction: string;
  divisionId: number;
  serviceId: number;
  equipeId?: number | null;
  habRows?: HabRows | null;
  dateValidation: string;
  dateExpiration: string;
  expectedUpdatedAt?: string;
  // Target of a type-scoped renewal. When set, the other type is left untouched.
  renewType?: "ht" | "st";
}

// Pick the expiration (resp. validation) date for a given habilitation type,
// falling back to the shared date for versions created before the HT/ST split.
export function expirationForType(v: EmployeeVersion | null | undefined, type: "ht" | "st" | null): string | undefined {
  if (!v) return undefined;
  if (type === "ht") return v.dateExpirationHt ?? (v.htCodes?.length ? v.dateExpiration : undefined);
  if (type === "st") return v.dateExpirationSt ?? (v.stCodes?.length ? v.dateExpiration : undefined);
  return v.dateExpiration;
}
export function validationForType(v: EmployeeVersion | null | undefined, type: "ht" | "st" | null): string | undefined {
  if (!v) return undefined;
  if (type === "ht") return v.dateValidationHt ?? (v.htCodes?.length ? v.dateValidation : undefined);
  if (type === "st") return v.dateValidationSt ?? (v.stCodes?.length ? v.dateValidation : undefined);
  return v.dateValidation;
}

// Title number for a given habilitation type (falls back to the shared number).
export function titleForType(v: EmployeeVersion | null | undefined, type: "ht" | "st" | null): string | undefined {
  if (!v) return undefined;
  if (type === "ht") return v.nDeTitreHt ?? (v.htCodes?.length ? v.nDeTitre : undefined);
  if (type === "st") return v.nDeTitreSt ?? (v.stCodes?.length ? v.nDeTitre : undefined);
  return v.nDeTitre;
}
