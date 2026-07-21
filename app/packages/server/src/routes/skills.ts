import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ImportLocalSkillsInput,
  ImportSkillFromUrlInput,
  ScanLocalSkillsInput,
} from '@ma/shared';
import { db } from '../db/client.js';
import { agents, agentSkills } from '../db/schema.js';
import {
  getSkillIndex,
  importLocalSkill,
  listImportCandidates,
  listSkillDestinations,
  projectSkillsDir,
  scanSkills,
  userSkillsDir,
} from '../skill/scanner.js';
import { importSkillFromUrl } from '../skill/import-url.js';

// skillRoutes —— skill 目录索引 + agent 分配 + MCP 配置（spec §4）。
// GET  /api/skills              内存索引列表（含 usedBy 反查 agent_skill）
// POST /api/skills/refresh      重扫目录刷新索引
// POST /api/skills/scan-local   扫描本机路径列出可导入 skill（Multica import 本地版）
// POST /api/skills/import-local 写入 <cwd>/.skills 或 ~/.multi-agent/skills
// POST /api/skills/import-url   URL 下载到本地 skill 目录（github/skills.sh/clawhub）
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
        projectId: skill.projectId ?? null,
        projectTitle: skill.projectTitle ?? null,
        usedBy,
      });
    }
    // 名称稳定排序（Multica 列表默认可读）
    result.sort((a, b) => a.name.localeCompare(b.name));
    return result;
  });

  // GET /api/skills/:name —— 详情（body + path + usedBy）
  app.get('/api/skills/:name', async (req, reply) => {
    const { name: rawName } = req.params as { name: string };
    const name = decodeURIComponent(rawName);
    const index = getSkillIndex();
    const skill = index.get(name);
    if (!skill) return reply.status(404).send({ error: 'skill 不存在' });
    const allAssigns = db.select().from(agentSkills).all();
    const allAgents = db.select().from(agents).all();
    const assignedAgentIds = allAssigns
      .filter((a) => a.skillId === skill.name)
      .map((a) => a.agentId);
    const usedBy =
      assignedAgentIds.length > 0
        ? allAgents
            .filter((a) => assignedAgentIds.includes(a.id))
            .map((a) => ({ id: a.id, name: a.name, runtime: a.runtime }))
        : [];
    return {
      name: skill.name,
      description: skill.description,
      source: skill.source,
      projectId: skill.projectId ?? null,
      projectTitle: skill.projectTitle ?? null,
      body: skill.body,
      path: skill.path,
      usedBy,
    };
  });

  // POST /api/skills/refresh —— 重扫目录刷新内存索引
  app.post('/api/skills/refresh', async () => {
    scanSkills();
    return { ok: true };
  });

  // POST /api/skills/scan-local —— 扫描本机目录/文件，列导入候选
  app.post('/api/skills/scan-local', async (req, reply) => {
    const parsed = ScanLocalSkillsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    // 确保索引最新，便于 alreadyIndexed
    scanSkills();
    const scanned = listImportCandidates(parsed.data.path);
    return {
      path: scanned.path,
      candidates: scanned.candidates,
      projectSkillsDir: projectSkillsDir(),
      userSkillsDir: userSkillsDir(),
      destinations: listSkillDestinations(),
      error: scanned.error,
    };
  });

  // POST /api/skills/import-local —— 批量导入到本地 skill 目录
  app.post('/api/skills/import-local', async (req, reply) => {
    const parsed = ImportLocalSkillsInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    const { target, projectId, items } = parsed.data;
    if (target === 'project' && !projectId?.trim()) {
      return reply.status(400).send({
        error: 'target=project 时需要 projectId（或改用 user / workspace）',
      });
    }
    const results = items.map((item) =>
      importLocalSkill({
        sourcePath: item.sourcePath,
        name: item.name,
        description: item.description,
        target,
        projectId,
        overwrite: item.overwrite,
      }),
    );
    return {
      results,
      projectSkillsDir: projectSkillsDir(),
      userSkillsDir: userSkillsDir(),
      destinations: listSkillDestinations(),
    };
  });

  // POST /api/skills/import-url —— 从 URL 下载并写入本地 skill 目录（非云端）
  app.post('/api/skills/import-url', async (req, reply) => {
    const parsed = ImportSkillFromUrlInput.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: parsed.error.flatten() });
    }
    if (parsed.data.target === 'project' && !parsed.data.projectId?.trim()) {
      return reply.status(400).send({
        error: 'target=project 时需要 projectId（或改用 user / workspace）',
      });
    }
    const result = await importSkillFromUrl({
      url: parsed.data.url,
      target: parsed.data.target,
      projectId: parsed.data.projectId,
      overwrite: parsed.data.overwrite,
      name: parsed.data.name,
    });
    const body = {
      ...result,
      projectSkillsDir: projectSkillsDir(),
      userSkillsDir: userSkillsDir(),
      destinations: listSkillDestinations(),
    };
    if (result.status === 'failed') {
      return reply.status(400).send(body);
    }
    return body;
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
