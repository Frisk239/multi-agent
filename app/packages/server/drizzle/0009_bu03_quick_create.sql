-- bu03：agent_run.issue_id 可空 + kind/quick_prompt；issue origin 溯源
-- SQLite 无法 DROP NOT NULL，重建 agent_run 表。

PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__new_agent_run` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text,
	`agent_id` text NOT NULL,
	`runtime` text NOT NULL,
	`status` text NOT NULL,
	`kind` text DEFAULT 'issue' NOT NULL,
	`quick_prompt` text,
	`is_leader` integer DEFAULT 0 NOT NULL,
	`squad_id` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`last_heartbeat_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_agent_run`(
	`id`, `issue_id`, `agent_id`, `runtime`, `status`, `kind`, `quick_prompt`,
	`is_leader`, `squad_id`, `error`, `started_at`, `finished_at`, `last_heartbeat_at`, `created_at`
)
SELECT
	`id`, `issue_id`, `agent_id`, `runtime`, `status`, 'issue', NULL,
	`is_leader`, `squad_id`, `error`, `started_at`, `finished_at`, `last_heartbeat_at`, `created_at`
FROM `agent_run`;
--> statement-breakpoint
DROP TABLE `agent_run`;
--> statement-breakpoint
ALTER TABLE `__new_agent_run` RENAME TO `agent_run`;
--> statement-breakpoint
CREATE INDEX `idx_agent_run_issue` ON `agent_run` (`issue_id`);
--> statement-breakpoint
CREATE INDEX `idx_agent_run_status` ON `agent_run` (`status`);
--> statement-breakpoint
CREATE INDEX `idx_agent_run_kind_status` ON `agent_run` (`kind`, `status`);
--> statement-breakpoint
ALTER TABLE `issue` ADD `origin_type` text;
--> statement-breakpoint
ALTER TABLE `issue` ADD `origin_run_id` text;
--> statement-breakpoint
PRAGMA foreign_keys=ON;
