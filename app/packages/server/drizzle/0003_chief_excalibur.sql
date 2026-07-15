CREATE TABLE `squad_member` (
	`squad_id` text NOT NULL,
	`agent_id` text NOT NULL,
	PRIMARY KEY(`squad_id`, `agent_id`),
	FOREIGN KEY (`squad_id`) REFERENCES `squad`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `is_leader` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `agent_run` ADD `squad_id` text;--> statement-breakpoint
ALTER TABLE `agent` ADD `concurrency` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `squad` ADD `operating_protocol` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `squad` ADD `mission_directive` text DEFAULT '' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_squad_member_squad` ON `squad_member` (`squad_id`);