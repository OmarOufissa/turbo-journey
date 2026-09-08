import { sqliteTable, integer, text, index, uniqueIndex, check } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Users table
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(table.email),
}));

// Divisions table
export const divisions = sqliteTable("divisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  nameIdx: uniqueIndex("divisions_name_idx").on(table.name),
}));

// Services table
export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  divisionIdx: index("services_division_idx").on(table.divisionId),
  uniqueNamePerDivision: uniqueIndex("services_name_division_idx").on(table.name, table.divisionId),
}));

// Equipes table
export const equipes = sqliteTable("equipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  serviceId: integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  serviceIdx: index("equipes_service_idx").on(table.serviceId),
  uniqueNamePerService: uniqueIndex("equipes_name_service_idx").on(table.name, table.serviceId),
}));

// Employees table
// CORRECTION 3: currentVersionId points to the active version
// CORRECTION 10: status field for UI filtering (ACTIVE, EXPIRED, PENDING_RENEWAL)
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matricule: text("matricule").notNull().unique(),
  prenom: text("prenom").notNull(),
  nom: text("nom").notNull(),
  fonction: text("fonction").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id),
  // Nullable: some employees (e.g. Chef de Division) are attached directly to
  // a division or service, without a service/equipe below them.
  serviceId: integer("service_id").references(() => services.id),
  equipeId: integer("equipe_id").references(() => equipes.id),
  // CORRECTION 3: Pointer to active version (source of truth)
  currentVersionId: integer("current_version_id"),
  // CORRECTION 10: Employee status for filtering and display
  status: text("status").notNull().default("ACTIVE"), // ACTIVE, EXPIRED, PENDING_RENEWAL
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  matriculeIdx: uniqueIndex("employees_matricule_idx").on(table.matricule),
  divisionIdx: index("employees_division_idx").on(table.divisionId),
  serviceIdx: index("employees_service_idx").on(table.serviceId),
  // CORRECTION 9: Performance indexes
  statusIdx: index("employees_status_idx").on(table.status),
  deletedIdx: index("employees_deleted_idx").on(table.deleted),
}));

// Ouvrages (electrical installations) table
// Follows the same Division -> Service -> Equipe hierarchy as employees
export const ouvrages = sqliteTable("ouvrages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  type: text("type").notNull(),
  // Tension domain: "BT", "HTA" or "HTB"
  tensionDomain: text("tension_domain").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id, { onDelete: "cascade" }),
  serviceId: integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  equipeId: integer("equipe_id").references(() => equipes.id, { onDelete: "set null" }),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  divisionIdx: index("ouvrages_division_idx").on(table.divisionId),
  serviceIdx: index("ouvrages_service_idx").on(table.serviceId),
  tensionDomainIdx: index("ouvrages_tension_domain_idx").on(table.tensionDomain),
  nameIdx: index("ouvrages_name_idx").on(table.name),
}));

