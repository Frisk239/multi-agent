import { describe, it, expect, vi } from 'vitest';

vi.mock('./client.js', () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          get: vi.fn().mockReturnValue(null),
        }),
      }),
    }),
  },
}));

import { loadSquadDetail, getSquadLeaderId } from './squad-loader';

describe('squad-loader', () => {
  it('returns null when squad does not exist', () => {
    expect(loadSquadDetail('non-existent-squad')).toBeNull();
    expect(getSquadLeaderId('non-existent-squad')).toBeNull();
  });
});
