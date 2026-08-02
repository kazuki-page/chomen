DROP TABLE `equipment`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text,
	`location_note` text,
	`title` text NOT NULL,
	`description` text,
	`occurred_on` text NOT NULL,
	`handler` text,
	`waiting_on` text,
	`status` text DEFAULT 'todo' NOT NULL,
	`cost` integer,
	`paid` integer DEFAULT false NOT NULL,
	`completed_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_work_orders`("id", "organization_id", "unit_id", "location_note", "title", "description", "occurred_on", "handler", "waiting_on", "status", "cost", "paid", "completed_on", "created_at", "updated_at") SELECT "id", "organization_id", "unit_id", "location_note", "title", "description", "occurred_on", "handler", "waiting_on", "status", "cost", "paid", "completed_on", "created_at", "updated_at" FROM `work_orders`;--> statement-breakpoint
DROP TABLE `work_orders`;--> statement-breakpoint
ALTER TABLE `__new_work_orders` RENAME TO `work_orders`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `work_orders_org_status_idx` ON `work_orders` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `work_orders_unit_idx` ON `work_orders` (`unit_id`);--> statement-breakpoint
CREATE INDEX `work_orders_updated_idx` ON `work_orders` (`updated_at`);