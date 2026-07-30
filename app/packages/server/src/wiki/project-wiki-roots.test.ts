import { describe, expect, it } from 'vitest';
import { mapProjectsToWikiRoots } from './project-wiki-roots.js';

describe('mapProjectsToWikiRoots', () => {
  it('skips projects without localPath', () => {
    expect(
      mapProjectsToWikiRoots([
        { id: 'p1', title: 'A', localPath: null },
        { id: 'p2', title: 'B', localPath: '' },
      ]),
    ).toEqual([]);
  });

  it('maps absolute localPath to wiki child using title', () => {
    const rows = mapProjectsToWikiRoots([
      { id: 'p1', title: 'App', localPath: 'D:\\code\\demo' },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.projectId).toBe('p1');
    expect(rows[0]!.projectName).toBe('App');
    expect(rows[0]!.wikiPath.replace(/\\/g, '/')).toMatch(/demo[/\\]wiki$/i);
  });
});
