-- A5 · Multica-style execution_mode: create_issue (default) | run_only
ALTER TABLE `automation_rule` ADD `execution_mode` text DEFAULT 'create_issue' NOT NULL;
