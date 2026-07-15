CREATE TABLE `agent_run` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`runtime` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `run_message` (
	`id` text PRIMARY KEY NOT NULL,
	`run_id` text NOT NULL,
	`seq` integer NOT NULL,
	`kind` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `agent_run`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `agent` ADD `runtime` text DEFAULT 'claude-code' NOT NULL;--> statement-breakpoint
CREATE INDEX `idx_agent_run_issue` ON `agent_run` (`issue_id`);--> statement-breakpoint
CREATE INDEX `idx_agent_run_status` ON `agent_run` (`status`);--> statement-breakpoint
CREATE INDEX `idx_run_message_run_seq` ON `run_message` (`run_id`,`seq`);