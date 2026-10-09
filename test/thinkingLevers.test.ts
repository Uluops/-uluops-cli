import { describe, expect, it } from 'vitest';
import {
  envFileThinkingCautions,
  markEnvFileThinkingLevers,
  parseThinkingBudget,
} from '../src/thinkingLevers.js';

describe('thinking levers from .env files (OD-21)', () => {
  it('marks a lever only when a file supplied or changed it', () => {
    const shell = { ULUOPS_EXTENDED_THINKING: 'on' } as NodeJS.ProcessEnv;
    markEnvFileThinkingLevers('on', undefined, shell);
    expect(shell.ULU_EXTENDED_THINKING_FROM_ENV_FILE).toBeUndefined();

    const file = {
      ULUOPS_EXTENDED_THINKING: 'on',
      ULUOPS_THINKING_BUDGET: '4000',
    } as NodeJS.ProcessEnv;
    markEnvFileThinkingLevers(undefined, undefined, file);
    expect(file.ULU_EXTENDED_THINKING_FROM_ENV_FILE).toBe('1');
    expect(file.ULU_THINKING_BUDGET_FROM_ENV_FILE).toBe('1');
    expect(envFileThinkingCautions(false, file)).toHaveLength(2);
    expect(envFileThinkingCautions(true, file)).toHaveLength(1); // the flag overrides only the on/off lever
  });

  it("parseThinkingBudget: digits only; parseInt's silent prefixes are refused", () => {
    expect(parseThinkingBudget(undefined)).toEqual({});
    expect(parseThinkingBudget('  ')).toEqual({});
    expect(parseThinkingBudget('8000')).toEqual({ value: 8000 });
    for (const bad of ['8000abc', '1.5e4', '-100', '12.5']) {
      expect(parseThinkingBudget(bad).value).toBeUndefined();
      expect(parseThinkingBudget(bad).warning).toContain('not a whole number');
    }
  });
});
