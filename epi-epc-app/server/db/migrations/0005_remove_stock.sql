DROP TABLE `stock_mouvements`;--> statement-breakpoint
DROP INDEX `articles_stock_disponible_idx`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `stock_min`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `stock_max`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `stock_disponible`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `stock_reserve`;--> statement-breakpoint
ALTER TABLE `articles` DROP COLUMN `stock_commande`;