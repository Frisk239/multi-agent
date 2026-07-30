import { describe, expect, it } from 'vitest';
import {
  G_CHORD_ROUTES,
  NARROW_SIDEBAR_MAX_PX,
  getShortcutHelpGroups,
  isGChordKey,
  resolveGChordRoute,
} from './shortcuts';

describe('NARROW_SIDEBAR_MAX_PX', () => {
  it('nails closeout threshold at 900', () => {
    expect(NARROW_SIDEBAR_MAX_PX).toBe(900);
  });
});

describe('resolveGChordRoute', () => {
  it('maps slice53 g-chords (chat / agents / wiki)', () => {
    expect(resolveGChordRoute('c')).toBe('/chat');
    expect(resolveGChordRoute('a')).toBe('/agents');
    expect(resolveGChordRoute('w')).toBe('/wiki');
  });

  it('maps legacy g-chords (issues / inbox / runs / settings)', () => {
    expect(resolveGChordRoute('i')).toBe('/');
    expect(resolveGChordRoute('n')).toBe('/inbox');
    expect(resolveGChordRoute('r')).toBe('/runs');
    expect(resolveGChordRoute('s')).toBe('/settings');
  });

  it('maps squads / memory / projects g-chords', () => {
    expect(resolveGChordRoute('q')).toBe('/squads');
    expect(resolveGChordRoute('m')).toBe('/memory');
    expect(resolveGChordRoute('p')).toBe('/projects');
  });

  it('is case-insensitive', () => {
    expect(resolveGChordRoute('C')).toBe('/chat');
    expect(resolveGChordRoute('A')).toBe('/agents');
  });

  it('returns null for empty / unknown', () => {
    expect(resolveGChordRoute('')).toBeNull();
    expect(resolveGChordRoute('z')).toBeNull();
    expect(resolveGChordRoute('x')).toBeNull();
  });

  it('G_CHORD_ROUTES table stays aligned with resolver', () => {
    for (const [k, route] of Object.entries(G_CHORD_ROUTES)) {
      expect(resolveGChordRoute(k)).toBe(route);
    }
  });
});

describe('isGChordKey', () => {
  it('true for known keys only', () => {
    expect(isGChordKey('c')).toBe(true);
    expect(isGChordKey('a')).toBe(true);
    expect(isGChordKey('z')).toBe(false);
  });
});

describe('getShortcutHelpGroups', () => {
  it('documents g c / g a / g w and squads/memory/projects in Navigation', () => {
    const groups = getShortcutHelpGroups();
    const nav = groups.find((g) => g.category.startsWith('导航'));
    expect(nav).toBeTruthy();
    const labels = (nav?.items ?? []).map((i) => i.label).join(' | ');
    expect(labels).toMatch(/Chat/i);
    expect(labels).toMatch(/Agents/i);
    expect(labels).toMatch(/Wiki/i);
    expect(labels).toMatch(/Squads/i);
    expect(labels).toMatch(/Memory/i);
    expect(labels).toMatch(/Projects/i);

    const chordKeys = (nav?.items ?? []).map((i) => i.keys.join(''));
    expect(chordKeys).toContain('gc');
    expect(chordKeys).toContain('ga');
    expect(chordKeys).toContain('gw');
    expect(chordKeys).toContain('gq');
    expect(chordKeys).toContain('gm');
    expect(chordKeys).toContain('gp');
  });
});
