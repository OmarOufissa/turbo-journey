/**
 * ERROR RECOVERY & CONSTRAINT HANDLING
 * 
 * Utilities for handling data integrity constraints and graceful error recovery
 * - Database constraint violation detection
 * - Transactional rollback helpers
 * - Conflict resolution
 * - Error categorization
 */

import { db } from "../db-pg";
import * as schema from "../schema";
import { eq, and } from "drizzle-orm";

// ============================================================================
// ERROR TYPES & CATEGORIZATION
// ============================================================================

export enum ErrorCategory {
  VALIDATION = "VALIDATION",
  CONSTRAINT = "CONSTRAINT",
  NOT_FOUND = "NOT_FOUND",
  CONFLICT = "CONFLICT",
  PERMISSION = "PERMISSION",
  INTERNAL = "INTERNAL",
  UNKNOWN = "UNKNOWN",
}

export interface DataIntegrityError {
  category: ErrorCategory;
  message: string;
  code?: string;
  details?: Record<string, any>;
  recoverable: boolean;
  suggestion?: string;
}

// ============================================================================
// ERROR DETECTION
// ============================================================================

/**
 * Categorize database errors for better error handling
 */
export function categorizeError(error: any): DataIntegrityError {
  const errorStr = String(error);

  // Unique constraint violation
  if (errorStr.includes("duplicate") || errorStr.includes("UNIQUE")) {
    return {
      category: ErrorCategory.CONSTRAINT,
      message: "Unique constraint violated",
      code: "DUPLICATE_VALUE",
      recoverable: false,
      suggestion: "Check for duplicate entries (e.g., matricule already exists)",
      details: { type: "unique_violation" },
    };
  }

  // Foreign key constraint violation
  if (errorStr.includes("foreign key") || errorStr.includes("FOREIGN KEY")) {
    return {
      category: ErrorCategory.CONSTRAINT,
      message: "Foreign key constraint violated",
      code: "FOREIGN_KEY_VIOLATION",
      recoverable: false,
      suggestion: "Referenced record doesn't exist or was deleted",
      details: { type: "foreign_key_violation" },
    };
  }

  // Check constraint violation
  if (errorStr.includes("CHECK") || errorStr.includes("check constraint")) {
    return {
      category: ErrorCategory.CONSTRAINT,
      message: "Data constraint violated",
      code: "CHECK_CONSTRAINT",
      recoverable: false,
      suggestion: "Review field values against constraints",
      details: { type: "check_constraint" },
    };
  }

  // Not null constraint
  if (errorStr.includes("NOT NULL") || errorStr.includes("null")) {
    return {
      category: ErrorCategory.CONSTRAINT,
      message: "Required field is missing",
      code: "NOT_NULL_CONSTRAINT",
      recoverable: false,
      suggestion: "All required fields must have values",
      details: { type: "not_null_violation" },
    };
  }

  // Record not found (for safety operations)
  if (errorStr.includes("no rows") || errorStr.includes("not found")) {
    return {
      category: ErrorCategory.NOT_FOUND,
      message: "Record not found",
      code: "NOT_FOUND",
      recoverable: true,
      details: { type: "not_found" },
    };
  }

  // Default to unknown
  return {
    category: ErrorCategory.UNKNOWN,
    message: error.message || "Unknown error occurred",
    recoverable: false,
    details: { originalError: String(error) },
  };
}

// ============================================================================
// CONSTRAINT CHECKS
// ============================================================================

/**
 * Check if matricule is unique
 */
export async function isMatriculeUnique(
  matricule: string,
  excludeEmployeeId?: number
): Promise<{ unique: boolean; existingId?: number }> {
  try {
    const query = db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        excludeEmployeeId
          ? and(
              eq(schema.employees.matricule, matricule),
              eq(schema.employees.deleted, false)
            )
          : eq(schema.employees.matricule, matricule)
      )
      .limit(1);

    const result = await query;

    if (result.length > 0) {
      return { unique: false, existingId: result[0].id };
    }

    return { unique: true };
  } catch (err) {
    console.error("Error checking matricule uniqueness:", err);
    throw err;
  }
}

/**
 * Check if division exists
 */
export async function divisionExists(divisionId: number): Promise<boolean> {
  try {
    const result = await db
      .select({ id: schema.divisions.id })
      .from(schema.divisions)
      .where(eq(schema.divisions.id, divisionId))
      .limit(1);

    return result.length > 0;
  } catch (err) {
    console.error("Error checking division existence:", err);
    throw err;
  }
}

/**
 * Check if service exists and belongs to division
 */
export async function serviceExists(
  serviceId: number,
  divisionId?: number
): Promise<boolean> {
  try {
    const query = db
      .select({ id: schema.services.id })
      .from(schema.services);

    if (divisionId) {
      query.where(
        and(
          eq(schema.services.id, serviceId),
          eq(schema.services.division_id, divisionId)
        )
      );
    } else {
      query.where(eq(schema.services.id, serviceId));
    }

    const result = await query.limit(1);

    return result.length > 0;
  } catch (err) {
    console.error("Error checking service existence:", err);
    throw err;
  }
}

/**
 * Check if equipe exists and belongs to service
 */
export async function equipeExists(
  equipeId: number,
  serviceId?: number
): Promise<boolean> {
  try {
    const query = db
      .select({ id: schema.equipes.id })
      .from(schema.equipes);

    if (serviceId) {
      query.where(
        and(
          eq(schema.equipes.id, equipeId),
          eq(schema.equipes.service_id, serviceId)
        )
      );
    } else {
      query.where(eq(schema.equipes.id, equipeId));
    }

    const result = await query.limit(1);

    return result.length > 0;
  } catch (err) {
    console.error("Error checking equipe existence:", err);
    throw err;
  }
}

