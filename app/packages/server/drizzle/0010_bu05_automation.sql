CREATE TABLE `automation_rule` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`schedule_kind` text NOT NULL,
	`interval_minutes` integer,
	`daily_time` text,
	`assignee_type` text NOT NULL,
	`assignee_id` text NOT NULL,
	`title_template` text NOT NULL,
	`body_template` text DEFAULT '' NOT NULL,
	`last_planned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `automation_run` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`planned_at` integer NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`issue_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rule`(`id`) ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_run_rule_planned` ON `automation_run` (`rule_id`,`planned_at`);
--> statement-breakpoint
CREATE INDEX `idx_automation_run_rule_created` ON `automation_run` (`rule_id`,`created_at`);
--> statement-breakpoint
ALTER TABLE `issue` ADD `origin_rule_id` text;
