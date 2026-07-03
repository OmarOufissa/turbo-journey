CREATE TABLE `affectations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`beneficiaire_type` text NOT NULL,
	`agent_id` integer,
	`equipe_id` integer,
	`quantite` integer DEFAULT 1 NOT NULL,
	`taille` text,
	`pointure` text,
	`date_affectation` text,
	`motif` text,
	`validateur_agent_id` integer,
	`signature_url` text,
	`statut` text DEFAULT 'actif' NOT NULL,
	`date_retour` text,
	`etat_retour` text,
	`kit_template_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipe_id`) REFERENCES `equipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`validateur_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`kit_template_id`) REFERENCES `kit_templates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `affectations_article_idx` ON `affectations` (`article_id`);--> statement-breakpoint
CREATE INDEX `affectations_agent_idx` ON `affectations` (`agent_id`);--> statement-breakpoint
CREATE INDEX `affectations_equipe_idx` ON `affectations` (`equipe_id`);--> statement-breakpoint
CREATE INDEX `affectations_statut_idx` ON `affectations` (`statut`);--> statement-breakpoint
CREATE INDEX `affectations_date_idx` ON `affectations` (`date_affectation`);--> statement-breakpoint
CREATE TABLE `agents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`matricule` text NOT NULL,
	`nom` text NOT NULL,
	`prenom` text,
	`photo_url` text,
	`division_id` integer,
	`service_id` integer,
	`equipe_id` integer,
	`fonction` text,
	`poste` text,
	`date_embauche` text,
	`telephone` text,
	`email` text,
	`statut` text DEFAULT 'actif' NOT NULL,
	`note` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipe_id`) REFERENCES `equipes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `agents_matricule_unique` ON `agents` (`matricule`);--> statement-breakpoint
CREATE UNIQUE INDEX `agents_matricule_idx` ON `agents` (`matricule`);--> statement-breakpoint
CREATE INDEX `agents_division_idx` ON `agents` (`division_id`);--> statement-breakpoint
CREATE INDEX `agents_service_idx` ON `agents` (`service_id`);--> statement-breakpoint
CREATE INDEX `agents_equipe_idx` ON `agents` (`equipe_id`);--> statement-breakpoint
CREATE INDEX `agents_statut_idx` ON `agents` (`statut`);--> statement-breakpoint
CREATE TABLE `alertes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`entite_type` text,
	`entite_id` integer,
	`niveau` text DEFAULT 'info' NOT NULL,
	`message` text NOT NULL,
	`lue` integer DEFAULT false NOT NULL,
	`traitee` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `alertes_type_idx` ON `alertes` (`type`);--> statement-breakpoint
CREATE INDEX `alertes_lue_idx` ON `alertes` (`lue`);--> statement-breakpoint
CREATE INDEX `alertes_niveau_idx` ON `alertes` (`niveau`);--> statement-breakpoint
CREATE TABLE `articles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code_article` text NOT NULL,
	`code_interne` text,
	`code_fournisseur` text,
	`famille_id` integer,
	`sous_famille_id` integer,
	`designation` text NOT NULL,
	`description` text,
	`photo_url` text,
	`reference_fabricant` text,
	`constructeur` text,
	`normes` text,
	`certification` text,
	`date_fabrication` text,
	`duree_vie_mois` integer,
	`date_limite_utilisation` text,
	`notice_pdf_url` text,
	`fiche_technique_pdf_url` text,
	`poids_kg` real,
	`dimensions` text,
	`couleur` text,
	`a_taille` integer DEFAULT false NOT NULL,
	`a_pointure` integer DEFAULT false NOT NULL,
	`date_mise_en_service` text,
	`observations` text,
	`prix_unitaire` real,
	`marche_id` integer,
	`fournisseur` text,
	`garantie_mois` integer,
	`stock_min` integer DEFAULT 0 NOT NULL,
	`stock_max` integer,
	`stock_disponible` integer DEFAULT 0 NOT NULL,
	`stock_reserve` integer DEFAULT 0 NOT NULL,
	`stock_commande` integer DEFAULT 0 NOT NULL,
	`unite` text DEFAULT 'pièce' NOT NULL,
	`actif` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`updated_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`famille_id`) REFERENCES `familles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`sous_famille_id`) REFERENCES `sous_familles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`marche_id`) REFERENCES `marches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `articles_code_article_unique` ON `articles` (`code_article`);--> statement-breakpoint
