import { vi } from 'vitest';

/**
 * Capture console.log and console.error output during a test.
 * Call restore() in afterEach or when done asserting.
 */
export function captureOutput() {
  const logs: string[] = [];
  const errors: string[] = [];

  const logSpy = vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  const errorSpy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args.map(String).join(' '));
  });

  return {
    logs,
    errors,
    stdout: () => logs.join('\n'),
    stderr: () => errors.join('\n'),
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}
