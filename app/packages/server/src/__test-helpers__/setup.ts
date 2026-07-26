// 全局测试 setup（学 Hermes conftest.py env 清洗）

// 清洗敏感环境变量，防止测试泄漏凭据
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
delete process.env.MEMORY_PG_URL;
delete process.env.DATABASE_URL;
