-- Automation webhook trigger (mirrors multica autopilot_webhook):
-- per-rule random token is the credential; rotation overwrites it so the old
-- URL stops working immediately. webhook_events is a raw comma-separated
-- filter string (empty/NULL = allow all events).
ALTER TABLE `automation_rule` ADD `webhook_token` text;
--> statement-breakpoint
ALTER TABLE `automation_rule` ADD `webhook_events` text;
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_automation_rule_webhook_token` ON `automation_rule` (`webhook_token`);
--> statement-breakpoint
CREATE TABLE `automation_webhook_delivery` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_id` text NOT NULL,
	`event` text NOT NULL,
	`status` text DEFAULT 'dispatched' NOT NULL,
	`payload_json` text,
	`automation_run_id` text,
	`error` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `automation_rule`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_automation_webhook_delivery_rule_created` ON `automation_webhook_delivery` (`rule_id`,`created_at`);