/**
 * Check if employee exists and is not deleted
 */
export async function employeeExists(employeeId: number): Promise<boolean> {
  try {
    const result = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.deleted, false)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (err) {
    console.error("Error checking employee existence:", err);
    throw err;
  }
}

/**
 * Validate organization structure hierarchy
 * Ensure service belongs to division and equipe belongs to service
 */
export async function validateOrgHierarchy(
  divisionId: number,
  serviceId: number,
  equipeId: number
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  try {
    // Check division exists
    if (!(await divisionExists(divisionId))) {
      errors.push(`Division ${divisionId} does not exist`);
      return { valid: false, errors };
    }

    // Check service exists and belongs to division
    if (!(await serviceExists(serviceId, divisionId))) {
      errors.push(`Service ${serviceId} does not belong to Division ${divisionId}`);
      return { valid: false, errors };
    }

    // Check equipe exists and belongs to service
    if (!(await equipeExists(equipeId, serviceId))) {
      errors.push(`Équipe ${equipeId} does not belong to Service ${serviceId}`);
      return { valid: false, errors };
    }

    return { valid: true, errors: [] };
  } catch (err) {
    console.error("Error validating org hierarchy:", err);
    return { valid: false, errors: [String(err)] };
  }
}

// ============================================================================
// RECOVERY HELPERS
// ============================================================================

/**
 * Check if data can be recovered from trash
 */
export async function canRestoreFromTrash(employeeId: number): Promise<boolean> {
  try {
    const result = await db
      .select({ id: schema.employees.id })
      .from(schema.employees)
      .where(
        and(
          eq(schema.employees.id, employeeId),
          eq(schema.employees.deleted, true)
        )
      )
      .limit(1);

    return result.length > 0;
  } catch (err) {
    console.error("Error checking restore eligibility:", err);
    return false;
  }
}

/**
 * Get latest version before deletion for recovery
 */
export async function getLatestVersionBeforeDeletion(
  employeeId: number
): Promise<any | null> {
  try {
    const result = await db
      .select()
      .from(schema.employeeVersions)
      .where(eq(schema.employeeVersions.employee_id, employeeId))
      .orderBy(schema.employeeVersions.version)
      .limit(1);

    return result[0] || null;
  } catch (err) {
    console.error("Error getting version before deletion:", err);
    return null;
  }
}

// ============================================================================
// CONFLICT RESOLUTION
// ============================================================================

/**
 * Handle duplicate matricule conflict
 */
export function resolveDuplicateMatriculeConflict(
  existingId: number,
  newMatricule: string
): DataIntegrityError {
  return {
    category: ErrorCategory.CONFLICT,
    message: `Matricule '${newMatricule}' already exists`,
    code: "DUPLICATE_MATRICULE",
    recoverable: false,
    suggestion: `Use a different matricule. Employee ${existingId} already has this matricule.`,
    details: { existingEmployeeId: existingId, attemptedMatricule: newMatricule },
  };
}

/**
 * Handle missing organization reference conflict
 */
export function resolveMissingOrgReferenceConflict(
  refType: "division" | "service" | "equipe",
  refId: number
): DataIntegrityError {
  return {
    category: ErrorCategory.CONFLICT,
    message: `${refType} reference not found`,
    code: "MISSING_ORG_REFERENCE",
    recoverable: false,
    suggestion: `The selected ${refType} (ID: ${refId}) does not exist. Choose a valid ${refType}.`,
    details: { referenceType: refType, referenceId: refId },
  };
}

// ============================================================================
// ERROR FORMATTING FOR API RESPONSES
// ============================================================================

/**
 * Format error for API response
 */
export function formatErrorResponse(error: DataIntegrityError, statusCode: number = 400) {
  return {
    statusCode,
    error: {
      category: error.category,
      code: error.code,
      message: error.message,
      suggestion: error.suggestion,
      recoverable: error.recoverable,
      ...(error.details && { details: error.details }),
    },
  };
}

/**
 * Format validation errors for API response
 */
export function formatValidationErrors(
  errors: Record<string, string[]>
): Record<string, any> {
  return {
    statusCode: 400,
    error: {
      category: ErrorCategory.VALIDATION,
      code: "VALIDATION_FAILED",
      message: "Validation failed",
      details: {
        fields: errors,
      },
    },
  };
}

// ============================================================================
// LOGGING & MONITORING
// ============================================================================

/**
 * Log constraint violation for monitoring
 */
export function logConstraintViolation(
  error: DataIntegrityError,
  context: Record<string, any>
): void {
  console.error("[CONSTRAINT VIOLATION]", {
    timestamp: new Date().toISOString(),
    category: error.category,
    code: error.code,
    message: error.message,
    context,
  });
}

/**
 * Log error recovery attempt
 */
export function logRecoveryAttempt(
  error: DataIntegrityError,
  recoveryMethod: string,
  success: boolean
): void {
  console.log("[ERROR RECOVERY]", {
    timestamp: new Date().toISOString(),
    code: error.code,
    recoveryMethod,
    success,
  });
}

export default {
  ErrorCategory,
  categorizeError,
  isMatriculeUnique,
  divisionExists,
  serviceExists,
  equipeExists,
  employeeExists,
  habilitationExists,
  validateOrgHierarchy,
  canRestoreFromTrash,
  getLatestVersionBeforeDeletion,
  resolveDuplicateMatriculeConflict,
  resolveMissingOrgReferenceConflict,
  formatErrorResponse,
  formatValidationErrors,
  logConstraintViolation,
  logRecoveryAttempt,
};
