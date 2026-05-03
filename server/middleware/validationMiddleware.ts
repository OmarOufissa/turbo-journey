/**
 * PHASE 1: DATA VALIDATION MIDDLEWARE
 * 
 * This middleware validates incoming requests at the request layer before
 * they reach route handlers. Prevents invalid data from reaching the database.
 * 
 * Validations:
 * 1. ST Blocking: Reject habilitations with type = 'ST' (legacy only)
 * 2. Required Fields: Validate employee and habilitation required fields
 * 3. Date Format: Ensure dates are in YYYY-MM-DD format
 * 4. Field Types: Validate field types and constraints
 */

import { Request, Response, NextFunction } from "express";

// ============================================================================
// VALIDATION RULES
// ============================================================================

const VALID_HABILITATION_CODES = ["H0V", "B0V", "H1V", "B1V", "H2V", "B2V", "HC", "BR", "BC", "SF6"];

interface ValidationError {
  field: string;
  message: string;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate employee data
 */
function validateEmployeeFields(data: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Matricule: 5 digits
  if (data.matricule !== undefined) {
    if (!data.matricule || typeof data.matricule !== "string") {
      errors.push({ field: "matricule", message: "Matricule is required and must be a string" });
    } else if (!/^\d{5}$/.test(data.matricule)) {
      errors.push({
        field: "matricule",
        message: "Matricule must be exactly 5 digits",
      });
    }
  }

  // Prenom: required, non-empty string
  if (data.prenom !== undefined) {
    if (!data.prenom || typeof data.prenom !== "string" || data.prenom.trim().length === 0) {
      errors.push({
        field: "prenom",
        message: "Prenom is required and cannot be empty",
      });
    }
  }

  // Nom: required, non-empty string
  if (data.nom !== undefined) {
    if (!data.nom || typeof data.nom !== "string" || data.nom.trim().length === 0) {
      errors.push({
        field: "nom",
        message: "Nom is required and cannot be empty",
      });
    }
  }

  // Division ID: required, positive integer
  if (data.division_id !== undefined) {
    const divId = parseInt(data.division_id);
    if (isNaN(divId) || divId <= 0) {
      errors.push({
        field: "division_id",
        message: "Division ID must be a positive integer",
      });
    }
  }

  // Service ID: required, positive integer
  if (data.service_id !== undefined) {
    const svcId = parseInt(data.service_id);
    if (isNaN(svcId) || svcId <= 0) {
      errors.push({
        field: "service_id",
        message: "Service ID must be a positive integer",
      });
    }
  }

  // Equipe ID: required, positive integer
  if (data.equipe_id !== undefined) {
    const eqId = parseInt(data.equipe_id);
    if (isNaN(eqId) || eqId <= 0) {
      errors.push({
        field: "equipe_id",
        message: "Equipe ID must be a positive integer",
      });
    }
  }

  return errors;
}

/**
 * Validate habilitation data
 */
function validateHabilitationFields(data: Record<string, any>): ValidationError[] {
  const errors: ValidationError[] = [];

  // Type: must be HT (no ST allowed)
  if (data.type !== undefined) {
    if (data.type === "ST") {
      errors.push({
        field: "type",
        message: "Seul le type HT est autorisé. ST est obsolète et non supporté en production.",
      });
    } else if (data.type !== "HT") {
      errors.push({
        field: "type",
        message: "Type must be 'HT'",
      });
    }
  }

  // Codes: required, non-empty array, valid codes only
  if (data.codes !== undefined) {
    if (!Array.isArray(data.codes)) {
      errors.push({
        field: "codes",
        message: "Codes must be an array",
      });
    } else if (data.codes.length === 0) {
      errors.push({
        field: "codes",
        message: "Codes array cannot be empty",
      });
    } else {
      const invalidCodes = data.codes.filter((code: string) => !VALID_HABILITATION_CODES.includes(code));
      if (invalidCodes.length > 0) {
        errors.push({
          field: "codes",
          message: `Invalid codes: ${invalidCodes.join(", ")}. Valid codes: ${VALID_HABILITATION_CODES.join(", ")}`,
        });
      }
    }
  }

  // Date validation: must be valid date in YYYY-MM-DD format
  if (data.date_validation !== undefined) {
    if (!data.date_validation || typeof data.date_validation !== "string") {
      errors.push({
        field: "date_validation",
        message: "Date validation is required and must be a string",
      });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date_validation)) {
      errors.push({
        field: "date_validation",
        message: "Date validation must be in YYYY-MM-DD format",
      });
    } else if (isNaN(new Date(data.date_validation).getTime())) {
      errors.push({
        field: "date_validation",
        message: "Date validation is not a valid date",
      });
    }
  }

