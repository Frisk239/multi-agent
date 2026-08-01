ALTER TABLE `agent` ADD `invocation_permission` text NOT NULL DEFAULT 'auto';
--> statement-breakpoint
ALTER TABLE `issue` ADD `stage` integer;
