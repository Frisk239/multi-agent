import { describe, expect, it } from 'vitest';
import { parseMentionChips, removeMentionFromBody } from './mention-chips';

describe('parseMentionChips', () => {
  it('returns empty for empty / plain text', () => {
    expect(parseMentionChips('')).toEqual([]);
    expect(parseMentionChips('hello world')).toEqual([]);
    expect(parseMentionChips('just @name without link')).toEqual([]);
  });

  it('parses agent + squad markdown mentions', () => {
    const body =
      '请 [@产品·调研](mention://agent/agt-research) 与 [@核心小队](mention://squad/sq-1) 协作';
    expect(parseMentionChips(body)).toEqual([
      {
        id: 'agt-research',
        kind: 'agent',
        label: '产品·调研',
        raw: '[@产品·调研](mention://agent/agt-research)',
      },
      {
        id: 'sq-1',
        kind: 'squad',
        label: '核心小队',
        raw: '[@核心小队](mention://squad/sq-1)',
      },
    ]);
  });

  it('dedupes same kind+id keeping first label/raw', () => {
    const body =
      '[@A](mention://agent/a1) then [@A-again](mention://agent/a1) and [@S](mention://squad/s1)';
    const chips = parseMentionChips(body);
    expect(chips).toHaveLength(2);
    expect(chips[0]).toMatchObject({ id: 'a1', kind: 'agent', label: 'A' });
    expect(chips[1]).toMatchObject({ id: 's1', kind: 'squad', label: 'S' });
  });

  it('allows same id across different kinds', () => {
    const body =
      '[@AgentX](mention://agent/shared) [@SquadX](mention://squad/shared)';
    const chips = parseMentionChips(body);
    expect(chips).toHaveLength(2);
    expect(chips.map((c) => c.kind)).toEqual(['agent', 'squad']);
  });
});

describe('removeMentionFromBody', () => {
  it('removes matching markdown mention by id', () => {
    const body =
      'hi [@产品·调研](mention://agent/agt-research) please start';
    expect(removeMentionFromBody(body, 'agt-research')).toBe(
      'hi please start',
    );
  });

  it('removes all occurrences of that id (agent or squad)', () => {
    const body =
      '[@A](mention://agent/x1) mid [@A2](mention://agent/x1) end [@S](mention://squad/x1)';
    const next = removeMentionFromBody(body, 'x1');
    expect(next).not.toContain('mention://');
    expect(next).toBe('mid end');
  });

  it('leaves other mentions intact', () => {
    const body =
      '[@Keep](mention://agent/keep-1) [@Drop](mention://agent/drop-1) ok';
    expect(removeMentionFromBody(body, 'drop-1')).toBe(
      '[@Keep](mention://agent/keep-1) ok',
    );
  });

  it('no-ops on empty id / missing mention', () => {
    const body = '[@A](mention://agent/a1)';
    expect(removeMentionFromBody(body, '')).toBe(body);
    expect(removeMentionFromBody(body, 'missing')).toBe(body);
  });

  it('roundtrip: parse → remove each → empty of mentions', () => {
    let body =
      'cc [@Alice](mention://agent/alice) [@Team](mention://squad/team) done';
    const chips = parseMentionChips(body);
    expect(chips).toHaveLength(2);
    for (const c of chips) {
      body = removeMentionFromBody(body, c.id);
    }
    expect(parseMentionChips(body)).toEqual([]);
    expect(body).toBe('cc done');
  });
});
