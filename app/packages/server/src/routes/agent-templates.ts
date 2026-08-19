import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  AGENT_TEMPLATES,
  CreateAgentInput,
  agentTemplateToCreateInput,
  getAgentTemplate,
  type AgentTemplate,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agents } from '../db/schema.js';
import { toAgentDetail } from '../db/reshape.js';
import { eq } from 'drizzle-orm';
import { validateMcpConfig } from '../runtime/mcp-config.js';

const CLIENT_ID_RE = /^[a-z][a-z0-9_-]{1,63}$/;

function resolveNewId(optional?: string): string {
  if (optional && CLIENT_ID_RE.test(optional)) return optional;
  return crypto.randomUUID();
}

const CreateFromTemplateBody = z.object({
  /** 可选覆盖；未传字段用模板默认 */
  name: z.string().min(1).max(80).optional(),
  runtime: CreateAgentInput.shape.runtime.optional(),
  model: CreateAgentInput.shape.model.optional(),
  thinkingLevel: CreateAgentInput.shape.thinkingLevel.optional(),
  category: CreateAgentInput.shape.category.optional(),
  concurrency: CreateAgentInput.shape.concurrency.optional(),
  instructions: CreateAgentInput.shape.instructions.optional(),
  allowedPaths: CreateAgentInput.shape.allowedPaths.optional(),
  mcpServers: CreateAgentInput.shape.mcpServers.optional(),
  id: CreateAgentInput.shape.id.optional(),
});

function publicTemplate(t: AgentTemplate) {
  // 明确不暴露任何 secret 形态字段（模板本身也没有）
  return {
    id: t.id,
    title: t.title,
    summary: t.summary,
    name: t.name,
    category: t.category,
    runtime: t.runtime,
    model: t.model,
    thinkingLevel: t.thinkingLevel,
    concurrency: t.concurrency,
    instructions: t.instructions,
    allowedPaths: t.allowedPaths,
    mcpServers: t.mcpServers,
    icon: t.icon,
  };
}

export async function agentTemplateRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/agent-templates —— 本地静态模板清单
  app.get('/api/agent-templates', async () => {
    return AGENT_TEMPLATES.map(publicTemplate);
  });

  // GET /api/agent-templates/:id
  app.get('/api/agent-templates/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const tpl = getAgentTemplate(id);
    if (!tpl) {
      return reply.status(404).send({ success: false, error: '模板不存在' });
    }
    return publicTemplate(tpl);
  });

  // POST /api/agent-templates/:id/create —— 从模板一键物化 Agent
  app.post('/api/agent-templates/:id/create', async (req, reply) => {
    const { id: templateId } = req.params as { id: string };
    const tpl = getAgentTemplate(templateId);
    if (!tpl) {
      return reply.status(404).send({ success: false, error: '模板不存在' });
    }

    const bodyParsed = CreateFromTemplateBody.safeParse(req.body ?? {});
    if (!bodyParsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: bodyParsed.error.flatten(),
      });
    }
    const overrides = bodyParsed.data;
    const draft = agentTemplateToCreateInput(tpl, {
      name: overrides.name,
      runtime: overrides.runtime,
      model: overrides.model,
      thinkingLevel: overrides.thinkingLevel,
      category: overrides.category,
      concurrency: overrides.concurrency,
      instructions: overrides.instructions,
      allowedPaths: overrides.allowedPaths,
      mcpServers: overrides.mcpServers,
    });

    const parsed = CreateAgentInput.safeParse({
      ...draft,
      id: overrides.id,
    });
    if (!parsed.success) {
      return reply.status(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        details: parsed.error.flatten(),
      });
    }

    const input = parsed.data;
    let mcpServers: string | null = null;
    if (input.mcpServers?.trim()) {
      const mcpResult = validateMcpConfig(input.mcpServers);
      if (!mcpResult.ok) {
        return reply.status(400).send({ success: false, error: mcpResult.error, code: 'INVALID_MCP_CONFIG' });
      }
      mcpServers = mcpResult.canonical;
    }
    const id = resolveNewId(input.id);
    const existing = db.select().from(agents).where(eq(agents.id, id)).get();
    if (existing) {
      return reply.status(409).send({ success: false, error: `agent id 已存在: ${id}` });
    }

    const now = Date.now();
    const model =
      input.model == null || !String(input.model).trim()
        ? null
        : String(input.model).trim();
    const thinkingLevel =
      input.thinkingLevel == null || !String(input.thinkingLevel).trim()
        ? null
        : String(input.thinkingLevel).trim();
    const allowedPaths =
      input.allowedPaths == null || !String(input.allowedPaths).trim()
        ? null
        : String(input.allowedPaths).trim();

    db.insert(agents)
      .values({
        id,
        name: input.name,
        runtime: input.runtime,
        model,
        thinkingLevel,
        category: input.category ?? null,
        concurrency: input.concurrency ?? 1,
        instructions: input.instructions ?? '',
        allowedPaths,
        mcpServers,
        createdAt: now,
      })
      .run();

    const row = db.select().from(agents).where(eq(agents.id, id)).get()!;
    return reply.status(201).send(toAgentDetail(row));
  });
}
