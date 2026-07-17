CREATE TABLE `issue_label` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`color` text DEFAULT '#6b7280' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspace`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_issue_label_workspace_name` ON `issue_label` (`workspace_id`,`name`);
--> statement-breakpoint
CREATE INDEX `idx_issue_label_workspace` ON `issue_label` (`workspace_id`);
--> statement-breakpoint
CREATE TABLE `issue_to_label` (
	`issue_id` text NOT NULL,
	`label_id` text NOT NULL,
	PRIMARY KEY(`issue_id`, `label_id`),
	FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`label_id`) REFERENCES `issue_label`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_issue_to_label_label` ON `issue_to_label` (`label_id`);
