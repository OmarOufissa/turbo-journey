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
  dateValidation: string;
  dateExpiration: string;
  pdfPath?: string | null;
  createdAt: string;
}

export interface Employee {
  id: number;
  matricule: string;
  nom: string;
  prenom: string;
  deleted: boolean;
  createdAt: string;
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
  dateValidation: string;
  dateExpiration: string;
}

export interface UpdateEmployeeRequest extends Omit<CreateEmployeeRequest, 'matricule'> {
  nom?: string;
  prenom?: string;
}
