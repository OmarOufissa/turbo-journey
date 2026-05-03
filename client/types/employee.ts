import { Habilitation } from "./habilitation";

export interface Employee {
  id: number;
  matricule: string;
  prenom: string;
  nom: string;
  division: string;
  service: string;
  equipe: string;
  habilitations?: Habilitation[];
}

export interface EmployeeFormData {
  matricule: string;
  prenom: string;
  nom: string;
  division_id: string;
  service_id: string;
  equipe_id: string;
}

export interface CreateEmployeeRequest {
  matricule: string;
  prenom: string;
  nom: string;
  division_id: number;
  service_id: number;
  equipe_id: number;
  habilitations?: Array<{
    type: "HT" | "ST";
    codes: string[];
    numero: string;
    dateValidation: string;
  }>;
}
