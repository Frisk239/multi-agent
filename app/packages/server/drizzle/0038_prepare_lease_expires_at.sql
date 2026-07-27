-- Slice 68：claim 后 prepare 阶段 lease 到期时刻（epoch ms）；稳定 running 后清 null；旧行 null
ALTER TABLE `agent_run` ADD COLUMN `prepare_lease_expires_at` integer;
