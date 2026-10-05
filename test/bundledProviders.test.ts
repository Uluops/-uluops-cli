/**
 * The CLI bundles @openrouter/ai-sdk-provider (0.34.1) so OpenRouter works without a separate
 * install. Core loads it by dynamic import and refuses a version whose major differs from its
 * own pin, so the bundled version must be the one core expects. This reads both sides instead
 * of restating the number: a core bump that moves the provider pin fails here, not at a user's
 * first OpenRouter run.
 */
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { AIProvider } from '@uluops/core';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { dependencies: Record<string, string> };

describe('bundled OpenRouter provider', () => {
  const corePin = /@openrouter\/ai-sdk-provider@(\S+)$/.exec(AIProvider.installHintFor('openrouter'))?.[1];

  it("core names the provider version it is built against (the test's own premise)", () => {
    expect(corePin).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('is a dependency, pinned exactly to the version core expects', () => {
    expect(pkg.dependencies['@openrouter/ai-sdk-provider']).toBe(corePin);
  });

  it('resolves from the CLI, where core will look for it', () => {
    const installed = require('@openrouter/ai-sdk-provider/package.json') as { version: string };
    expect(installed.version).toBe(corePin);
  });
});
