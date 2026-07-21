import { eq } from 'drizzle-orm';
import { db } from './client.js';
import {
  workspaces,
  users,
  agents,
  squads,
  squadMembers,
  agentSkills,
  issues,
  comments,
  issueLabels,
  issueToLabels,
} from './schema.js';
import type { IssueStatus, Priority, AssigneeType } from '@ma/shared';
import { LOCAL_MEMBER } from '../local-member.js';

// spec §3.4 position 策略（R3）：seed 全设 position=0，依赖 created_at DESC 兜底排序
// 插入顺序 = 期望显示顺序（同一 status 的 issue 后插入排后面）

const NOW = Date.now();
const WS_ID = 'ws-local';

// 基础数据（照 seed.js）
db.insert(workspaces)
  .values({ id: WS_ID, name: '毕设 Multi-Agent', description: '本地单用户编排控制台', createdAt: NOW })
  .run();

db.insert(users)
  .values({ id: LOCAL_MEMBER.id, name: LOCAL_MEMBER.name, email: 'linyuan@example.com', createdAt: NOW })
  .run();

db.insert(agents)
  .values([
    { id: 'agt-lead', name: '产品·策划队长', category: '产品', runtime: 'opencode', model: 'opencode/big-pickle', concurrency: 6, createdAt: NOW },
    { id: 'agt-research', name: '产品·调研与洞察官', category: '产品', runtime: 'opencode', model: 'opencode/big-pickle', concurrency: 4, createdAt: NOW },
    { id: 'agt-prd', name: '产品·需求与PRD官', category: '产品', runtime: 'opencode', model: 'opencode/big-pickle', concurrency: 4, createdAt: NOW },
    { id: 'agt-proto', name: '产品·设计·原型官', category: '产品', runtime: 'opencode', model: 'opencode/big-pickle', concurrency: 6, createdAt: NOW },
  ])
  .run();

db.insert(squads)
  .values([
    {
      id: 'sqd-product',
      name: '产品小队',
      leaderId: 'agt-lead',
      operatingProtocol: '1. 队长接收 Issue briefing\n2. 按专精 @mention 委派\n3. 成员回帖交付物路径\n4. 队长汇总后请求 MVP 签核',
      missionDirective: '基于 chanpin 真源产出 PRD + RTM + 可交互原型，Must 路径可点通。',
      createdAt: NOW,
    },
    {
      id: 'sqd-philosophy',
      name: '哲学与人文研究小队',
      leaderId: 'agt-lead',
      operatingProtocol: '文献综述 → 论点提炼 → 答辩材料。',
      missionDirective: '人文类课题调研与写作支持。',
      createdAt: NOW,
    },
    {
      id: 'sqd-eco',
      name: '生态研究团队',
      leaderId: 'agt-prd',
      operatingProtocol: '数据采集 → 分析 → 可视化报告。',
      missionDirective: '生态监测与数据分析 mock 小队。',
      createdAt: NOW,
    },
  ])
  .run();

// S05：skill 分配关系（照 seed.js agent.skillIds，skill name 对应 .skills/ 目录名）
// skill 本身不进 DB（文件系统真源 + 内存索引），这里只存分配关系
db.insert(agentSkills)
  .values([
    { agentId: 'agt-lead', skillId: 'multica-squads' },
    { agentId: 'agt-research', skillId: 'extract-prototype-requirements' },
    { agentId: 'agt-prd', skillId: 'prd-writer' },
    { agentId: 'agt-prd', skillId: 'extract-prototype-requirements' },
    { agentId: 'agt-proto', skillId: 'frontend-design' },
    { agentId: 'agt-proto', skillId: 'design-system' },
  ])
  .run();

// S04：squad_member 成员关系（照 seed.js memberIds）
db.insert(squadMembers)
  .values([
    { squadId: 'sqd-product', agentId: 'agt-research' },
    { squadId: 'sqd-product', agentId: 'agt-prd' },
    { squadId: 'sqd-product', agentId: 'agt-proto' },
    { squadId: 'sqd-philosophy', agentId: 'agt-research' },
    { squadId: 'sqd-eco', agentId: 'agt-research' },
    { squadId: 'sqd-eco', agentId: 'agt-proto' },
  ])
  .run();

