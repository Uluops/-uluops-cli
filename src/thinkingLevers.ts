/**
 * Extended-thinking levers as the CLI sees them (thinking-capability-restore spec v0.7.1, §4.4, OD-16, OD-21).
 *
 * Core resolves `ai.extendedThinking` > `ULUOPS_EXTENDED_THINKING` > off, and records a `.env` value as
 * `'env'`: by the time core reads `process.env`, `loadEnvFiles()` has merged `./.env` and
 * `~/.uluops/.env` into it. Only the CLI saw the shell before the merge, so the CLI marks values that
 * came from a file and prints the caution — the `ULU_ORG_SLUG_FROM_ENV_FILE` precedent (cli.ts).
 */

/** Set when the named lever's value came from a `.env` file, not the shell. */
export const THINKING_FROM_ENV_FILE = 'ULU_EXTENDED_THINKING_FROM_ENV_FILE';
export const BUDGET_FROM_ENV_FILE = 'ULU_THINKING_BUDGET_FROM_ENV_FILE';

/**
 * Compare the shell snapshot (taken before `loadEnvFiles()`) with the merged environment and mark
 * each lever whose value a file supplied or changed.
 */
export function markEnvFileThinkingLevers(
  thinkingFromShell: string | undefined,
  budgetFromShell: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (
    env.ULUOPS_EXTENDED_THINKING !== undefined &&
    env.ULUOPS_EXTENDED_THINKING !== thinkingFromShell
  ) {
    env[THINKING_FROM_ENV_FILE] = '1';
  }
  if (
    env.ULUOPS_THINKING_BUDGET !== undefined &&
    env.ULUOPS_THINKING_BUDGET !== budgetFromShell
  ) {
    env[BUDGET_FROM_ENV_FILE] = '1';
  }
}

/**
 * The cautions to print before an exec run: a thinking lever set by a `.env` file is sticky — it
 * applies to every run in that directory (or, for `~/.uluops/.env`, on the machine) and bills thinking
 * tokens. A `--extended-thinking`/`--no-extended-thinking` flag overrides the env lever, so no caution
 * is due for it then.
 */
export function envFileThinkingCautions(
  flagGiven: boolean,
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const cautions: string[] = [];
  if (!flagGiven && env[THINKING_FROM_ENV_FILE] === '1') {
    cautions.push(
      `ULUOPS_EXTENDED_THINKING=${env.ULUOPS_EXTENDED_THINKING} came from ./.env or ~/.uluops/.env, not your shell — ` +
        'it applies to every run here. Pass --no-extended-thinking to override it for this run.',
    );
  }
  if (env[BUDGET_FROM_ENV_FILE] === '1') {
    cautions.push(
      `ULUOPS_THINKING_BUDGET=${env.ULUOPS_THINKING_BUDGET} came from ./.env or ~/.uluops/.env, not your shell — ` +
        'it sets the thinking budget for every run here.',
    );
  }
  return cautions;
}

/**
 * `ULUOPS_THINKING_BUDGET` as a whole number of tokens, or undefined. Strict: `parseInt` read
 * `"8000abc"` as 8000 and `"1.5e4"` as 1, so core's own guard ('invalid-budget') could never see a
 * malformed value from the CLI (review A12). Anything but digits is dropped with a warning.
 */
export function parseThinkingBudget(raw: string | undefined): {
  value?: number;
  warning?: string;
} {
  if (raw === undefined || raw.trim() === '') return {};
  const v = raw.trim();
  if (/^\d+$/.test(v)) return { value: Number(v) };
  return {
    warning: `ULUOPS_THINKING_BUDGET="${v.slice(0, 40)}" is not a whole number of tokens; ignored (core's default budget applies).`,
  };
}
