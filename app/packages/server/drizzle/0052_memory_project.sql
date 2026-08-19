-- G4 memory isolation: legacy rows remain global (project_id NULL).
ALTER TABLE `memory_item` ADD `project_id` text;
--> statement-breakpoint
CREATE INDEX `idx_memory_item_project` ON `memory_item` (`project_id`);
