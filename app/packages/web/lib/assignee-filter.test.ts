import { describe, expect, it } from 'vitest';
import { filterAssigneeOptions, matchesAssigneeQuery } from './assignee-filter';

const agents = [
  { id: 'ag-alpha', name: '前端小助手', runtime: 'claude-code' },
  { id: 'ag-beta', name: 'Backend Bot', runtime: 'opencode' },
  { id: 'ag-gamma', name: '文档整理', runtime: 'cursor' },
];
const squads = [
  { id: 'sq-prod', name: '产品小队', leaderId: 'ag-alpha' },
  { id: 'sq-infra', name: 'Infra Squad', leaderId: 'ag-beta' },
];

describe('matchesAssigneeQuery', () => {
  it('空查询命中一切', () => {
    expect(matchesAssigneeQuery(agents[0]!, '')).toBe(true);
    expect(matchesAssigneeQuery(agents[0]!, '   ')).toBe(true);
    expect(matchesAssigneeQuery(agents[0]!, null)).toBe(true);
    expect(matchesAssigneeQuery(agents[0]!, undefined)).toBe(true);
  });

  it('按名称命中，大小写不敏感', () => {
    expect(matchesAssigneeQuery(agents[1]!, 'backend')).toBe(true);
    expect(matchesAssigneeQuery(agents[1]!, 'BACKEND')).toBe(true);
    expect(matchesAssigneeQuery(agents[1]!, 'bot')).toBe(true);
  });

  it('按 ID 命中', () => {
    expect(matchesAssigneeQuery(agents[2]!, 'ag-gamma')).toBe(true);
    expect(matchesAssigneeQuery(agents[2]!, 'gamma')).toBe(true);
  });

  it('支持中文名搜索', () => {
    expect(matchesAssigneeQuery(agents[0]!, '前端')).toBe(true);
    expect(matchesAssigneeQuery(agents[2]!, '文档')).toBe(true);
  });

  it('不命中就是不命中', () => {
    expect(matchesAssigneeQuery(agents[0]!, 'zzz')).toBe(false);
  });
});

describe('filterAssigneeOptions', () => {
  it('无查询时两组原样返回', () => {
    const r = filterAssigneeOptions({ agents, squads, query: '' });
    expect(r.agents).toHaveLength(3);
    expect(r.squads).toHaveLength(2);
    expect(r.isFiltering).toBe(false);
    expect(r.isEmpty).toBe(false);
  });

  it('只保留命中的 agent，squad 不受牵连', () => {
    const r = filterAssigneeOptions({ agents, squads, query: 'backend' });
    expect(r.agents.map((a) => a.id)).toEqual(['ag-beta']);
    expect(r.squads).toHaveLength(0);
    expect(r.isFiltering).toBe(true);
    expect(r.isEmpty).toBe(false);
  });

  it('查询可同时命中两组', () => {
    const r = filterAssigneeOptions({ agents, squads, query: 'infra' });
    expect(r.agents).toHaveLength(0);
    expect(r.squads.map((s) => s.id)).toEqual(['sq-infra']);
  });

  // 这条最关键：原生 select 的 value 不在 options 里会被浏览器回退显示成第一项，
  // 用户会以为指派被悄悄改了
  it('当前已选 agent 即使不匹配查询也必须保留', () => {
    const r = filterAssigneeOptions({
      agents,
      squads,
      query: 'zzz-nothing',
      currentValue: 'agent:ag-alpha',
    });
    expect(r.agents.map((a) => a.id)).toEqual(['ag-alpha']);
    // 但仍要告诉 UI「搜索没命中」
    expect(r.isEmpty).toBe(true);
  });

  it('当前已选 squad 即使不匹配查询也必须保留', () => {
    const r = filterAssigneeOptions({
      agents,
      squads,
      query: 'zzz-nothing',
      currentValue: 'squad:sq-prod',
    });
    expect(r.squads.map((s) => s.id)).toEqual(['sq-prod']);
    expect(r.isEmpty).toBe(true);
  });

  it('未指派状态下搜不到就是两组皆空', () => {
    const r = filterAssigneeOptions({
      agents,
      squads,
      query: 'zzz-nothing',
      currentValue: '',
    });
    expect(r.agents).toHaveLength(0);
    expect(r.squads).toHaveLength(0);
    expect(r.isEmpty).toBe(true);
  });

  it('不修改传入数组', () => {
    const a = [...agents];
    const s = [...squads];
    filterAssigneeOptions({ agents: a, squads: s, query: 'backend' });
    expect(a).toHaveLength(3);
    expect(s).toHaveLength(2);
  });
});
