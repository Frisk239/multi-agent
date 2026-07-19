CREATE TABLE `project` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_project_workspace` ON `project` (`workspace_id`);
--> statement-breakpoint
ALTER TABLE `issue` ADD `project_id` text;
--> statement-breakpoint
CREATE INDEX `idx_issue_project` ON `issue` (`project_id`);
