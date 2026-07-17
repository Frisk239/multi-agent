// S10 OpenAI 兼容 Embedding（spec §5）
export function getEmbeddingConfig(): {
  apiKey: string;
  baseURL: string;
  model: string;
  dims: number;
} {
  const apiKey = process.env.EMBEDDING_API_KEY || process.env.OPENAI_API_KEY || '';
  const baseURL = (
    process.env.EMBEDDING_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://api.openai.com/v1'
  ).replace(/\/$/, '');
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const dims = Number(process.env.EMBEDDING_DIMS || 1536);
  return { apiKey, baseURL, model, dims };
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const { apiKey, baseURL, model, dims } = getEmbeddingConfig();
  if (!apiKey) throw new Error('EMBEDDING_API_KEY / OPENAI_API_KEY 未配置');
  if (texts.length === 0) return [];

  const res = await fetch(`${baseURL}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input: texts }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`embedding HTTP ${res.status}: ${body.slice(0, 500)}`);
  }
  const json = (await res.json()) as {
    data: { embedding: number[]; index: number }[];
  };
  const sorted = [...json.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => {
    if (d.embedding.length !== dims) {
      throw new Error(
        `embedding dims ${d.embedding.length} !== EMBEDDING_DIMS ${dims}`,
      );
    }
    return d.embedding;
  });
}

export async function embedQuery(text: string): Promise<number[]> {
  const [v] = await embedTexts([text]);
  return v;
}

/** pgvector 字面量 */
export function vectorLiteral(v: number[]): string {
  return `[${v.join(',')}]`;
}
