import { describe, it, expect } from 'vitest';
import { generateSlug } from './slug';

describe('generateSlug', () => {
  it('combines identifier and formatted title', () => {
    const slug = generateSlug('FRI-01', 'Memory Retrieval Panel');
    expect(slug).toBe('FRI-01-Memory-Retrieval-Panel');
  });

  it('replaces spaces with hyphens', () => {
    const slug = generateSlug('DOC', 'Multi Agent Orchestration Console');
    expect(slug).toBe('DOC-Multi-Agent-Orchestration-Console');
  });

  it('removes dangerous filesystem characters', () => {
    const slug = generateSlug('FRI-02', 'Feature: /path\\to:*?"<>|file');
    expect(slug).toBe('FRI-02-Feature-pathtofile');
  });

  it('preserves Chinese characters while cleaning invalid symbols', () => {
    const slug = generateSlug('FRI-04', 'Memory 检索面板 mock（Should）');
    expect(slug).toBe('FRI-04-Memory-检索面板-mock（Should）');
  });

  it('truncates long titles to 60 characters for slug safety', () => {
    const longTitle = 'A'.repeat(100);
    const slug = generateSlug('ID', longTitle);
    expect(slug).toBe(`ID-${'A'.repeat(60)}`);
  });

  it('handles empty title gracefully', () => {
    const slug = generateSlug('FRI-99', '');
    expect(slug).toBe('FRI-99-');
  });
});
