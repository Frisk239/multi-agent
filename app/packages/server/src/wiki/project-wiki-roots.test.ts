import { describe, expect, it } from 'vitest';
import { mapProjectsToWikiRoots } from './project-wiki-roots.js';

describe('mapProjectsToWikiRoots', () => {
  it('skips projects without localPath', () => {
    expect(
      mapProjectsToWikiRoots([
        { id: 'p1', name: 'A', localPath: null },
        { id: 'p2', name: 'B', localPath: '' },
      ]),
    ).toEqual([]);
  });

  it('maps absolute localPath to wiki child', () => {
    const rows = mapProjectsToWikiRoots([
      { id: 'p1', name: 'App', localPath: 'D:\\code\\demo' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.projectId).toBe('p1');
    expect(rows[0]!.wikiPath.replace(/\\/g, '/')).toMatch(/demo[/\\]wiki$/i);
  });
});
