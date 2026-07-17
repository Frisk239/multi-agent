ALTER TABLE `agent_run` ADD `last_heartbeat_at` integer;
--> statement-breakpoint
CREATE TABLE `inbox_item` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`recipient_type` text NOT NULL,
	`recipient_id` text NOT NULL,
	`type` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`issue_id` text,
	`title` text NOT NULL,
	`body` text,
	`actor_type` text,
	`actor_id` text,
	`dedupe_key` text,
	`read` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_inbox_recipient_created` ON `inbox_item` (`recipient_type`,`recipient_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_inbox_dedupe` ON `inbox_item` (`recipient_type`,`recipient_id`,`dedupe_key`);
--> statement-breakpoint
CREATE TABLE `issue_subscriber` (
	`issue_id` text NOT NULL,
	`user_type` text NOT NULL,
	`user_id` text NOT NULL,
	`reason` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`issue_id`, `user_type`, `user_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE cascade
);
