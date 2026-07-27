-- Slice 41 / R7：schema 真源收口——此前仅靠 client/test-db 启动兼容 ALTER 的列
ALTER TABLE `agent` ADD COLUMN `allowed_paths` text;--> statement-breakpoint
ALTER TABLE `agent_run` ADD COLUMN `parent_run_id` text;--> statement-breakpoint
ALTER TABLE `issue` ADD COLUMN `custom_fields` text;--> statement-breakpoint
ALTER TABLE `automation_rule` ADD COLUMN `cron_expression` text;--> statement-breakpoint
ALTER TABLE `memory_item` ADD COLUMN `valid_at` integer;--> statement-breakpoint
ALTER TABLE `memory_item` ADD COLUMN `invalid_at` integer;
