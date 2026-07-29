ALTER TABLE `automation_run` ADD `linked_run_id` text;
--> statement-breakpoint
ALTER TABLE `automation_run` ADD `updated_at` integer;
--> statement-breakpoint
UPDATE `automation_run`
SET `updated_at` = `created_at`
WHERE `updated_at` IS NULL;
--> statement-breakpoint
CREATE INDEX `idx_automation_run_issue` ON `automation_run` (`issue_id`);
--> statement-breakpoint
CREATE INDEX `idx_automation_run_linked_run` ON `automation_run` (`linked_run_id`);
