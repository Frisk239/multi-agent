/**
 * S1 · 指派器搜索（纯函数，可单测）
 *
 * AssigneeSelect 原本是原生 <select> + <optgroup>：分组、readiness 禁用、键盘可达都已具备，
 * 唯一缺的是「名单一长就只能滚」。这里只补搜索，不碰 readiness 判定——那部分逻辑是本仓
 * 派活硬闸的一部分，不该被一次 UI 改动牵动。
 *
 * 关键约束：**当前已选项必须始终保留**。原生 select 的 value 若在 options 里不存在，
 * 浏览器会把显示回退成第一项，用户会以为指派被悄悄改掉了。
 */

export type AssigneeCandidate = {
  id: string;
  name: string;
};

/** 名称或 ID 命中（大小写不敏感、忽略首尾空白）。空查询命中一切。 */
export function matchesAssigneeQuery(
  candidate: AssigneeCandidate,
  query: string | null | undefined,
): boolean {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return true;
  return (
    candidate.name.toLowerCase().includes(q) ||
    candidate.id.toLowerCase().includes(q)
  );
}

export type FilterAssigneeInput<A extends AssigneeCandidate, S extends AssigneeCandidate> = {
  agents: readonly A[];
  squads: readonly S[];
  query: string | null | undefined;
  /** 形如 `agent:<id>` / `squad:<id>` / ''，用于强制保留当前选中项。 */
  currentValue?: string | null;
};

export type FilterAssigneeResult<A, S> = {
  agents: A[];
  squads: S[];
  /** 过滤后是否两组都空（供组件显示「无匹配」而不是一个空下拉）。 */
  isEmpty: boolean;
  /** 是否处于搜索态。 */
  isFiltering: boolean;
};

/**
 * 按查询过滤 agent / squad 两组，并强制保留当前已选项。
 */
export function filterAssigneeOptions<
  A extends AssigneeCandidate,
  S extends AssigneeCandidate,
>({
  agents,
  squads,
  query,
  currentValue,
}: FilterAssigneeInput<A, S>): FilterAssigneeResult<A, S> {
  const q = (query ?? '').trim();
  const isFiltering = q.length > 0;

  const currentAgentId =
    currentValue && currentValue.startsWith('agent:')
      ? currentValue.slice('agent:'.length)
      : null;
  const currentSquadId =
    currentValue && currentValue.startsWith('squad:')
      ? currentValue.slice('squad:'.length)
      : null;

  const keptAgents = agents.filter(
    (a) => a.id === currentAgentId || matchesAssigneeQuery(a, q),
  );
  const keptSquads = squads.filter(
    (s) => s.id === currentSquadId || matchesAssigneeQuery(s, q),
  );

  // isEmpty 只反映「搜索有没有命中」，不因为被强留的当前项而变成 false
  const matchedAgents = agents.filter((a) => matchesAssigneeQuery(a, q)).length;
  const matchedSquads = squads.filter((s) => matchesAssigneeQuery(s, q)).length;

  return {
    agents: keptAgents,
    squads: keptSquads,
    isEmpty: matchedAgents === 0 && matchedSquads === 0,
    isFiltering,
  };
}
