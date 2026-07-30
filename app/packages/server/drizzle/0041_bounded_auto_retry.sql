ALTER TABLE `agent_run` ADD `attempt` integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `max_attempts` integer NOT NULL DEFAULT 2;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `next_attempt_at` integer;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `auto_retry_of_run_id` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_agent_run_auto_retry_of` ON `agent_run` (`auto_retry_of_run_id`) WHERE `auto_retry_of_run_id` IS NOT NULL;
