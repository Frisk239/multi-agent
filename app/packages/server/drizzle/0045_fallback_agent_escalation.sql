ALTER TABLE `agent` ADD `fallback_agent_id` text;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `escalated_from_run_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_run_escalated_from` ON `agent_run` (`escalated_from_run_id`);
