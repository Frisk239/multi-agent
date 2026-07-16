import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { agents, agentSkills } from '../db/schema.js';
import { getSkillIndex, scanSkills } from '../skill/scanner.js';

// skillRoutes —— skill 目录索引 + agent 分配 + MCP 配置（spec §4）。
// GET  /api/skills              内存索引列表（含 usedBy 反查 agent_skill）
// POST /api/skills/refresh      重扫目录刷新索引
// GET  /api/agents/:id/skills   已分配 skillId（R1：过滤悬空引用）
// PUT  /api/agents/:id/skills   整体替换分配（body: { skillIds: string[] }）
// GET  /api/agents/:id/mcp      MCP 配置 JSON 字符串
// PUT  /api/agents/:id/mcp      更新 MCP（body: { mcpServers: string | null }）
export async function skillRoutes(app: FastifyInstance): Promise<void> {
  // GET /api/skills —— 内存索引 + usedBy 反查（spec §4.1）
  app.get('/api/skills', async () => {
    const index = getSkillIndex();
    const allAssigns = db.select().from(agentSkills).all();
    // 一次查全 agent（小表），按 assignedAgentIds 过滤（避免 N+1）
    const allAgents = db.select().from(agents).all();
    const result = [];
    for (const [, skill] of index) {
      const assignedAgentIds = allAssigns
        .filter((a) => a.skillId === skill.name)
        .map((a) => a.agentId);
      const usedBy =
        assignedAgentIds.length > 0
          ? allAgents
              .filter((a) => assignedAgentIds.includes(a.id))
              .map((a) => ({ id: a.id, name: a.name, runtime: a.runtime }))
          : [];
      result.push({
        name: skill.name,
        description: skill.description,
        source: skill.source,
        usedBy,
      });
    }
    return result;
  });

  // POST /api/skills/refresh —— 重扫目录刷新内存索引
  app.post('/api/skills/refresh', async () => {
    scanSkills();
    return { ok: true };
  });

  // GET /api/agents/:id/skills —— 已分配 skillId（R1：过滤悬空，skillIndex 不存在的跳过）
  app.get('/api/agents/:id/skills', async (req) => {
    const { id } = req.params as { id: string };
    const index = getSkillIndex();
    const rows = db.select().from(agentSkills).where(eq(agentSkills.agentId, id)).all();
    return rows.filter((r) => index.has(r.skillId)).map((r) => r.skillId);
  });

  // PUT /api/agents/:id/skills —— 整体替换分配（delete + insert，spec §4）
  // 不校验 skillId 是否存在（R1：允许存悬空引用，文件系统可能稍后恢复）
  app.put('/api/agents/:id/skills', async (req) => {
    const { id } = req.params as { id: string };
    const { skillIds } = req.body as { skillIds: string[] };
    db.delete(agentSkills).where(eq(agentSkills.agentId, id)).run();
    if (skillIds.length > 0) {
      db.insert(agentSkills)
        .values(skillIds.map((sid) => ({ agentId: id, skillId: sid })))
        .run();
    }
    return { ok: true };
  });

  // GET /api/agents/:id/mcp —— MCP 配置 JSON 字符串
  app.get('/api/agents/:id/mcp', async (req) => {
    const { id } = req.params as { id: string };
    const agent = db.select().from(agents).where(eq(agents.id, id)).get();
    return { mcpServers: agent?.mcpServers ?? null };
  });

  // PUT /api/agents/:id/mcp —— 更新 MCP 配置（body: { mcpServers: string | null }）
  app.put('/api/agents/:id/mcp', async (req) => {
    const { id } = req.params as { id: string };
    const { mcpServers } = req.body as { mcpServers: string | null };
    db.update(agents).set({ mcpServers }).where(eq(agents.id, id)).run();
    return { ok: true };
  });
}
