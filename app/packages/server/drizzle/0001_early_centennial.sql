CREATE TABLE `comment` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`type` text NOT NULL,
	`author_type` text NOT NULL,
	`author_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_comment_issue_created` ON `comment` (`issue_id`,`created_at`);