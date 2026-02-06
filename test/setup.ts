import { vi, beforeEach, afterEach } from 'vitest';

beforeEach(() => {
  vi.restoreAllMocks();

  // Prevent tests from actually exiting the process
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);
});

afterEach(() => {
  vi.unstubAllEnvs();
});
