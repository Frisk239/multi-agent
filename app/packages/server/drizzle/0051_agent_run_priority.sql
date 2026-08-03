-- G6-1：run 认领按优先级公平（快照自 issue.priority；无 issue 默认 none）
ALTER TABLE `agent_run` ADD `priority` text DEFAULT 'none' NOT NULL;
