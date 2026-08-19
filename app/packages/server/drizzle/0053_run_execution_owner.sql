-- G8-2: PID alone is not safe after restart. Active owner state stays separate
-- from agent_run's business lifecycle and only stores a non-secret fingerprint.
CREATE TABLE `run_execution_owner` (
  `run_id` text PRIMARY KEY NOT NULL,
  `pid` integer NOT NULL,
  `fingerprint` text NOT NULL,
  `cwd_path` text,
  `recorded_at` integer NOT NULL,
  FOREIGN KEY (`run_id`) REFERENCES `agent_run`(`id`) ON UPDATE no action ON DELETE cascade
);
