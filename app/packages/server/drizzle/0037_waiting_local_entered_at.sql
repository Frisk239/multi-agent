-- Slice 66：waiting_local_directory 进入时刻（epoch ms）；旧行保持 null
ALTER TABLE `agent_run` ADD COLUMN `waiting_local_entered_at` integer;
