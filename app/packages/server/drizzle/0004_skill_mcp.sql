-- S05：删 S01 的 skill 死表（spec §3.2b / R6）+ agent 加 mcp_servers + 新增 agent_skill 分配表
ALTER TABLE `agent` ADD `mcp_servers` text;--> statement-breakpoint
CREATE TABLE `agent_skill` (
	`agent_id` text NOT NULL,
	`skill_id` text NOT NULL,
	PRIMARY KEY(`agent_id`, `skill_id`),
	FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `idx_agent_skill_agent` ON `agent_skill` (`agent_id`);--> statement-breakpoint
DROP TABLE `skill`;
