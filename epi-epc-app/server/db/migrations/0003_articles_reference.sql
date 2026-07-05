CREATE TABLE `agent_mensurations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`agent_id` integer NOT NULL,
	`cle` text NOT NULL,
	`valeur` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `agent_mensurations_agent_idx` ON `agent_mensurations` (`agent_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `agent_mensurations_agent_cle_idx` ON `agent_mensurations` (`agent_id`,`cle`);--> statement-breakpoint
CREATE TABLE `articles_reference` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`hierarchie_parent_id` integer NOT NULL,
	`designation` text NOT NULL,
	`caracteristiques_techniques` text,
	`fiche_technique_pdf_url` text,
	`photo_url` text,
	`normes` text,
	`certifications` text,
	`duree_vie_recommandee_mois` integer,
	`quantite_reference` integer,
	`type_dotation` text,
	`observations` text,
	`actif` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`hierarchie_parent_id`) REFERENCES `equipement_hierarchie`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_reference_code_unique` ON `articles_reference` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `articles_reference_code_idx` ON `articles_reference` (`code`);--> statement-breakpoint
CREATE INDEX `articles_reference_parent_idx` ON `articles_reference` (`hierarchie_parent_id`);--> statement-breakpoint
CREATE INDEX `articles_reference_designation_idx` ON `articles_reference` (`designation`);--> statement-breakpoint
ALTER TABLE `affectations` ADD `date_cloture_statut` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `article_reference_id` integer REFERENCES articles_reference(id);--> statement-breakpoint
ALTER TABLE `articles` ADD `marque` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `modele` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `date_acquisition` text;--> statement-breakpoint
ALTER TABLE `articles` ADD `numero_serie` text;--> statement-breakpoint
CREATE INDEX `articles_article_reference_idx` ON `articles` (`article_reference_id`);--> statement-breakpoint
ALTER TABLE `equipement_hierarchie` ADD `code_abrege` text;--> statement-breakpoint
ALTER TABLE `equipement_hierarchie` ADD `soumis_controle_reglementaire_explicite` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `equipement_hierarchie_parent_abrege_idx` ON `equipement_hierarchie` (`parent_id`,`code_abrege`);--> statement-breakpoint
ALTER TABLE `kit_template_lignes` ADD `article_reference_id` integer REFERENCES articles_reference(id);