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
}
