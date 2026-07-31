-- S4 · 真本地附件（替代前端 512KiB data URL 内嵌）
-- 字节落在单一受管本地根（~/.multi-agent/attachments），DB 只存元数据。
-- comment_id 可空：先上传拿到 id，评论提交时再绑定；未绑定的是孤儿，由 TTL GC 清理。
CREATE TABLE `attachment` (
  `id` text PRIMARY KEY NOT NULL,
  `issue_id` text NOT NULL,
  `comment_id` text,
  `original_name` text NOT NULL,
  `mime` text NOT NULL,
  `size_bytes` integer NOT NULL,
  `storage_name` text NOT NULL,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_attachment_issue` ON `attachment` (`issue_id`);
--> statement-breakpoint
CREATE INDEX `idx_attachment_comment` ON `attachment` (`comment_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_attachment_storage_name` ON `attachment` (`storage_name`);
