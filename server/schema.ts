import { pgTable, serial, text, integer, timestamp, date, index, uniqueIndex, jsonb, boolean, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Users table
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  emailIdx: uniqueIndex("users_email_idx").on(table.email),
}));

// Divisions table
export const divisions = pgTable("divisions", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  nameIdx: uniqueIndex("divisions_name_idx").on(table.name),
}));

// Services table
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  divisionIdx: index("services_division_idx").on(table.divisionId),
  uniqueNamePerDivision: uniqueIndex("services_name_division_idx").on(table.name, table.divisionId),
}));

// Equipes table
export const equipes = pgTable("equipes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  serviceId: integer("service_id").notNull().references(() => services.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  serviceIdx: index("equipes_service_idx").on(table.serviceId),
  uniqueNamePerService: uniqueIndex("equipes_name_service_idx").on(table.name, table.serviceId),
}));

// Employees table — identity only, V4
export const employees = pgTable("employees", {
  id: serial("id").primaryKey(),
  matricule: text("matricule").notNull().unique(),
  nom: text("nom").notNull(),
  prenom: text("prenom").notNull(),
  currentVersionId: integer("current_version_id"),
  deleted: boolean("deleted").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  matriculeIdx: uniqueIndex("employees_matricule_idx").on(table.matricule),
}));

// Employee versions — source of truth for all employee data
export const employeeVersions = pgTable("employee_versions", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  stCodes: text("st_codes").array().notNull().default(sql`'{}'`),
  htCodes: text("ht_codes").array().notNull().default(sql`'{}'`),
  nDeTitre: text("n_de_titre").notNull(),
  fonction: text("fonction").notNull(),
  divisionId: integer("division_id").notNull().references(() => divisions.id),
  serviceId: integer("service_id").notNull().references(() => services.id),
  equipeId: integer("equipe_id").references(() => equipes.id),
  dateValidation: date("date_validation").notNull(),
  dateExpiration: date("date_expiration").notNull(),
  pdfPath: text("pdf_path"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  createdBy: integer("created_by").references(() => users.id),
  auditLogId: integer("audit_log_id"),
}, (table) => ({
  employeeIdx: index("idx_emp_versions_emp").on(table.employeeId),
  expirationIdx: index("idx_expiration").on(table.dateExpiration),
  uniqueVersion: uniqueIndex("employee_versions_employee_version_idx").on(table.employeeId, table.versionNumber),
}));

// Pending renewals — snapshot-based
export const pendingRenewals = pgTable("pending_renewals", {
  id: serial("id").primaryKey(),
  employeeId: integer("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  employeeIdx: index("pending_renewals_employee_id_idx").on(table.employeeId),
}));

// Audit logs
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  action: text("action").notNull(),
  entityId: integer("entity_id").notNull(),
  userId: integer("user_id").references(() => users.id),
  snapshotOld: jsonb("snapshot_old"),
  snapshotNew: jsonb("snapshot_new"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (table) => ({
  entityIdx: index("audit_logs_entity_idx").on(table.entityId),
  actionIdx: index("audit_logs_action_idx").on(table.action),
  createdAtIdx: index("audit_logs_created_at_idx").on(table.createdAt),
}));
