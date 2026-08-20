-- Issue due dates are date-only strings (YYYY-MM-DD). The server stores and
-- returns them verbatim; overdue/soon highlighting is computed client-side in
-- the viewer's local timezone (issue-due-date slice, mirrors multica showDueDate).
ALTER TABLE `issue` ADD `due_date` text;
