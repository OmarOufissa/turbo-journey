/**
 * PHASE 5: DATA INTEGRITY - VALIDATION SCHEMAS
 * 
 * Comprehensive Zod schemas for all data entities
 * - Employee validation
 * - Habilitation validation
 * - Organization structure validation
 * - Cross-field constraints and transformations
 * - Error recovery helpers
 */

import { z } from "zod";

// ============================================================================
// COMMON VALIDATION PATTERNS
// ============================================================================

const MATRICULE_PATTERN = /^\d{5}$|^[A-Z0-9]{3,10}$/;
export const VALID_HABILITATION_CODES = ["H0V", "B0V", "H1V", "B1V", "H2V", "B2V", "HC", "BR", "BC", "SF6"];

export const VALID_FONCTIONS = [
  "Cadre Contrôle Commande RT",
  "Cadre Exploitation Réseau",
  "Cadre Lignes THT&HT",
  "Cadre Postes THT/HT",
  "Cadre TST Lignes THT&HT",
  "Cadre Technique",
  "Cadre Télécom",
  "Chef d'Equipe Electromécanicien",
  "Chef d'Equipe Isolation Thermique",
  "Chef d'Equipe Lignes THT&HT",
  "Chef d'Equipe Postes THT/HT",
  "Chef de Division",
  "Chef de Service",
  "Conducteur Engins Spéciaux",
  "Conducteur Mécanicien",
  "Conducteur Principal de Direction",
  "Conducteur Travaux Génie Civil",
  "Contremaître Lignes THT&HT",
  "Contremaître Postes THT/HT",
  "Contremaître TST Postes THT/HT",
  "Contrôleur Travaux Génie Civil",
  "Monteur de Lignes THT&HT",
  "Opérateur TST Lignes THT&HT",
  "Opérateur TST Postes THT/HT",
  "Ouvrier Professionnel Réseau",
  "Projeteur Lignes THT&HT",
  "Surveillant Travaux Génie Civil",
  "Technicien Contrôle Commande RT",
  "Technicien Exploitation Réseau",
  "Technicien Lignes THT&HT",
  "Technicien Principal Contrôle Commande RT",
  "Technicien Principal Exploitation Réseau",
  "Technicien Spécialisé Télécom",
] as const;

export type ValidFonction = (typeof VALID_FONCTIONS)[number];

/**
 * Custom error messages for better UX
 */
const CUSTOM_ERRORS = {
  matricule: "Matricule must be 5 digits or 3-10 alphanumeric characters",
  nomPrenom: "Nom and Prénom cannot be empty",
  dateFormat: "Date must be in DD/MM/YYYY, D/M/YYYY, or ISO format",
  dateExpiration: "Date expiration must be after date validation",
  habCodes: "Invalid habilitation codes",
  division: "Division must be a valid reference",
  service: "Service must be a valid reference",
  equipe: "Équipe must be a valid reference",
};

// ============================================================================
// DATE VALIDATION AND TRANSFORMATION
// ============================================================================

/**
 * Parse various date formats: DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, ISO
 */
function parseDateFlexible(dateStr: string): Date | null {
  if (!dateStr) return null;

  // Try ISO format first
  const isoMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!isNaN(date.getTime())) return date;
  }

  // Try DD/MM/YYYY or D/M/YYYY format
  const dmyMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmyMatch) {
    const [, day, month, year] = dmyMatch;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  return null;
}

/**
 * Custom Zod type for flexible date parsing
 */
export const flexibleDate = z.string()
  .min(1, "Date cannot be empty")
  .transform((val) => {
    const parsed = parseDateFlexible(val);
    if (!parsed) {
      throw new Error(CUSTOM_ERRORS.dateFormat);
    }
    return parsed;
  })
  .refine(
    (date) => !isNaN(date.getTime()),
    { message: "Invalid date" }
  );

/**
 * ISO date string (YYYY-MM-DD) - what we store in DB
 */
export const isoDateString = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, CUSTOM_ERRORS.dateFormat)
  .refine(
    (dateStr) => !isNaN(new Date(dateStr).getTime()),
    { message: "Invalid date" }
  );

// ============================================================================
// EMPLOYEE SCHEMAS
// ============================================================================

/**
 * Employee create request - accepts flexible date formats
 */
export const employeeCreateSchema = z.object({
  matricule: z.string()
    .min(1, "Matricule is required")
    .regex(MATRICULE_PATTERN, CUSTOM_ERRORS.matricule)
    .toUpperCase(),
  nom: z.string()
    .min(1, CUSTOM_ERRORS.nomPrenom)
    .max(100, "Nom must be less than 100 characters"),
  prenom: z.string()
    .min(1, CUSTOM_ERRORS.nomPrenom)
    .max(100, "Prénom must be less than 100 characters"),
  fonction: z.string()
    .min(1, "Fonction is required")
    .max(100, "Fonction must be less than 100 characters"),
  division_id: z.number()
    .positive(CUSTOM_ERRORS.division),
  service_id: z.number()
    .positive(CUSTOM_ERRORS.service),
  equipe_id: z.number()
    .positive(CUSTOM_ERRORS.equipe),
});

/**
 * Employee update request - same as create (for immutability, only certain fields can change)
 */
