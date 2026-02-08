/**
 * Global test setup for CLI tests
 */

// Prevent tests from accidentally calling process.exit
import { vi } from 'vitest';

// Mock process.exit to throw instead of exiting
vi.spyOn(process, 'exit').mockImplementation((code) => {
  throw new Error(`process.exit(${code})`);
});
