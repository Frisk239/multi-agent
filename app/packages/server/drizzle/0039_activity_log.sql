-- R4：Issue 结构化活动时间线。此前仅 schema.ts 声明，fresh DB 迁移缺表。
CREATE TABLE `activity_log` (
  `id` text PRIMARY KEY NOT NULL,
  `issue_id` text NOT NULL,
  `actor_type` text DEFAULT 'system' NOT NULL,
  `actor_id` text,
  `actor_name` text DEFAULT '系统' NOT NULL,
  `event_type` text NOT NULL,
  `payload` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`issue_id`) REFERENCES `issue`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_activity_log_issue` ON `activity_log` (`issue_id`);
