-- DS1：CLI provider session resume（claude-code MVP）
ALTER TABLE `agent_run` ADD `provider_session_id` text;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `resumed_session_id` text;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `session_resume_status` text;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `session_poisoned` integer DEFAULT 0 NOT NULL;
