-- Squad retirement is an irreversible archive. Existing members and AgentRun
-- history stay linked to the Squad for audit/prompt replay; active dispatch
-- paths filter archived squads explicitly.
ALTER TABLE `squad` ADD `archived_at` integer;
