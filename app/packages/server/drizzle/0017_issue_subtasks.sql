ALTER TABLE `issue` ADD `parent_issue_id` text;
--> statement-breakpoint
CREATE INDEX `idx_issue_parent` ON `issue` (`parent_issue_id`);