export const employeeUpdateSchema = z.object({
  fonction: z.string()
    .min(1, "Fonction is required")
    .max(100, "Fonction must be less than 100 characters")
    .optional(),
  division_id: z.number()
    .positive(CUSTOM_ERRORS.division)
    .optional(),
  service_id: z.number()
    .positive(CUSTOM_ERRORS.service)
    .optional(),
  equipe_id: z.number()
    .positive(CUSTOM_ERRORS.equipe)
    .optional(),
}).strict();

/**
 * Employee database schema - strict validation
 */
export const employeeDatabaseSchema = z.object({
  id: z.number(),
  matricule: z.string(),
  nom: z.string(),
  prenom: z.string(),
  fonction: z.string(),
  division_id: z.number(),
  service_id: z.number(),
  equipe_id: z.number(),
  version: z.number().positive(),
  created_at: z.date(),
  updated_at: z.date(),
  deleted: z.boolean().default(false),
});


// ============================================================================
// ORGANIZATION STRUCTURE SCHEMAS
// ============================================================================

/**
 * Division schema
 */
export const divisionSchema = z.object({
  id: z.number().optional(),
  name: z.string()
    .min(1, "Division name is required")
    .max(100, "Division name too long"),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

/**
 * Service schema
 */
export const serviceSchema = z.object({
  id: z.number().optional(),
  name: z.string()
    .min(1, "Service name is required")
    .max(100, "Service name too long"),
  division_id: z.number().positive("Division ID must be positive"),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

/**
 * Équipe schema
 */
export const equipeSchema = z.object({
  id: z.number().optional(),
  name: z.string()
    .min(1, "Équipe name is required")
    .max(100, "Équipe name too long"),
  service_id: z.number().positive("Service ID must be positive"),
  created_at: z.date().optional(),
  updated_at: z.date().optional(),
});

// ============================================================================
// AUDIT LOG SCHEMAS
// ============================================================================

/**
 * Audit log schema
 */
export const auditLogSchema = z.object({
  id: z.number().optional(),
  user_id: z.number().nullable(),
  action: z.string()
    .min(1, "Action is required")
    .max(50, "Action too long"),
  entity_type: z.string()
    .max(50, "Entity type too long")
    .optional(),
  entity_id: z.number().optional(),
  snapshot_old: z.any().optional(),
  snapshot_new: z.any().optional(),
  metadata: z.any().optional(),
  created_at: z.date().optional(),
});

// ============================================================================
// TYPE EXPORTS FOR TYPESCRIPT
// ============================================================================

export type EmployeeCreate = z.infer<typeof employeeCreateSchema>;
export type EmployeeUpdate = z.infer<typeof employeeUpdateSchema>;
export type EmployeeDatabase = z.infer<typeof employeeDatabaseSchema>;

export type Division = z.infer<typeof divisionSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type Equipe = z.infer<typeof equipeSchema>;

export type AuditLog = z.infer<typeof auditLogSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Safe validation - returns result object with success/errors
 */
export function validateData<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: boolean; data?: T; errors?: Record<string, string[]> } {
  try {
    const result = schema.parse(data);
    return { success: true, data: result };
  } catch (err) {
    if (err instanceof z.ZodError) {
      const errors: Record<string, string[]> = {};
      for (const issue of err.issues) {
        const path = issue.path.join(".");
        if (!errors[path]) {
          errors[path] = [];
        }
        errors[path].push(issue.message);
      }
      return { success: false, errors };
    }
    return { success: false, errors: { _general: ["Validation failed"] } };
  }
}

/**
 * Check if employee is immutable (can't change certain fields after creation)
 */
export function getImmutableFields(): string[] {
  return ["matricule", "nom", "prenom"];
}

/**
 * Check if field is allowed to be updated
 */
export function isFieldMutable(fieldName: string): boolean {
  const immutableFields = getImmutableFields();
  return !immutableFields.includes(fieldName);
}

/**
 * Filter update data to only allow mutable fields
 */
export function filterMutableFields(data: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(data)) {
    if (isFieldMutable(key)) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Validate habilitation date constraint
 */
export function validateHabilitationDates(
  dateValidation: string,
  dateExpiration?: string | null
): { valid: boolean; error?: string } {
  const valDate = new Date(dateValidation);

  if (isNaN(valDate.getTime())) {
    return { valid: false, error: "Invalid validation date" };
  }

  if (dateExpiration) {
    const expDate = new Date(dateExpiration);

    if (isNaN(expDate.getTime())) {
      return { valid: false, error: "Invalid expiration date" };
    }

    if (expDate <= valDate) {
      return { valid: false, error: "Expiration date must be after validation date" };
    }
  }

  return { valid: true };
}

export default {
  employeeCreateSchema,
  employeeUpdateSchema,
  employeeDatabaseSchema,
  habilitationCreateSchema,
  habilitationUpdateSchema,
  habilitationDatabaseSchema,
  divisionSchema,
  serviceSchema,
  equipeSchema,
  auditLogSchema,
  batchUpdateHabilitationsSchema,
  batchDeleteHabilitationsSchema,
  validateData,
  getImmutableFields,
  isFieldMutable,
  filterMutableFields,
  validateHabilitationDates,
};
