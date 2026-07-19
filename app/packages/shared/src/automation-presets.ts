/**
 * Multica Autopilot 模板画廊的本地对应（G15）。
 * 源：references/repos/multica/packages/views/autopilots/components/autopilots-page.tsx TEMPLATES
 * 本仓调度只有 interval_minutes | daily_at：weekdays/weekly 映射为 daily_at 或较长 interval。
 * 不建 webhook / 云触发。
 */

import type { AutomationScheduleKind } from './schema.js';

export type AutomationPresetId =
  | 'daily_news'
  | 'pr_review'
  | 'bug_triage'
  | 'weekly_progress'
  | 'dependency_audit'
  | 'documentation_check'
  | 'blank';

export type AutomationPreset = {
  id: AutomationPresetId;
  /** 画廊标题 */
  title: string;
  /** 一行摘要 */
  summary: string;
  /** 规则名称默认 */
  name: string;
  scheduleKind: AutomationScheduleKind;
  intervalMinutes: number | null;
  dailyTime: string | null;
  titleTemplate: string;
  bodyTemplate: string;
};

export const AUTOMATION_PRESETS: AutomationPreset[] = [
  {
    id: 'daily_news',
    title: '每日新闻摘要',
    summary: '搜索并汇总今天的新闻给团队',
    name: '每日新闻摘要',
    scheduleKind: 'daily_at',
    intervalMinutes: null,
    dailyTime: '09:00',
    titleTemplate: '每日新闻摘要 {{date}}',
    bodyTemplate: `请执行「每日新闻摘要」：
1. 仅检索今天发布的新闻与公告
2. 过滤与本团队/项目相关的主题
3. 每条写短摘要：标题、来源、要点
4. 汇总为一条 digest
5. 在本 Issue 评论发布 digest，并 @ 相关成员

创建时间：{{datetime}}`,
  },
  {
    id: 'pr_review',
    title: 'PR review 提醒',
    summary: '标记需要 review 的滞留 pull request',
    name: 'PR review 提醒',
    scheduleKind: 'daily_at',
    intervalMinutes: null,
    dailyTime: '10:00',
    titleTemplate: 'PR review 提醒 {{date}}',
    bodyTemplate: `请执行「PR review 提醒」：
1. 列出仓库中 open 的 PR
2. 标出超过 24h 仍无 review 的滞留 PR
3. 记录作者、龄期、一句话变更摘要
4. 在本 Issue 评论列出链接
5. 提醒团队 review

计划日：{{date}}`,
  },
  {
    id: 'bug_triage',
    title: 'Bug 分诊',
    summary: '评估并安排新提交的 bug',
    name: 'Bug 分诊',
    scheduleKind: 'daily_at',
    intervalMinutes: null,
    dailyTime: '09:00',
    titleTemplate: 'Bug 分诊 {{date}}',
    bodyTemplate: `请执行「Bug 分诊」：
1. 列出 triage / backlog 中尚未定优先级的问题
2. 阅读描述与日志/截图
3. 评估 severity（critical/high/medium/low）
4. 在 Issue 上写评估与建议下一步
5. 必要时调整优先级字段

触发：{{datetime}}`,
  },
  {
    id: 'weekly_progress',
    title: '每周进度报告',
    summary: '汇总团队本周进展',
    name: '每周进度报告',
    // 本地无 weekly cron：用每日 17:00，prompt 仍写「过去 7 天」
    scheduleKind: 'daily_at',
    intervalMinutes: null,
    dailyTime: '17:00',
    titleTemplate: '周报 {{date}}',
    bodyTemplate: `请执行「每周进度报告」：
1. 汇总过去 7 天 done 的 Issue
2. 汇总进行中的 Issue
3. 标出 blocked 与阻塞原因
4. 指标：关闭数 / 新建数 / 净变化
5. 结构：Completed / In Progress / Blocked / Metrics
6. 作为评论贴在本 Issue

周期起点参考：{{date}}`,
  },
  {
    id: 'dependency_audit',
    title: '依赖审计',
    summary: '扫描安全漏洞和过时的依赖包',
    name: '依赖审计',
    scheduleKind: 'daily_at',
    intervalMinutes: null,
    dailyTime: '08:00',
    titleTemplate: '依赖审计 {{date}}',
    bodyTemplate: `请执行「依赖审计」：
1. 对本仓库跑依赖审计（如 npm audit / 等价工具）
2. 标出已知漏洞包
3. 列出落后主版本过多的过时依赖
4. 每项注明 severity、包名、建议修复
5. 评论汇总可执行项

计划：{{datetime}}`,
  },
  {
    id: 'documentation_check',
    title: '文档检查',
    summary: '检查近期改动是否缺失文档',
    name: '文档检查',
    scheduleKind: 'daily_at',
    intervalMinutes: null,
    dailyTime: '14:00',
    titleTemplate: '文档检查 {{date}}',
    bodyTemplate: `请执行「文档检查」：
1. 查看近 7 天合并/提交的主要代码变更
2. 核对相关文档是否同步更新
3. 标出缺文档的新 API / 配置 / 功能
4. 列出缺口路径与建议补写内容
5. 评论发布发现

计划：{{date}}`,
  },
];

export function getAutomationPreset(id: string): AutomationPreset | undefined {
  return AUTOMATION_PRESETS.find((p) => p.id === id);
}