// seed issues（照 spec §3.4 表，position 全 0，createdAt 递增保证列内顺序）
// 注意：seed.js 的 planning 在此映射成 backlog（spec D1）
let seq = 0;
const ts = () => NOW + seq++; // 递增 timestamp

const seedIssues: {
  identifier: string;
  title: string;
  status: IssueStatus;
  priority: Priority;
  assigneeType: AssigneeType | null;
  assigneeId: string | null;
  description: string;
}[] = [
  { identifier: 'FRI-11', title: '毕设 multi-agent：产出 PRD 与可交互原型', status: 'in_review', priority: 'high', assigneeType: 'squad', assigneeId: 'sqd-product', description: '读取 D:\\code\\multi-agent 调研资料，在 chanpin 目录交付 PRD、RTM 与可交互原型。' },
  { identifier: 'FRI-10', title: '竞品矩阵与 Multica 功能对标', status: 'done', priority: 'medium', assigneeType: 'agent', assigneeId: 'agt-research', description: '5 家竞品 + 2×2 定位图，Must 对齐 brief。' },
  { identifier: 'FRI-09', title: 'PRD 真源与 RTM 32 条 Must REQ', status: 'in_progress', priority: 'high', assigneeType: 'agent', assigneeId: 'agt-prd', description: 'docs/prd/multi-agent-platform.md + RTM + handoff。' },
  { identifier: 'FRI-08', title: 'Wiki 架构占位与 llm-wiki-pattern 对齐', status: 'backlog', priority: 'medium', assigneeType: null, assigneeId: null, description: '5 页 mock：Home / Architecture / Synthesis / Sprint Log / Glossary。' },
  { identifier: 'FRI-07', title: 'Agent runtime 适配调研（Pi / Claude / opencode）', status: 'todo', priority: 'low', assigneeType: 'agent', assigneeId: 'agt-lead', description: 'Cursor 仅 UI mock，Phase 1 实装 TBD。' },
  { identifier: 'FRI-06', title: 'Skill URL 导入 UX 走查', status: 'done', priority: 'low', assigneeType: 'agent', assigneeId: 'agt-proto', description: 'GitHub URL 导入 + Agent 分配 checkbox。' },
  { identifier: 'FRI-05', title: '答辩 Demo Script 排练（≤10 min）', status: 'todo', priority: 'high', assigneeType: 'squad', assigneeId: 'sqd-product', description: '5 步 demo + 差异化一句话。' },
  { identifier: 'FRI-04', title: 'Memory 检索面板 mock（Should）', status: 'backlog', priority: 'low', assigneeType: null, assigneeId: null, description: 'Phase 2+ 可插拔 Memory，MVP 仅占位。' },
];

for (const iss of seedIssues) {
  db.insert(issues)
    .values({
      id: crypto.randomUUID(),
      workspaceId: WS_ID,
      identifier: iss.identifier,
      title: iss.title,
      description: iss.description,
      status: iss.status,
      priority: iss.priority,
      assigneeType: iss.assigneeType,
      assigneeId: iss.assigneeId,
      creatorType: 'member',
      creatorId: LOCAL_MEMBER.id,
      position: 0, // R3：全 0，依赖 createdAt DESC
      createdAt: ts(),
      updatedAt: ts(),
    })
    .run();
}

// 原型 seed.js 时间线（按 identifier 挂靠；issue.id 每次 seed 新 UUID）
type SeedComment = {
  identifier: string;
  authorType: 'member' | 'agent';
  authorId: string;
  body: string;
  createdAt: number; // ms
};

