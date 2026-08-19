import { describe, expect, it } from 'vitest';
import {
  MAX_HELD_SECRET_CHARS,
  REDACTED_SECRET,
  scrubAndTruncateToolResult,
  scrubSecrets,
  scrubSecretValue,
  StreamSecretScrubber,
} from './secret-scrubber.js';

// Intentionally synthetic format-only fixtures; none are usable credentials.
const fakeBearer = 'g8_bearer_fixture_1234567890';
const fakeSk = 'sk-g8fixtureabcdefghijklmnopqrstuv';
const fakeSkOr = 'sk-or-g8fixtureabcdefghijklmnopqrstuv';
const fakeAws = 'AKIA0000000000000000';
const fakeAssigned = 'g8_assigned_fixture_1234567890';

describe('secret-scrubber', () => {
  it('replaces only high-confidence credential shapes with one stable placeholder', () => {
    const input = [
      `Authorization: Bearer ${fakeBearer}`,
      fakeSk,
      fakeSkOr,
      fakeAws,
      `api_key=${fakeAssigned}`,
      `"password": "${fakeAssigned}"`,
    ].join('\n');

    const output = scrubSecrets(input);
    for (const raw of [fakeBearer, fakeSk, fakeSkOr, fakeAws, fakeAssigned]) {
      expect(output).not.toContain(raw);
    }
    expect(output.match(/\[redacted\]/g)?.length).toBeGreaterThanOrEqual(6);
    expect(output).not.toContain('1234567890');
  });

  it('leaves short sk text, code references, and ordinary URL paths intact', () => {
    const ordinary = [
      'const shortPrefix = "sk";',
      'const token = process.env.API_TOKEN;',
      'const api_key = getConfiguredKey();',
      'https://example.test/docs/sk-or-format-not-a-credential',
    ].join('\n');

    expect(scrubSecrets(ordinary)).toBe(ordinary);
  });

  it('still redacts a high-confidence secret assignment in a URL query', () => {
    const input = `https://example.test/callback?api_key=${fakeAssigned}`;
    const output = scrubSecrets(input);
    expect(output).toBe('https://example.test/callback?api_key=[redacted]');
    expect(output).not.toContain(fakeAssigned);
  });

  it('redacts access_token assignment variants in free text, not only structured tool values', () => {
    for (const field of ['access_token', 'access-token', 'accessToken']) {
      const output = scrubSecrets(`${field}=${fakeAssigned}`);
      expect(output).toBe(`${field}=[redacted]`);
      expect(output).not.toContain(fakeAssigned);
    }
  });

  it('recursively clones structured tool data without mutating the runtime object', () => {
    const source = {
      headers: { Authorization: `Bearer ${fakeBearer}` },
      nested: [{ api_key: fakeAssigned }, { aws: fakeAws }],
    };

    const scrubbed = scrubSecretValue(source);
    expect(scrubbed).not.toBe(source);
    expect(scrubbed.headers).not.toBe(source.headers);
    expect(JSON.stringify(scrubbed)).not.toContain(fakeBearer);
    expect(JSON.stringify(scrubbed)).not.toContain(fakeAssigned);
    expect(JSON.stringify(scrubbed)).not.toContain(fakeAws);
    expect(source.headers.Authorization).toBe(`Bearer ${fakeBearer}`);
    expect(source.nested[0].api_key).toBe(fakeAssigned);
  });

  it('redacts x-api headers and the whole value of nested sensitive fields without mutation', () => {
    const source = {
      'x-api-key': fakeAssigned,
      'x-api-token': { nested: fakeAssigned },
    };

    const scrubbed = scrubSecretValue(source);

    expect(scrubbed).toEqual({
      'x-api-key': REDACTED_SECRET,
      'x-api-token': REDACTED_SECRET,
    });
    expect(JSON.stringify(scrubbed)).not.toContain(fakeAssigned);
    expect(source).toEqual({
      'x-api-key': fakeAssigned,
      'x-api-token': { nested: fakeAssigned },
    });
    expect(scrubSecrets(`x-api-key=${fakeAssigned}`)).toBe('x-api-key=[redacted]');
    expect(scrubSecrets(`x-api-token=${fakeAssigned}`)).toBe('x-api-token=[redacted]');
  });

  it('scrubs a structured tool value before the legacy 4k truncation boundary', () => {
    const rawAtOldCutoff = `${'x'.repeat(3_964)} ${fakeSk}`;
    const output = scrubAndTruncateToolResult({ result: rawAtOldCutoff });

    expect(output.length).toBeLessThanOrEqual(4_000);
    expect(output).not.toContain(fakeSk);
    expect(output).not.toContain('sk-g8fixture');
    expect(output).toContain(REDACTED_SECRET);
  });

  it('withholds prefix/body/terminator split tokens until the entire credential can be redacted', () => {
    const stream = new StreamSecretScrubber();
    const emitted = [
      stream.feed('before Bear'),
      stream.feed(`er ${fakeBearer}`),
      stream.feed('\nafter'),
      stream.flush(),
    ];

    for (const chunk of emitted) {
      expect(chunk).not.toContain(fakeBearer);
      expect(chunk).not.toContain('g8_bearer_fixture');
    }
    expect(emitted.join('')).toBe(`before ${REDACTED_SECRET}\nafter`);
  });

  it('withholds a camel-case x-api assignment split across stream chunks', () => {
    const stream = new StreamSecretScrubber();
    const emitted = [
      stream.feed('before xApi'),
      stream.feed(`Key=${fakeAssigned}`),
      stream.feed('\nafter'),
      stream.flush(),
    ];

    for (const chunk of emitted) {
      expect(chunk).not.toContain(fakeAssigned);
    }
    expect(emitted.join('')).toBe(`before xApiKey=${REDACTED_SECRET}\nafter`);
  });

  it('flushes a final un-delimited credential as redacted rather than releasing its held tail', () => {
    const stream = new StreamSecretScrubber();
    expect(stream.feed(`prefix ${fakeSk}`)).toBe('prefix ');
    expect(stream.flush()).toBe(REDACTED_SECRET);
  });

  it('bounds an un-delimited candidate and discards its continued body until a safe delimiter', () => {
    const stream = new StreamSecretScrubber();
    const marker = 'g8_overflow_fixture_';
    const oversized = marker.repeat(Math.ceil((MAX_HELD_SECRET_CHARS + 32) / marker.length));
    const emitted = [
      stream.feed(`head Bearer ${oversized}`),
      stream.feed(marker.repeat(4)),
      stream.feed('\nnext visible'),
      stream.flush(),
    ];

    expect(emitted[0]).toBe(`head ${REDACTED_SECRET}`);
    expect(emitted[1]).toBe('');
    for (const chunk of emitted) {
      expect(chunk).not.toContain(marker);
    }
    expect(emitted.join('')).toBe(`head ${REDACTED_SECRET}\nnext visible`);
  });
});