// Habilitations table
// CORRECTION 2: Replace 'type' with ST_codes and HT_codes arrays
// This allows an employee to have both ST and HT codes at the same time
export const habilitations = sqliteTable("habilitations", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // CORRECTION 2: Separate arrays for ST and HT codes (allows both to coexist)
  stCodes: text("st_codes").notNull().default("[]"), // JSON array of ST codes
  htCodes: text("ht_codes").notNull().default("[]"), // JSON array of HT codes
  // Titre d'habilitation number
  numero: text("numero"),
  dateValidation: text("date_validation").notNull(),
  dateExpiration: text("date_expiration").notNull(),
  // PDF reference
  pdfPath: text("pdf_path"),
  pdfUploadedAt: integer("pdf_uploaded_at", { mode: "timestamp" }),
  // Soft delete support (for undo logic)
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  employeeIdx: index("habilitations_employee_idx").on(table.employeeId),
  // CORRECTION 9: Performance indexes for filtering and sorting
  expirationIdx: index("habilitations_expiration_idx").on(table.dateExpiration),
  deletedIdx: index("habilitations_deleted_idx").on(table.deleted),
  createdAtIdx: index("habilitations_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// PHASE 1: AUDIT FOUNDATION TABLES
// ============================================================================

// Enhanced Audit logs table - CRITICAL FOR PRODUCTION SAFETY
// Every data-changing action MUST be logged with full snapshots
// This ensures complete traceability and revert capability
export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // User who performed the action (will be hardcoded to 1 for single-user, upgradable later)
  userId: integer("user_id").references(() => users.id),
  // Action type: CREATE_EMPLOYEE, UPDATE_EMPLOYEE, DELETE_EMPLOYEE, etc.
  // Revert actions: REVERT_EMPLOYEE, REVERT_HABILITATION
  action: text("action").notNull(),
  // Entity type: 'employee' or 'habilitation'
  entityType: text("entity_type").notNull(),
  // ID of the entity being modified (employee_id or habilitation_id)
  entityId: integer("entity_id"),
  // Matricule for quick lookup without JOIN (improve query performance)
  matricule: text("matricule"),
  // FULL snapshot of old data (before mutation)
  snapshotOld: text("snapshot_old", { mode: "json" }),
  // FULL snapshot of new data (after mutation)
  snapshotNew: text("snapshot_new", { mode: "json" }),
  // If this is a revert action, link to the original audit entry
  revertedFromAuditLogId: integer("reverted_from_audit_log_id").references((): any => auditLogs.id),
  // Timestamp of action (immutable, used for append-only guarantee)
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  // Indexes for common queries
  entityIdx: index("audit_logs_entity_idx").on(table.entityType, table.entityId),
  userIdx: index("audit_logs_user_idx").on(table.userId),
  actionIdx: index("audit_logs_action_idx").on(table.action),
  matriculeIdx: index("audit_logs_matricule_idx").on(table.matricule),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
  // CORRECTION 9: Performance index for employee audit history queries
  entityIdCreatedAtIdx: index("audit_logs_entity_id_created_at_idx").on(table.entityId, table.createdAt),
  // Enforce append-only: every log has unique (id, timestamp)
  uniqueAppendOnly: uniqueIndex("audit_logs_id_created_at_idx").on(table.id, table.createdAt),
  // Constraints
  actionNotNull: check("action", sql`action IS NOT NULL`),
}));

// ============================================================================
// PHASE 2: EMPLOYEE HISTORY & VERSIONING
// ============================================================================

// Employee versions - track all historical states of an employee
// CORRECTION 3: Source of truth for employee data (employees table points to current version)
// Used for viewing "what was this employee's info on [date]?"
export const employeeVersions = sqliteTable("employee_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Reference to the employee
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // Version number (auto-increment per employee)
  versionNumber: integer("version_number").notNull(),
  // Full snapshot of employee data at this version (source of truth)
  snapshotData: text("snapshot_data", { mode: "json" }).notNull(),
  // Link to audit log entry that created this version
  auditLogId: integer("audit_log_id").references(() => auditLogs.id),
  // When this version was created
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  employeeIdx: index("employee_versions_employee_id_idx").on(table.employeeId),
  versionIdx: uniqueIndex("employee_versions_employee_version_idx").on(table.employeeId, table.versionNumber),
  auditLogIdx: index("employee_versions_audit_log_id_idx").on(table.auditLogId),
  // CORRECTION 9: Performance indexes for version history queries
  employeeCreatedIdx: index("employee_versions_employee_id_created_at_idx").on(table.employeeId, table.createdAt),
}));

// ============================================================================
// PHASE 2: PENDING RENEWALS (CORRECTION 4)
// ============================================================================

