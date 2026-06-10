import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  ENVELOPE_SCHEMA,
  emitJson,
  SCHEMA_VERSIONS,
} from '../../src/formatters/json.js';
import { captureOutput } from '../helpers/capture.js';

describe('emitJson — JSON output chokepoint', () => {
  let output: ReturnType<typeof captureOutput>;

  beforeEach(() => {
    output = captureOutput();
    delete process.env['ULU_JSON_SCHEMA'];
  });
  afterEach(() => {
    output.restore();
    delete process.env['ULU_JSON_SCHEMA'];
  });

  it('returns false and emits nothing when ctx.json is unset', () => {
    const emitted = emitJson({ json: false }, { a: 1 }, 'issue.get');
    expect(emitted).toBe(false);
    expect(output.stdout()).toBe('');
  });

  describe('default mode (frozen contract)', () => {
    const payloads: Array<[string, unknown]> = [
      ['object', { issueId: 'x', events: [1, 2], totalEvents: 2 }],
      ['bare array', [{ id: 'a' }, { id: 'b' }]],
      ['success object', { success: true, runId: 'r1' }],
      ['nested', { definition: { name: 'd' }, flat: [], totalCount: 0 }],
      ['empty array', []],
      ['null', null],
    ];

    for (const [label, payload] of payloads) {
      it(`emits ${label} byte-for-byte identical to JSON.stringify(data, null, 2)`, () => {
        const emitted = emitJson({ json: true }, payload, 'issue.get');
        expect(emitted).toBe(true);
        // The exact historical output: pretty-printed, no wrapper.
        expect(output.stdout()).toBe(JSON.stringify(payload, null, 2));
      });
    }
  });

  describe('envelope mode (ULU_JSON_SCHEMA=1)', () => {
    beforeEach(() => {
      process.env['ULU_JSON_SCHEMA'] = '1';
    });

    it('wraps the payload with schema/cliVersion/kind/schemaVersion/data', () => {
      const payload = { definition: { name: 'd' }, flat: [], totalCount: 0 };
      emitJson({ json: true }, payload, 'deps.get');
      const parsed = JSON.parse(output.stdout());
      expect(parsed.schema).toBe(ENVELOPE_SCHEMA);
      expect(typeof parsed.cliVersion).toBe('string');
      expect(parsed.kind).toBe('deps.get');
      expect(parsed.schemaVersion).toBe(SCHEMA_VERSIONS['deps.get']);
      // The wrapped data deep-equals exactly what default mode would emit.
      expect(parsed.data).toEqual(payload);
    });

    it('nests a bare-array payload under data without altering it', () => {
      const payload = [{ id: 'a' }, { id: 'b' }];
      emitJson({ json: true }, payload, 'issue.list');
      const parsed = JSON.parse(output.stdout());
      expect(Array.isArray(parsed)).toBe(false); // top level is the envelope
      expect(Array.isArray(parsed.data)).toBe(true);
      expect(parsed.data).toEqual(payload);
      expect(parsed.kind).toBe('issue.list');
    });

    it('reports the known-regression kinds at schemaVersion 2', () => {
      expect(SCHEMA_VERSIONS['deps.get']).toBe(2);
      expect(SCHEMA_VERSIONS['issue.history']).toBe(2);
    });
  });

  it('every registered kind has a positive integer schemaVersion', () => {
    for (const [kind, v] of Object.entries(SCHEMA_VERSIONS)) {
      expect(Number.isInteger(v), `${kind} version is an integer`).toBe(true);
      expect(v, `${kind} version is >= 1`).toBeGreaterThanOrEqual(1);
    }
  });
});
