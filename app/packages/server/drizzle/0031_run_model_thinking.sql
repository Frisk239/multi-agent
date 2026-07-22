-- G22 residual: snapshot model/thinking on agent_run (null = CLI default / not set)
ALTER TABLE `agent_run` ADD `model` text;
--> statement-breakpoint
ALTER TABLE `agent_run` ADD `thinking_level` text;
