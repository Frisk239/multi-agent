CREATE TABLE `memory_item` (
	`id` text PRIMARY KEY NOT NULL,
	`scope` text DEFAULT 'workspace' NOT NULL,
	`issue_id` text,
	`agent_id` text,
	`run_id` text,
	`text` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_memory_item_created` ON `memory_item` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_memory_item_issue` ON `memory_item` (`issue_id`);
