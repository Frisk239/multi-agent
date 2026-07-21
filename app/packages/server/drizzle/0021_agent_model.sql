-- G22：per-agent 模型绑定（对齐 Multica migrations/050_agent_model.up.sql）
-- 空/null = 使用对应 CLI 默认模型；仅影响新 enqueue 的 run
ALTER TABLE `agent` ADD `model` text;
