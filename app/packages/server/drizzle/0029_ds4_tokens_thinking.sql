-- DS4：run token 尽力落库 + agent thinking_level
ALTER TABLE `agent_run` ADD `tokens_input` integer;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `tokens_output` integer;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `tokens_cache_read` integer;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `tokens_cache_write` integer;
--> statement-breakpoint
ALTER TABLE `agent` ADD `thinking_level` text;