CREATE UNIQUE INDEX `articles_code_idx` ON `articles` (`code_article`);--> statement-breakpoint
CREATE INDEX `articles_famille_idx` ON `articles` (`famille_id`);--> statement-breakpoint
CREATE INDEX `articles_designation_idx` ON `articles` (`designation`);--> statement-breakpoint
CREATE INDEX `articles_stock_disponible_idx` ON `articles` (`stock_disponible`);--> statement-breakpoint
CREATE TABLE `controles_periodiques` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer,
	`affectation_id` integer,
	`type` text NOT NULL,
	`date_planifiee` text NOT NULL,
	`date_realisee` text,
	`resultat` text,
	`prochaine_echeance` text,
	`realise_par_agent_id` integer,
	`observations` text,
	`statut` text DEFAULT 'planifie' NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affectation_id`) REFERENCES `affectations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`realise_par_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `controles_article_idx` ON `controles_periodiques` (`article_id`);--> statement-breakpoint
CREATE INDEX `controles_date_planifiee_idx` ON `controles_periodiques` (`date_planifiee`);--> statement-breakpoint
CREATE INDEX `controles_statut_idx` ON `controles_periodiques` (`statut`);--> statement-breakpoint
CREATE TABLE `divisions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`nom` text NOT NULL,
	`chef_agent_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `divisions_code_unique` ON `divisions` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `divisions_nom_idx` ON `divisions` (`nom`);--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entite_type` text NOT NULL,
	`entite_id` integer NOT NULL,
	`type_document` text NOT NULL,
	`nom_fichier` text NOT NULL,
	`url` text NOT NULL,
	`taille_octets` integer,
	`uploaded_by_user_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `documents_entite_idx` ON `documents` (`entite_type`,`entite_id`);--> statement-breakpoint
CREATE TABLE `equipes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`nom` text NOT NULL,
	`service_id` integer NOT NULL,
	`team_type` text,
	`chef_agent_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`service_id`) REFERENCES `services`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `equipes_code_unique` ON `equipes` (`code`);--> statement-breakpoint
CREATE INDEX `equipes_service_idx` ON `equipes` (`service_id`);--> statement-breakpoint
CREATE INDEX `equipes_team_type_idx` ON `equipes` (`team_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `equipes_nom_service_idx` ON `equipes` (`nom`,`service_id`);--> statement-breakpoint
CREATE TABLE `familles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`nom` text NOT NULL,
	`ordre` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `familles_nom_unique` ON `familles` (`nom`);--> statement-breakpoint
CREATE TABLE `historique` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type_evenement` text NOT NULL,
	`entite_type` text NOT NULL,
	`entite_id` integer,
	`agent_id` integer,
	`equipe_id` integer,
	`article_id` integer,
	`utilisateur_id` integer,
	`details` text,
	`date_evenement` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`equipe_id`) REFERENCES `equipes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`utilisateur_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `historique_type_idx` ON `historique` (`type_evenement`);--> statement-breakpoint
CREATE INDEX `historique_entite_idx` ON `historique` (`entite_type`,`entite_id`);--> statement-breakpoint
CREATE INDEX `historique_date_idx` ON `historique` (`date_evenement`);--> statement-breakpoint
CREATE UNIQUE INDEX `historique_id_created_at_idx` ON `historique` (`id`,`created_at`);--> statement-breakpoint
CREATE TABLE `kit_template_lignes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kit_template_id` integer NOT NULL,
	`article_id` integer NOT NULL,
	`quantite` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`kit_template_id`) REFERENCES `kit_templates`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `kit_template_lignes_kit_idx` ON `kit_template_lignes` (`kit_template_id`);--> statement-breakpoint
CREATE TABLE `kit_templates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`applies_to_type` text NOT NULL,
	`applies_to_value` text NOT NULL,
	`categorie` text NOT NULL,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `kit_templates_code_unique` ON `kit_templates` (`code`);--> statement-breakpoint
CREATE UNIQUE INDEX `kit_templates_code_idx` ON `kit_templates` (`code`);--> statement-breakpoint
CREATE TABLE `marches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`numero` text NOT NULL,
	`annee` integer NOT NULL,
	`objet` text NOT NULL,
	`fournisseur` text NOT NULL,
	`montant` real,
	`date_notification` text,
	`date_livraison` text,
	`statut` text DEFAULT 'notifie' NOT NULL,
	`observations` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `marches_numero_annee_idx` ON `marches` (`numero`,`annee`);--> statement-breakpoint
CREATE TABLE `reformes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`affectation_id` integer,
	`date_reforme` text NOT NULL,
	`quantite` integer DEFAULT 1 NOT NULL,
	`motif` text NOT NULL,
	`decision` text,
	`valide_par_agent_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affectation_id`) REFERENCES `affectations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`valide_par_agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reformes_article_idx` ON `reformes` (`article_id`);--> statement-breakpoint
CREATE TABLE `reparations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`affectation_id` integer,
	`date_envoi` text NOT NULL,
	`date_retour_prevue` text,
	`date_retour_reelle` text,
	`prestataire` text,
	`cout` real,
	`statut` text DEFAULT 'en_cours' NOT NULL,
	`motif` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`affectation_id`) REFERENCES `affectations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reparations_article_idx` ON `reparations` (`article_id`);--> statement-breakpoint
CREATE TABLE `services` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`nom` text NOT NULL,
	`division_id` integer NOT NULL,
	`chef_agent_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `services_code_unique` ON `services` (`code`);--> statement-breakpoint
CREATE INDEX `services_division_idx` ON `services` (`division_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `services_nom_division_idx` ON `services` (`nom`,`division_id`);--> statement-breakpoint
CREATE TABLE `sous_familles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`famille_id` integer NOT NULL,
	`nom` text NOT NULL,
	FOREIGN KEY (`famille_id`) REFERENCES `familles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sous_familles_famille_idx` ON `sous_familles` (`famille_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `sous_familles_nom_famille_idx` ON `sous_familles` (`nom`,`famille_id`);--> statement-breakpoint
CREATE TABLE `stock_mouvements` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`article_id` integer NOT NULL,
	`type` text NOT NULL,
	`quantite` integer NOT NULL,
	`reference_type` text,
	`reference_id` integer,
	`motif` text,
	`date_mouvement` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	`cree_par_user_id` integer,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`article_id`) REFERENCES `articles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cree_par_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `stock_mouvements_article_idx` ON `stock_mouvements` (`article_id`);--> statement-breakpoint
CREATE INDEX `stock_mouvements_date_idx` ON `stock_mouvements` (`date_mouvement`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`nom` text NOT NULL,
	`agent_id` integer,
	`actif` integer DEFAULT true NOT NULL,
	`derniere_connexion` text,
	`created_at` text DEFAULT (CURRENT_TIMESTAMP) NOT NULL,
	FOREIGN KEY (`agent_id`) REFERENCES `agents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_idx` ON `users` (`username`);