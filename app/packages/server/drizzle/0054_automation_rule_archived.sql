-- Automation rules are archived instead of physically deleted so their
-- automation_run / Issue / AgentRun audit chain remains queryable.
ALTER TABLE `automation_rule` ADD `archived_at` integer;
