-- G3-4：Agent 环境变量 / 自定义参数（JSON 文本列；null=未配置）
ALTER TABLE `agent` ADD `env_vars` text;
--> statement-breakpoint
ALTER TABLE `agent` ADD `custom_args` text;
