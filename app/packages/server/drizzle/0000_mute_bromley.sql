CREATE TABLE `agent` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `issue` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`identifier` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'backlog' NOT NULL,
	`priority` text DEFAULT 'none' NOT NULL,
	`assignee_type` text,
	`assignee_id` text,
	`creator_type` text NOT NULL,
	`creator_id` text NOT NULL,
	`position` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skill` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`url` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `squad` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`leader_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspace` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_issue_status_workspace` ON `issue` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `idx_issue_assignee` ON `issue` (`assignee_type`,`assignee_id`);