import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./toast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

import { useWsStore, useRunProgressStore } from './ws';

describe('ws Zustand stores', () => {
  beforeEach(() => {
    useWsStore.setState({ status: 'connecting' });
    useRunProgressStore.setState({
      byRunId: {},
      toolByRunId: {},
      partialByRunId: {},
      streamChunks: {},
    });
  });

  describe('useWsStore', () => {
    it('initializes with status connecting', () => {
      expect(useWsStore.getState().status).toBe('connecting');
    });

    it('updates status via setStatus', () => {
      useWsStore.getState().setStatus('open');
      expect(useWsStore.getState().status).toBe('open');

      useWsStore.getState().setStatus('closed');
      expect(useWsStore.getState().status).toBe('closed');
    });
  });

  describe('useRunProgressStore', () => {
    it('sets progress text truncated to 400 characters', () => {
      const runId = 'run-1';
      const longText = 'a'.repeat(500);

      useRunProgressStore.getState().setProgress(runId, longText);
      expect(useRunProgressStore.getState().byRunId[runId].length).toBe(400);
    });

    it('sets current active tool name truncated to 80 characters', () => {
      const runId = 'run-1';
      const toolName = 'very_long_tool_name_'.repeat(10);

      useRunProgressStore.getState().setTool(runId, toolName);
      expect(useRunProgressStore.getState().toolByRunId[runId].length).toBe(80);
    });

    it('appends partial assistant text correctly', () => {
      const runId = 'run-1';

      useRunProgressStore.getState().appendPartial(runId, 'First chunk');
      expect(useRunProgressStore.getState().partialByRunId[runId]).toBe('First chunk');

      useRunProgressStore.getState().appendPartial(runId, 'Second chunk');
      expect(useRunProgressStore.getState().partialByRunId[runId]).toBe('First chunk\n\nSecond chunk');
    });

    it('clears progress for a runId', () => {
      const runId = 'run-1';
      useRunProgressStore.getState().setProgress(runId, 'progress text');
      useRunProgressStore.getState().setTool(runId, 'read_file');
      useRunProgressStore.getState().appendPartial(runId, 'partial text');

      useRunProgressStore.getState().clearProgress(runId);

      expect(useRunProgressStore.getState().byRunId[runId]).toBeUndefined();
      expect(useRunProgressStore.getState().toolByRunId[runId]).toBeUndefined();
      expect(useRunProgressStore.getState().partialByRunId[runId]).toBeUndefined();
    });
  });
});
