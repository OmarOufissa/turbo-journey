ALTER TABLE `affectations` ADD `numero_serie` text;--> statement-breakpoint
ALTER TABLE `affectations` ADD `lieu_emplacement` text;--> statement-breakpoint
ALTER TABLE `affectations` ADD `marque` text;--> statement-breakpoint
ALTER TABLE `affectations` ADD `date_fabrication_unite` text;--> statement-breakpoint
ALTER TABLE `affectations` ADD `observations` text;--> statement-breakpoint
ALTER TABLE `affectations` ADD `caracteristiques` text;--> statement-breakpoint
CREATE INDEX `affectations_numero_serie_idx` ON `affectations` (`numero_serie`);--> statement-breakpoint
ALTER TABLE `articles` ADD `famille_secondaire_id` integer REFERENCES familles(id);--> statement-breakpoint
CREATE INDEX `articles_famille_secondaire_idx` ON `articles` (`famille_secondaire_id`);--> statement-breakpoint
ALTER TABLE `familles` ADD `soumis_controle_reglementaire` integer DEFAULT false NOT NULL;