// Pending renewals - renewal requests waiting for manual activation
// CORRECTION 1: Manual activation (admin clicks "Activate Renewal")
// CORRECTION 4: Full snapshot identical to a version for consistency
export const pendingRenewals = sqliteTable("pending_renewals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Employee being renewed
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // Full snapshot of the renewal data (identical structure to employee_versions)
  snapshotData: text("snapshot_data", { mode: "json" }).notNull(),
  // Date when this renewal will be/was activated
  activationDate: integer("activation_date", { mode: "timestamp" }).notNull(),
  // Status: 'pending', 'activated', 'cancelled'
  status: text("status").notNull().default("pending"),
  // Link to audit log entry that created this renewal
  createdByAuditLogId: integer("created_by_audit_log_id").references(() => auditLogs.id),
  // Link to audit log entry that activated this renewal (if activated)
  activatedByAuditLogId: integer("activated_by_audit_log_id").references(() => auditLogs.id),
  // When renewal was created
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  // When renewal was activated
  activatedAt: integer("activated_at", { mode: "timestamp" }),
}, (table) => ({
  employeeIdx: index("pending_renewals_employee_id_idx").on(table.employeeId),
  // CORRECTION 9: Performance indexes
  statusIdx: index("pending_renewals_status_idx").on(table.status),
  activationDateIdx: index("pending_renewals_activation_date_idx").on(table.activationDate),
  createdAtIdx: index("pending_renewals_created_at_idx").on(table.createdAt),
}));

// Habilitation archive - preserve old habilitations on renewal
// Prevents data loss when renewing: old record stays, new record created
export const habilitationArchive = sqliteTable("habilitation_archive", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Reference to the original habilitation (now archived)
  habilitationId: integer("habilitation_id").notNull(),
  // Employee who had this habilitation
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // Full snapshot of the archived habilitation
  snapshotData: text("snapshot_data", { mode: "json" }).notNull(),
  // If renewed, link to the new habilitation record
  renewedToHabilitationId: integer("renewed_to_habilitation_id"),
  // Reason for archiving: 'renewal', 'manual_edit', 'deletion'
  reason: text("reason"),
  // When archived
  archivedAt: integer("archived_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  employeeIdx: index("habilitation_archive_employee_id_idx").on(table.employeeId),
  habIdx: index("habilitation_archive_habilitation_id_idx").on(table.habilitationId),
  renewedIdx: index("habilitation_archive_renewed_to_idx").on(table.renewedToHabilitationId),
}));

// ============================================================================
// PHASE 3: ALERTS & NOTIFICATIONS
// ============================================================================

// Email log - track all sent notifications
// Prevents duplicate emails and provides audit trail for notifications
export const emailLog = sqliteTable("email_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Employee receiving the email
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  // Habilitation being notified about
  habilitationId: integer("habilitation_id"),
  // Type of email: 'expiration_30d', 'expiration_7d', 'expiration_1d', 'weekly_summary'
  emailType: text("email_type").notNull(),
  // Recipient email address (snapshot of employee email at send time)
  recipientEmail: text("recipient_email"),
  // Full email content sent
  emailContent: text("email_content", { mode: "json" }),
  // Send status: 'pending', 'sent', 'failed'
  status: text("status").notNull(),
  // Error message if status='failed'
  errorMessage: text("error_message"),
  // When email was sent (or attempted)
  sentAt: integer("sent_at", { mode: "timestamp" }),
  // When this log entry was created
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  employeeIdx: index("email_log_employee_id_idx").on(table.employeeId),
  habIdx: index("email_log_habilitation_id_idx").on(table.habilitationId),
  emailTypeIdx: index("email_log_email_type_idx").on(table.emailType),
  statusIdx: index("email_log_status_idx").on(table.status),
  createdAtIdx: index("email_log_created_at_idx").on(table.createdAt),
}));

// ============================================================================
// EXISTING TABLES (NO CHANGES)
// ============================================================================

// Employee notes table
export const employeeNotes = sqliteTable("employee_notes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => users.id),
  note: text("note").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  employeeIdx: index("employee_notes_employee_idx").on(table.employeeId),
}));

// Saved filters table
export const savedFilters = sqliteTable("saved_filters", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  filters: text("filters").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

// Notification templates table
export const notificationTemplates = sqliteTable("notification_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
}, (table) => ({
  nameIdx: uniqueIndex("notification_templates_name_idx").on(table.name),
}));
