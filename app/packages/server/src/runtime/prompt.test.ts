import { describe, it, expect } from 'vitest';
import {
  assembleIssuePromptParts,
  buildDynamicUserParts,
  buildStaticSystemParts,
  composePrompt,
  joinPromptSections,
  PROMPT_PART_SEPARATOR,
  type PromptParts,
} from './prompt.js';

describe('Slice 43 · Prompt static/dynamic boundary', () => {
  const staticShared = {
    skillBlock: '## Skill: tdd\nWrite tests first.',
    aboutBlock: '# About the Human Operator\nName: 林远\nPrefers short answers.',
    instructionsBlock: '# Agent Instructions\nBe concise.',
    boundaryBlock:
      '<boundary-fence>\n提示性修改路径白名单: D:/code/multi-agent\n注意: 这是 prompt 约束，不是文件系统沙箱；请勿修改、删除或新建白名单路径之外的文件。\n</boundary-fence>',
    squadProtocolBlock:
      '# Squad Operating Protocol\nLead then hand off.\n\n# Squad Roster\n- helper — [@helper](mention://agent/a-helper)',
  };

  it('joinPromptSections uses fixed separator and drops empties', () => {
    expect(joinPromptSections(['a', '', null, '  b  ', undefined])).toBe(
      `a${PROMPT_PART_SEPARATOR}b`,
    );
  });

  it('buildStaticSystemParts order: skills → about → instructions → boundary → protocol', () => {
    const parts = buildStaticSystemParts(staticShared);
    expect(parts).toEqual([
      staticShared.skillBlock,
      staticShared.aboutBlock,
      staticShared.instructionsBlock,
      staticShared.boundaryBlock,
      staticShared.squadProtocolBlock,
    ]);
  });

  it('buildDynamicUserParts puts mission + issue + wiki + memory; not skills', () => {
    const parts = buildDynamicUserParts({
      missionBlock: '# Mission Directive\nShip slice 43',
      issueBody: 'Issue MA-1: Prompt static\n\nRecent comments:\n[user:u1] go',
      wikiBlock:
        '<retrieved-context kind="wiki" title="Wiki Context">\n# Project Wiki Snapshot\nw1\n</retrieved-context>',
      memoryBlock: '## Relevant Memories\n- mem-A',
    });
    expect(parts[0]).toContain('Mission Directive');
    expect(parts[1]).toContain('Issue MA-1');
    expect(parts.some((p) => p.includes('kind="wiki"'))).toBe(true);
    expect(parts.some((p) => p.includes('kind="memory"') && p.includes('mem-A'))).toBe(true);
    expect(parts.join('\n')).not.toContain('## Skill:');
  });

  it('same agent, two memories → staticSystem equal; dynamicUser differs', () => {
    const base = {
      ...staticShared,
      missionBlock: '# Mission Directive\nShip slice 43',
      issueBody: 'Issue MA-1: Prompt static\nDescription:\nD6 static system',
      wikiBlock:
        '<retrieved-context kind="wiki" title="Wiki Context">\n# Project AGENTS / Wiki Snapshot\nstable wiki\n</retrieved-context>',
    };

    const a: PromptParts = assembleIssuePromptParts({
      ...base,
      memoryBlock: '## Relevant Memories\n- memory-alpha: prefer hermes cache',
    });
    const b: PromptParts = assembleIssuePromptParts({
      ...base,
      memoryBlock: '## Relevant Memories\n- memory-beta: different retrieval hit',
    });

    expect(a.staticSystem).toBe(b.staticSystem);
    expect(a.staticSystem.length).toBeGreaterThan(0);
    expect(a.staticSystem).toContain('## Skill: tdd');
    expect(a.staticSystem).toContain('# Agent Instructions');
    expect(a.staticSystem).toContain('<boundary-fence>');
    expect(a.staticSystem).toContain('Squad Operating Protocol');
    expect(a.staticSystem).not.toContain('kind="memory"');
    expect(a.staticSystem).not.toContain('Issue MA-1');
    expect(a.staticSystem).not.toContain('Mission Directive');

    expect(a.dynamicUser).not.toBe(b.dynamicUser);
    expect(a.dynamicUser).toContain('memory-alpha');
    expect(b.dynamicUser).toContain('memory-beta');
    expect(a.dynamicUser).toContain('kind="memory"');
    expect(a.dynamicUser).toContain('Issue MA-1');
    expect(a.dynamicUser).toContain('Mission Directive');
    expect(a.dynamicUser).toContain('kind="wiki"');

    // compose keeps static as prefix of full prompt
    const fullA = composePrompt(a);
    const fullB = composePrompt(b);
    expect(fullA.startsWith(a.staticSystem)).toBe(true);
    expect(fullB.startsWith(b.staticSystem)).toBe(true);
    expect(fullA.startsWith(fullB.slice(0, a.staticSystem.length))).toBe(true);
    expect(fullA).not.toBe(fullB);
  });

  it('composePrompt is static then dynamic with separator', () => {
    const parts: PromptParts = {
      staticSystem: 'STATIC',
      dynamicUser: 'DYNAMIC',
    };
    expect(composePrompt(parts)).toBe(`STATIC${PROMPT_PART_SEPARATOR}DYNAMIC`);
  });
});
