CREATE TABLE `equipement_hierarchie` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`parent_id` integer,
	`code` text NOT NULL,
	`nom` text NOT NULL,
	`niveau` integer NOT NULL,
	`ordre` integer DEFAULT 0 NOT NULL,
	`soumis_controle_reglementaire` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `equipement_hierarchie`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipement_hierarchie_code_unique` ON `equipement_hierarchie` (`code`);--> statement-breakpoint
CREATE INDEX `equipement_hierarchie_parent_idx` ON `equipement_hierarchie` (`parent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipement_hierarchie_nom_parent_idx` ON `equipement_hierarchie` (`nom`,`parent_id`);--> statement-breakpoint
DROP INDEX `articles_famille_idx`;--> statement-breakpoint
DROP INDEX `articles_famille_secondaire_idx`;--> statement-breakpoint
ALTER TABLE `articles` ADD `hierarchie_id` integer REFERENCES equipement_hierarchie(id);--> statement-breakpoint
CREATE INDEX `articles_hierarchie_idx` ON `articles` (`hierarchie_id`);