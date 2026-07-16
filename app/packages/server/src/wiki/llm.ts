// S06 LLM 工厂 + prompt（spec §4.3-4.4）
// 双 provider 支持（OpenAI 兼容 + Anthropic），用 LangChain.js 的 BaseChatModel 统一接口
// 切换 provider 只改环境变量：WIKI_LLM_PROVIDER / WIKI_LLM_API_KEY / WIKI_LLM_BASE_URL / WIKI_LLM_MODEL
import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Issue } from '@ma/shared';

// 双 provider 工厂（spec §4.3）
// WIKI_LLM_PROVIDER: 'openai' | 'anthropic'，默认 'openai'
// OpenAI 兼容格式覆盖 OpenAI/智谱/通义/Ollama/vLLM 等（通过 WIKI_LLM_BASE_URL 切端点）
export function createLlm(): BaseChatModel {
  const provider = process.env.WIKI_LLM_PROVIDER ?? 'openai';
  const apiKey = process.env.WIKI_LLM_API_KEY;
  const model = process.env.WIKI_LLM_MODEL ?? 'gpt-4o';
  if (!apiKey) throw new Error('WIKI_LLM_API_KEY 未配置');

  if (provider === 'anthropic') {
    return new ChatAnthropic({ model, apiKey });
  }
  // openai 兼容（默认）
  // LangChain 1.x：baseURL 走 configuration（OpenAI SDK ClientOptions），非顶层字段
  const baseURL = process.env.WIKI_LLM_BASE_URL;
  return new ChatOpenAI({
    model,
    apiKey,
    ...(baseURL ? { configuration: { baseURL } } : {}),
  });
}

// ingest prompt（spec §4.4）
export function buildIngestPrompt(issue: Issue, sourceText: string): string {
  return `你是一个项目 Wiki 维护者。以下是一个已完成的 Issue 的完整内容。请生成一个 Wiki 页（markdown），总结这个 Issue 的关键信息：做了什么、关键决策、产出。

Issue ${issue.identifier}: ${issue.title}

${sourceText}

请输出一个 markdown Wiki 页（以 # 标题开头），不要输出其他内容。`;
}

// 调 LLM 生成 wiki 页内容
// BaseChatModel.invoke 接收 string（或消息数组），返回 AIMessage，content 是字符串或复杂块
export async function generateWikiPage(
  llm: BaseChatModel,
  prompt: string,
): Promise<string> {
  const result = await llm.invoke(prompt);
  // AIMessage.content 可能是 string 或复杂块数组，统一 toString
  const content = typeof result.content === 'string'
    ? result.content
    : JSON.stringify(result.content);
  return content;
}
