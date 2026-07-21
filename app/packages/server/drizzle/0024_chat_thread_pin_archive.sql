ALTER TABLE `chat_thread` ADD `pinned_at` integer;--> statement-breakpoint
ALTER TABLE `chat_thread` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `idx_chat_thread_pinned` ON `chat_thread` (`pinned_at`);--> statement-breakpoint
CREATE INDEX `idx_chat_thread_archived` ON `chat_thread` (`archived_at`);
