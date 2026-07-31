-- S3 · 评论 thread-lite + resolve/fold
-- 刻意只支持 root + 一层回复：parent_comment_id 必须指向一条 parent_comment_id IS NULL 的评论（在 handler 强制）。
-- resolution 记在 root 上：resolved_at + resolution_comment_id，天然保证「每线程最多一个结论」。
ALTER TABLE `comment` ADD `parent_comment_id` text;
--> statement-breakpoint
ALTER TABLE `comment` ADD `resolved_at` integer;
--> statement-breakpoint
ALTER TABLE `comment` ADD `resolution_comment_id` text;
--> statement-breakpoint
CREATE INDEX `idx_comment_parent` ON `comment` (`parent_comment_id`);