const seedComments: SeedComment[] = [
  {
    identifier: 'FRI-11',
    authorType: 'member',
    authorId: LOCAL_MEMBER.id,
    body: '请基于调研写 PRD，并派原型官做可点击 demo。',
    createdAt: Date.parse('2026-07-08T05:53:00Z'),
  },
  {
    identifier: 'FRI-11',
    authorType: 'agent',
    authorId: 'agt-lead',
    body: `## Operating Protocol

本 Issue 由产品小队承接。Roster：[@产品·调研与洞察官](mention://agent/agt-research)、[@产品·需求与PRD官](mention://agent/agt-prd)、[@产品·设计·原型官](mention://agent/agt-proto)

[@产品·调研与洞察官](mention://agent/agt-research) 请先完成 research/ 交付，再串 PRD → 原型。`,
    createdAt: Date.parse('2026-07-08T05:55:00Z'),
  },
  {
    identifier: 'FRI-11',
    authorType: 'agent',
    authorId: 'agt-research',
    body: 'research/ 已交付：persona、JTBD、竞品矩阵、Multica 对标表。',
    createdAt: Date.parse('2026-07-08T05:58:00Z'),
  },
  {
    identifier: 'FRI-10',
    authorType: 'agent',
    authorId: 'agt-research',
    body: 'competitive-analysis.md 与 multica-feature-matrix.md 已写入 research/。',
    createdAt: Date.parse('2026-07-08T05:50:00Z'),
  },
  {
    identifier: 'FRI-09',
    authorType: 'member',
    authorId: LOCAL_MEMBER.id,
    body: 'Open Questions 需在 PRD 内拍板：暗色、Wiki 5 页、Cursor mock。',
    createdAt: Date.parse('2026-07-08T05:59:00Z'),
  },
  {
    identifier: 'FRI-09',
    authorType: 'agent',
    authorId: 'agt-prd',
    body: 'PRD v1.0 已交付，RTM 覆盖 ISS/SQD/AGT/SKL/NAV/WIK 全 Must 域。',
    createdAt: Date.parse('2026-07-08T06:05:00Z'),
  },
];

let commentCount = 0;
for (const c of seedComments) {
  const issue = db.select().from(issues).where(eq(issues.identifier, c.identifier)).get();
  if (!issue) {
    console.warn(`⚠ seed comment 跳过：找不到 issue ${c.identifier}`);
    continue;
  }
  db.insert(comments)
    .values({
      id: crypto.randomUUID(),
      issueId: issue.id,
      type: 'comment',
      authorType: c.authorType,
      authorId: c.authorId,
      body: c.body,
      createdAt: c.createdAt,
    })
    .run();
  commentCount++;
}

// issue-labels：预置目录 + 挂样例
const seedLabelDefs: { id: string; name: string; color: string }[] = [
  { id: 'lbl-bug', name: 'bug', color: '#ef4444' },
  { id: 'lbl-docs', name: '文档', color: '#3b82f6' },
  { id: 'lbl-product', name: '产品', color: '#8b5cf6' },
];
const labelNow = Date.now();
for (const lab of seedLabelDefs) {
  db.insert(issueLabels)
    .values({
      id: lab.id,
      workspaceId: WS_ID,
      name: lab.name,
      color: lab.color,
      archivedAt: null,
      createdAt: labelNow,
      updatedAt: labelNow,
    })
    .run();
  }

const fri11 = db.select().from(issues).where(eq(issues.identifier, 'FRI-11')).get();
const fri09 = db.select().from(issues).where(eq(issues.identifier, 'FRI-09')).get();
const fri08 = db.select().from(issues).where(eq(issues.identifier, 'FRI-08')).get();
if (fri11) {
  db.insert(issueToLabels)
    .values([
      { issueId: fri11.id, labelId: 'lbl-product' },
      { issueId: fri11.id, labelId: 'lbl-docs' },
    ])
    .run();
}
if (fri09) {
  db.insert(issueToLabels).values({ issueId: fri09.id, labelId: 'lbl-product' }).run();
}
if (fri08) {
  db.insert(issueToLabels).values({ issueId: fri08.id, labelId: 'lbl-docs' }).run();
}

console.log(
  `✓ seed 完成：${seedIssues.length} 条 issue，${commentCount} 条 comment，${seedLabelDefs.length} 条 label`,
);