  // Date expiration: optional, must be valid date in YYYY-MM-DD format if provided
  if (data.date_expiration !== undefined && data.date_expiration !== null) {
    if (typeof data.date_expiration !== "string") {
      errors.push({
        field: "date_expiration",
        message: "Date expiration must be a string",
      });
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date_expiration)) {
      errors.push({
        field: "date_expiration",
        message: "Date expiration must be in YYYY-MM-DD format",
      });
    } else if (isNaN(new Date(data.date_expiration).getTime())) {
      errors.push({
        field: "date_expiration",
        message: "Date expiration is not a valid date",
      });
    }
  }

  // Numero: optional, must be string if provided
  if (data.numero !== undefined && data.numero !== null) {
    if (typeof data.numero !== "string") {
      errors.push({
        field: "numero",
        message: "Numero must be a string",
      });
    }
  }

  return errors;
}

/**
 * Validate date format (YYYY-MM-DD)
 */
function isValidDateFormat(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const date = new Date(dateStr);
  return !isNaN(date.getTime());
}

// ============================================================================
// MIDDLEWARE FUNCTIONS
// ============================================================================

/**
 * Middleware: Block ST habilitations
 * Applies to POST/PUT requests to /api/habilitations*
 */
export const blockSTHabilitations = (req: Request, res: Response, next: NextFunction) => {
  // Only validate on POST/PUT to habilitation endpoints
  if ((req.method === "POST" || req.method === "PUT") && req.path.includes("/api/habilitations")) {
    const data = req.body;

    // Check if type is ST
    if (data.type === "ST") {
      return res.status(400).json({
        message: "Seul le type HT est autorisé. ST est obsolète et non supporté.",
        error: {
          field: "type",
          reason: "ST habilitations are not allowed in production",
        },
      });
    }
  }

  next();
};

/**
 * Middleware: Validate employee fields
 * Applies to POST /api/employees and PUT /api/employees/:id
 */
export const validateEmployeeRequestData = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" && req.path === "/api/employees") {
    const errors = validateEmployeeFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed: please check the following fields",
        errors,
      });
    }
  }

  if (req.method === "PUT" && req.path.match(/^\/api\/employees\/\d+$/)) {
    const errors = validateEmployeeFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed: please check the following fields",
        errors,
      });
    }
  }

  next();
};

/**
 * Middleware: Validate habilitation fields
 * Applies to POST /api/habilitations and PUT /api/habilitations/:habId
 */
export const validateHabilitationRequestData = (req: Request, res: Response, next: NextFunction) => {
  if (req.method === "POST" && req.path === "/api/habilitations") {
    const errors = validateHabilitationFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed: please check the following fields",
        errors,
      });
    }
  }

  if (req.method === "PUT" && req.path.match(/^\/api\/habilitations\/\d+$/)) {
    const errors = validateHabilitationFields(req.body);
    if (errors.length > 0) {
      return res.status(400).json({
        message: "Validation failed: please check the following fields",
        errors,
      });
    }
  }

  next();
};

/**
 * Combined validation middleware - register all validations
 */
export const validationMiddleware = [
  blockSTHabilitations,
  validateEmployeeRequestData,
  validateHabilitationRequestData,
];

/**
 * Export individual middlewares for flexible registration
 */
export default {
  blockSTHabilitations,
  validateEmployeeRequestData,
  validateHabilitationRequestData,
  validationMiddleware,
};
