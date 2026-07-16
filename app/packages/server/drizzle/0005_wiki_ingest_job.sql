CREATE TABLE `wiki_ingest_job` (
	`id` text PRIMARY KEY NOT NULL,
	`issue_id` text NOT NULL,
	`status` text NOT NULL,
	`fail_count` integer DEFAULT 0 NOT NULL,
	`max_retries` integer DEFAULT 3 NOT NULL,
	`last_error` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_wiki_ingest_job_status_created` ON `wiki_ingest_job` (`status`,`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_wiki_ingest_job_issue` ON `wiki_ingest_job` (`issue_id`);
