-- Grok Build CLI runtime id on agent / agent_run (SQLite CHECK rebuild not required;
-- drizzle enum is documentation; existing rows stay valid; new value accepted as text).
-- No structural column change needed for SQLite text columns.
SELECT 1;
