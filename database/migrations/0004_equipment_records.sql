CREATE TABLE `equipment_records` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`category` text NOT NULL,
	`performed_on` text NOT NULL,
	`maker` text,
	`model_number` text,
	`cost` integer,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `equipment_records_org_idx` ON `equipment_records` (`organization_id`);--> statement-breakpoint
CREATE INDEX `equipment_records_latest_idx` ON `equipment_records` (`unit_id`,`category`,`performed_on`);