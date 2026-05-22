import { Request, Response, NextFunction } from "express";

interface ValidationError {
  field: string;
  message: string;
}

function validateEmployeeFields(data: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];

  if (data.matricule !== undefined) {
    if (!data.matricule || typeof data.matricule !== "string") {
      errors.push({ field: "matricule", message: "Matricule is required and must be a string" });
    } else if (!/^\d{5}$/.test(data.matricule)) {
      errors.push({ field: "matricule", message: "Matricule must be exactly 5 digits" });
    }
  }

  if (data.prenom !== undefined) {
    if (!data.prenom || typeof data.prenom !== "string" || data.prenom.trim().length === 0) {
      errors.push({ field: "prenom", message: "Prenom is required and cannot be empty" });
    }
  }

  if (data.nom !== undefined) {
    if (!data.nom || typeof data.nom !== "string" || data.nom.trim().length === 0) {
      errors.push({ field: "nom", message: "Nom is required and cannot be empty" });
    }
  }

  if (data.division_id !== undefined) {
    const divId = parseInt(data.division_id);
    if (isNaN(divId) || divId <= 0) {
      errors.push({ field: "division_id", message: "Division ID must be a positive integer" });
    }
  }

  if (data.service_id !== undefined) {
    const svcId = parseInt(data.service_id);
    if (isNaN(svcId) || svcId <= 0) {
      errors.push({ field: "service_id", message: "Service ID must be a positive integer" });
    }
  }

  if (data.equipe_id !== undefined) {
    const eqId = parseInt(data.equipe_id);
    if (isNaN(eqId) || eqId <= 0) {
      errors.push({ field: "equipe_id", message: "Equipe ID must be a positive integer" });
    }
  }

  return errors;
}

export const validateEmployeeRequestData = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" && req.path === "/api/employees") {
    const errors = validateEmployeeFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Validation failed", errors });
    }
  }

  if (req.method === "PUT" && req.path.match(/^\/api\/employees\/\d+$/)) {
    const errors = validateEmployeeFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ message: "Validation failed", errors });
    }
  }

  next();
};

export const validationMiddleware = [validateEmployeeRequestData];

export default { validateEmployeeRequestData, validationMiddleware };
