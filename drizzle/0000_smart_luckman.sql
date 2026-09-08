CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` integer,
	`matricule` text,
	`snapshot_old` text,
	`snapshot_new` text,
	`reverted_from_audit_log_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverted_from_audit_log_id`) REFERENCES `audit_logs`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "action" CHECK(action IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX `audit_logs_entity_idx` ON `audit_logs` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_user_idx` ON `audit_logs` (`user_id`);--> statement-breakpoint
CREATE INDEX `audit_logs_action_idx` ON `audit_logs` (`action`);--> statement-breakpoint
CREATE INDEX `audit_logs_matricule_idx` ON `audit_logs` (`matricule`);--> statement-breakpoint
CREATE INDEX `audit_logs_created_at_idx` ON `audit_logs` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_logs_entity_id_created_at_idx` ON `audit_logs` (`entity_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `audit_logs_id_created_at_idx` ON `audit_logs` (`id`,`created_at`);--> statement-breakpoint
CREATE TABLE `divisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `divisions_name_unique` ON `divisions` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `divisions_name_idx` ON `divisions` (`name`);--> statement-breakpoint
CREATE TABLE `email_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`habilitation_id` integer,
	`email_type` text NOT NULL,
	`recipient_email` text,
	`email_content` text,
	`status` text NOT NULL,
	`error_message` text,
	`sent_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `email_log_employee_id_idx` ON `email_log` (`employee_id`);--> statement-breakpoint
CREATE INDEX `email_log_habilitation_id_idx` ON `email_log` (`habilitation_id`);--> statement-breakpoint
CREATE INDEX `email_log_email_type_idx` ON `email_log` (`email_type`);--> statement-breakpoint
CREATE INDEX `email_log_status_idx` ON `email_log` (`status`);--> statement-breakpoint
CREATE INDEX `email_log_created_at_idx` ON `email_log` (`created_at`);--> statement-breakpoint
CREATE TABLE `employee_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`user_id` integer,
	`note` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employee_notes_employee_idx` ON `employee_notes` (`employee_id`);--> statement-breakpoint
CREATE TABLE `employee_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`version_number` integer NOT NULL,
	`snapshot_data` text NOT NULL,
	`audit_log_id` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`audit_log_id`) REFERENCES `audit_logs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `employee_versions_employee_id_idx` ON `employee_versions` (`employee_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `employee_versions_employee_version_idx` ON `employee_versions` (`employee_id`,`version_number`);--> statement-breakpoint
CREATE INDEX `employee_versions_audit_log_id_idx` ON `employee_versions` (`audit_log_id`);--> statement-breakpoint
CREATE INDEX `employee_versions_employee_id_created_at_idx` ON `employee_versions` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`matricule` text NOT NULL,
	`prenom` text NOT NULL,
	`nom` text NOT NULL,
	`fonction` text NOT NULL,
	`division_id` integer NOT NULL,
	`service_id` integer,
	`equipe_id` integer,
	`current_version_id` integer,
	`status` text DEFAULT 'ACTIVE' NOT NULL,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipe_id`) REFERENCES `equipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `employees_matricule_unique` ON `employees` (`matricule`);--> statement-breakpoint
CREATE UNIQUE INDEX `employees_matricule_idx` ON `employees` (`matricule`);--> statement-breakpoint
CREATE INDEX `employees_division_idx` ON `employees` (`division_id`);--> statement-breakpoint
CREATE INDEX `employees_service_idx` ON `employees` (`service_id`);--> statement-breakpoint
CREATE INDEX `employees_status_idx` ON `employees` (`status`);--> statement-breakpoint
CREATE INDEX `employees_deleted_idx` ON `employees` (`deleted`);--> statement-breakpoint
CREATE TABLE `equipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`service_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `equipes_service_idx` ON `equipes` (`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipes_name_service_idx` ON `equipes` (`name`,`service_id`);--> statement-breakpoint
CREATE TABLE `habilitation_archive` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`habilitation_id` integer NOT NULL,
	`employee_id` integer NOT NULL,
	`snapshot_data` text NOT NULL,
	`renewed_to_habilitation_id` integer,
	`reason` text,
	`archived_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `habilitation_archive_employee_id_idx` ON `habilitation_archive` (`employee_id`);--> statement-breakpoint
CREATE INDEX `habilitation_archive_habilitation_id_idx` ON `habilitation_archive` (`habilitation_id`);--> statement-breakpoint
CREATE INDEX `habilitation_archive_renewed_to_idx` ON `habilitation_archive` (`renewed_to_habilitation_id`);--> statement-breakpoint
CREATE TABLE `habilitations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`st_codes` text DEFAULT '[]' NOT NULL,
	`ht_codes` text DEFAULT '[]' NOT NULL,
	`numero` text,
	`date_validation` text NOT NULL,
	`date_expiration` text NOT NULL,
	`pdf_path` text,
	`pdf_uploaded_at` integer,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `habilitations_employee_idx` ON `habilitations` (`employee_id`);--> statement-breakpoint
CREATE INDEX `habilitations_expiration_idx` ON `habilitations` (`date_expiration`);--> statement-breakpoint
CREATE INDEX `habilitations_deleted_idx` ON `habilitations` (`deleted`);--> statement-breakpoint
CREATE INDEX `habilitations_created_at_idx` ON `habilitations` (`created_at`);--> statement-breakpoint
CREATE TABLE `notification_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_name_unique` ON `notification_templates` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `notification_templates_name_idx` ON `notification_templates` (`name`);--> statement-breakpoint
CREATE TABLE `ouvrages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`tension_domain` text NOT NULL,
	`division_id` integer NOT NULL,
	`service_id` integer NOT NULL,
	`equipe_id` integer,
	`deleted` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`equipe_id`) REFERENCES `equipes`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `ouvrages_division_idx` ON `ouvrages` (`division_id`);--> statement-breakpoint
CREATE INDEX `ouvrages_service_idx` ON `ouvrages` (`service_id`);--> statement-breakpoint
CREATE INDEX `ouvrages_tension_domain_idx` ON `ouvrages` (`tension_domain`);--> statement-breakpoint
CREATE INDEX `ouvrages_name_idx` ON `ouvrages` (`name`);--> statement-breakpoint
CREATE TABLE `pending_renewals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`snapshot_data` text NOT NULL,
	`activation_date` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_by_audit_log_id` integer,
	`activated_by_audit_log_id` integer,
	`created_at` integer NOT NULL,
	`activated_at` integer,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_audit_log_id`) REFERENCES `audit_logs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`activated_by_audit_log_id`) REFERENCES `audit_logs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pending_renewals_employee_id_idx` ON `pending_renewals` (`employee_id`);--> statement-breakpoint
CREATE INDEX `pending_renewals_status_idx` ON `pending_renewals` (`status`);--> statement-breakpoint
CREATE INDEX `pending_renewals_activation_date_idx` ON `pending_renewals` (`activation_date`);--> statement-breakpoint
CREATE INDEX `pending_renewals_created_at_idx` ON `pending_renewals` (`created_at`);--> statement-breakpoint
CREATE TABLE `saved_filters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`name` text NOT NULL,
	`filters` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`division_id` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `services_division_idx` ON `services` (`division_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `services_name_division_idx` ON `services` (`name`,`division_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`email` text NOT NULL,
	`password` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_idx` ON `users` (`email`);