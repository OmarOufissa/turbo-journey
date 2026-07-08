CREATE TABLE `postes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`nom` text NOT NULL,
	`service_id` integer NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `postes_code_unique` ON `postes` (`code`);--> statement-breakpoint
CREATE INDEX `postes_service_idx` ON `postes` (`service_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `postes_nom_service_idx` ON `postes` (`nom`,`service_id`);--> statement-breakpoint
DROP INDEX `affectations_numero_serie_idx`;--> statement-breakpoint
ALTER TABLE `affectations` ADD `poste_id` integer REFERENCES postes(id);--> statement-breakpoint
CREATE INDEX `affectations_poste_idx` ON `affectations` (`poste_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `affectations_numero_serie_idx` ON `affectations` (`numero_serie`);--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `code_fournisseur`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `reference_fabricant`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `numero_serie`;