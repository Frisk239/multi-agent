-- Webhook rate limit (webhook-rate-limit slice): per-rule sliding-window cap
-- on webhook triggers. NULL = default cap (10/min). The window counts only
-- `dispatched` deliveries in automation_webhook_delivery, so no extra table.
ALTER TABLE `automation_rule` ADD `webhook_rate_per_min` integer;
