CREATE TABLE `chat_thread` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`title` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `chat_message` (
	`id` text PRIMARY KEY NOT NULL,
	`thread_id` text NOT NULL,
	`role` text NOT NULL,
	`body` text NOT NULL,
	`run_id` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`thread_id`) REFERENCES `chat_thread`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_chat_message_thread_created` ON `chat_message` (`thread_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_chat_thread_updated` ON `chat_thread` (`updated_at`);
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `chat_thread_id` text;
