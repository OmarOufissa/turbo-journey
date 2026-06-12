import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(table.email),
}));

export const divisions = sqliteTable("divisions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull().unique(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  nameIdx: uniqueIndex("divisions_name_idx").on(table.name),
}));

export const services = sqliteTable("services", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  divisionIdx: index("services_division_idx").on(table.divisionId),
  uniqueNamePerDivision: uniqueIndex("services_name_division_idx").on(table.name, table.divisionId),
}));

export const equipes = sqliteTable("equipes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  serviceId: integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  serviceIdx: index("equipes_service_idx").on(table.serviceId),
  uniqueNamePerService: uniqueIndex("equipes_name_service_idx").on(table.name, table.serviceId),
}));

// Identity only — no org fields
export const employees = sqliteTable("employees", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  matricule: text("matricule").notNull().unique(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  currentVersionId: integer("current_version_id").references((): any => employeeVersions.id, { onDelete: "set null" }),
  deleted: integer("deleted", { mode: "boolean" }).notNull().default(false),
  deletedAt: text("deleted_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  matriculeIdx: uniqueIndex("employees_matricule_idx").on(table.matricule),
  currentVersionIdx: index("idx_employees_current_version").on(table.currentVersionId),
  deletedIdx: index("idx_employees_deleted").on(table.deleted),
}));

export type HabRowData = { domaine: string; ouvrage: string; indication: string };
// Keys match the 6 official table rows: H0V/B0V, H1V/B1V, H2V/B2V, HC/BC, BR, SF6
export type HabRows = Partial<Record<'H0V_B0V' | 'H1V_B1V' | 'H2V_B2V' | 'HC_BC' | 'BR' | 'SF6', HabRowData>>;

// Source of truth for all employee data (versioned)
export const employeeVersions = sqliteTable("employee_versions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  stCodes: text("st_codes", { mode: "json" }).$type<string[]>().notNull().default([]),
  htCodes: text("ht_codes", { mode: "json" }).$type<string[]>().notNull().default([]),
  nDeTitre: text("n_de_titre").notNull(),
  fonction: text("fonction").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id),
  serviceId: integer("service_id").references(() => services.id),
  equipeId: integer("equipe_id").references(() => equipes.id),
  dateValidation: text("date_validation").notNull(),
  dateExpiration: text("date_expiration").notNull(),
  habRows: text("hab_rows", { mode: "json" }).$type<HabRows | null>(),
  pdfPath: text("pdf_path"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  createdBy: integer("created_by").references(() => users.id),
  auditLogId: integer("audit_log_id"),
}, (table) => ({
  employeeIdx: index("idx_emp_versions_emp").on(table.employeeId),
  expirationIdx: index("idx_expiration").on(table.dateExpiration),
  divisionIdx: index("idx_emp_versions_division").on(table.divisionId),
  serviceIdx: index("idx_emp_versions_service").on(table.serviceId),
  uniqueVersion: uniqueIndex("employee_versions_employee_version_idx").on(table.employeeId, table.versionNumber),
}));

export const pendingRenewals = sqliteTable("pending_renewals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  snapshot: text("snapshot", { mode: "json" }).notNull(),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  employeeIdx: index("pending_renewals_employee_id_idx").on(table.employeeId),
}));

export const notificationLogs = sqliteTable("notification_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  threshold: text("threshold").notNull(), // "3m" | "6m" | "9m" | "expired"
  sentAt: text("sent_at").notNull().default(sql`(datetime('now'))`),
  versionId: integer("version_id").references(() => employeeVersions.id),
}, (table) => ({
  empThresholdIdx: uniqueIndex("notif_logs_emp_threshold_idx").on(table.employeeId, table.threshold),
}));

export const auditLogs = sqliteTable("audit_logs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  entityId: integer("entity_id").notNull(),
  userId: integer("user_id").references(() => users.id),
  snapshotOld: text("snapshot_old", { mode: "json" }),
  snapshotNew: text("snapshot_new", { mode: "json" }),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
}, (table) => ({
  entityIdx: index("audit_logs_entity_idx").on(table.entityId),
  actionIdx: index("audit_logs_action_idx").on(table.action),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
}));
