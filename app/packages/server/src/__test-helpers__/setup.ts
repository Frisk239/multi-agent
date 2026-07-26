// 全局测试 setup（学 Hermes conftest.py env 清洗）
// 确保测试不碰生产 DB，不泄露敏感 env 变量

import { beforeAll } from 'vitest';

beforeAll(() => {
  // 1. 强制 DB_PATH 指向内存（防止碰 dev.db）
  process.env.DB_PATH = ':memory:';

  // 2. 清洗敏感环境变量（学 Hermes conftest.py:51-160）
  const sensitivePatterns = [
    /_API_KEY$/,
    /_TOKEN$/,
    /_SECRET$/,
    /_CREDENTIALS$/,
    /^ANTHROPIC_/,
    /^OPENAI_/,
    /^LANGCHAIN_/,
  ];
  for (const key of Object.keys(process.env)) {
    if (sensitivePatterns.some((p) => p.test(key))) {
      delete process.env[key];
    }
  }

  // 3. 确保不会意外连接 PostgreSQL
  delete process.env.MEMORY_PG_URL;
  delete process.env.DATABASE_URL;
});
