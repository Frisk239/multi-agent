-- G2-5：workspace 全局在途并发上限（null=不限；只拦 claim，不拦 enqueue）
ALTER TABLE `workspace` ADD `max_concurrent_runs` integer;
