-- B5：squad 加 updated_at（改名/协议/directive 更新时由服务端写入；旧行 null → 列表排序 createdAt 兜底）
ALTER TABLE `squad` ADD `updated_at` integer;
