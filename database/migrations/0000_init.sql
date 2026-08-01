CREATE TABLE `invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`accepted_at` integer,
	`invited_by` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitations_token_unq` ON `invitations` (`token`);--> statement-breakpoint
CREATE INDEX `invitations_org_idx` ON `invitations` (`organization_id`);--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `memberships_org_user_unq` ON `memberships` (`organization_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `memberships_user_idx` ON `memberships` (`user_id`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `buildings` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `buildings_org_idx` ON `buildings` (`organization_id`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`building_id` text NOT NULL,
	`type` text NOT NULL,
	`code` text NOT NULL,
	`display_order` integer DEFAULT 0 NOT NULL,
	`listing_rent` integer,
	`listing_started_on` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`building_id`) REFERENCES `buildings`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `units_building_code_unq` ON `units` (`building_id`,`code`);--> statement-breakpoint
CREATE INDEX `units_org_idx` ON `units` (`organization_id`);--> statement-breakpoint
CREATE TABLE `leases` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`contract_date` text NOT NULL,
	`next_renewal_date` text,
	`status` text DEFAULT 'active' NOT NULL,
	`ended_on` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `leases_org_idx` ON `leases` (`organization_id`);--> statement-breakpoint
CREATE INDEX `leases_unit_status_idx` ON `leases` (`unit_id`,`status`);--> statement-breakpoint
CREATE INDEX `leases_next_renewal_idx` ON `leases` (`next_renewal_date`);--> statement-breakpoint
CREATE TABLE `rent_revisions` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`effective_from` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`procedure_id` text,
	`confirmed` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `rent_revisions_org_idx` ON `rent_revisions` (`organization_id`);--> statement-breakpoint
CREATE INDEX `rent_revisions_lease_idx` ON `rent_revisions` (`lease_id`,`effective_from`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`name` text NOT NULL,
	`birth_year` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `tenants_org_idx` ON `tenants` (`organization_id`);--> statement-breakpoint
CREATE TABLE `procedure_items` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`procedure_id` text NOT NULL,
	`key` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`checked_at` integer,
	`value_text` text,
	`note` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`procedure_id`) REFERENCES `procedures`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `procedure_items_org_idx` ON `procedure_items` (`organization_id`);--> statement-breakpoint
CREATE INDEX `procedure_items_procedure_idx` ON `procedure_items` (`procedure_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `procedures` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'todo' NOT NULL,
	`scheduled_on` text,
	`completed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `procedures_org_status_idx` ON `procedures` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `procedures_lease_idx` ON `procedures` (`lease_id`);--> statement-breakpoint
CREATE INDEX `procedures_scheduled_idx` ON `procedures` (`scheduled_on`);--> statement-breakpoint
CREATE TABLE `attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text,
	`content_type` text,
	`size` integer,
	`uploaded_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `attachments_org_idx` ON `attachments` (`organization_id`);--> statement-breakpoint
CREATE INDEX `attachments_entity_idx` ON `attachments` (`entity_type`,`entity_id`);--> statement-breakpoint
CREATE TABLE `equipment` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text,
	`location_note` text,
	`category` text NOT NULL,
	`maker` text,
	`model_number` text,
	`installed_on` text,
	`expected_life_years` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `equipment_org_idx` ON `equipment` (`organization_id`);--> statement-breakpoint
CREATE INDEX `equipment_unit_idx` ON `equipment` (`unit_id`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organization_id` text NOT NULL,
	`unit_id` text,
	`equipment_id` text,
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
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`equipment_id`) REFERENCES `equipment`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `work_orders_org_status_idx` ON `work_orders` (`organization_id`,`status`);--> statement-breakpoint
CREATE INDEX `work_orders_unit_idx` ON `work_orders` (`unit_id`);--> statement-breakpoint
CREATE INDEX `work_orders_updated_idx` ON `work_orders` (`updated_at`);