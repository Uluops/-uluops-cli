import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerDepsCommands } from '../../src/commands/deps.js';

const mockedCreateRegistryContext = vi.mocked(createRegistryContext);
const mockedHandleRegistryError = vi.mocked(handleRegistryError);

type MockClient = ReturnType<typeof createMockRegistryClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockRegistryClient();
  mockedCreateRegistryContext.mockReturnValue(
    createMockRegistryContext({ client: mockClient as unknown as RegistryCliContext['client'] })
  );
  mockedHandleRegistryError.mockImplementation((error) => { throw error; });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerDepsCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('deps get', () => {
  it('renders the flat list by default (post-R12 envelope)', async () => {
    mockClient.dependencies.get.mockResolvedValue({
      definition: { type: 'workflow', name: 'my-wf', version: '1.0.0' },
      graph: {
        id: 'root',
        type: 'workflow',
        name: 'my-wf',
        version: '1.0.0',
        dependencies: [
          {
            id: 'a',
            type: 'agent',
            name: 'dep-agent',
            version: '1.0.0',
            context: 'invokes.agent',
            dependencies: [],
          },
        ],
      },
      flat: [
        { id: 'a', type: 'agent', name: 'dep-agent', version: '1.0.0', depth: 1 },
      ],
      totalCount: 1,
      maxDepth: 1,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0');
    expect(mockClient.dependencies.get).toHaveBeenCalledWith('workflow', 'my-wf', '1.0.0', undefined);
    const out = output.stdout();
    expect(out).toContain('Dependencies for workflow/my-wf@1.0.0');
    expect(out).toContain('Total: 1 (max depth 1)');
    expect(out).toContain('agent/dep-agent@1.0.0 (depth 1)');
    output.restore();
  });

  it('renders the tree view under --tree, including context labels', async () => {
    mockClient.dependencies.get.mockResolvedValue({
      definition: { type: 'workflow', name: 'my-wf', version: '1.0.0' },
      graph: {
        id: 'root',
        type: 'workflow',
        name: 'my-wf',
        version: '1.0.0',
        dependencies: [
          {
            id: 'a',
            type: 'agent',
            name: 'dep-agent',
            version: '1.0.0',
            context: 'phase validate',
            dependencies: [],
          },
        ],
      },
      flat: [
        { id: 'a', type: 'agent', name: 'dep-agent', version: '1.0.0', depth: 1 },
      ],
      totalCount: 1,
      maxDepth: 1,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0', '--tree');
    const out = output.stdout();
    expect(out).toContain('workflow/my-wf@1.0.0');
    expect(out).toContain('agent/dep-agent@1.0.0  [phase validate]');
    output.restore();
  });

  it('renders --tree recursively at depth 2 (grandchild visible with correct indent — post-impl r1)', async () => {
    // The wave's printTree function is recursive. Prior tree test had depth 1
    // only — a mutation removing the `for (child of dependencies) printTree(...)`
    // line would have passed it. This test puts a grandchild at depth 2 and
    // asserts both child and grandchild lines render with the correct
    // indentation (2 spaces per depth level).
    mockClient.dependencies.get.mockResolvedValue({
      definition: { type: 'workflow', name: 'my-wf', version: '1.0.0' },
      graph: {
        id: 'root',
        type: 'workflow',
        name: 'my-wf',
        version: '1.0.0',
        dependencies: [
          {
            id: 'child',
            type: 'agent',
            name: 'child-agent',
            version: '1.0.0',
            context: 'invokes.agent',
            dependencies: [
              {
                id: 'gc',
                type: 'command',
                name: 'grandchild-cmd',
                version: '1.0.0',
                context: 'invokes.command',
                dependencies: [],
              },
            ],
          },
        ],
      },
      flat: [
        { id: 'child', type: 'agent', name: 'child-agent', version: '1.0.0', depth: 1 },
        { id: 'gc', type: 'command', name: 'grandchild-cmd', version: '1.0.0', depth: 2 },
      ],
      totalCount: 2,
      maxDepth: 2,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0', '--tree');
    const out = output.stdout();
    // Root at indent 2 ("  "), child at 4 ("    "), grandchild at 6 ("      ")
    expect(out).toMatch(/^ {2}workflow\/my-wf@1\.0\.0/m);
    expect(out).toMatch(/^ {4}agent\/child-agent@1\.0\.0 {2}\[invokes\.agent\]/m);
    expect(out).toMatch(/^ {6}command\/grandchild-cmd@1\.0\.0 {2}\[invokes\.command\]/m);
    output.restore();
  });

  it('truncates --tree rendering at MAX_RENDER_DEPTH=60 (post-impl r2 CWE-674 defense-in-depth)', async () => {
    // The SDK guards at MAX_SAFE_GRAPH_DEPTH=50, but the CLI carries an
    // independent ceiling at 60 for the case where the SDK guard is bypassed
    // (mocked clients in tests, future schema changes, corrupted responses
    // that slip through).  Mocked clients ARE the bypass scenario, so this
    // test exercises the guard directly.
    //
    // Build a 62-deep chain and assert the truncation marker fires.
    type Node = {
      id: string;
      type: string;
      name: string;
      version: string;
      dependencies: Node[];
    };
    const buildChain = (remaining: number, depth: number): Node => ({
      id: `node-${String(depth)}`,
      type: 'agent',
      name: `agent-${String(depth)}`,
      version: '1.0.0',
      dependencies:
        remaining > 0 ? [buildChain(remaining - 1, depth + 1)] : [],
    });
    const chain = buildChain(62, 0); // 63 nodes total
    mockClient.dependencies.get.mockResolvedValue({
      definition: { type: 'workflow', name: 'deep', version: '1.0.0' },
      graph: chain,
      flat: [],
      totalCount: 62,
      maxDepth: 62,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'deep', '1.0.0', '--tree');
    const out = output.stdout();
    // The truncation marker must appear — without the depth guard, the
    // recursion would either complete (no marker) or stack-overflow.
    expect(out).toContain('... (truncated at depth 60)');
    output.restore();
  });

  it('shows the no-deps message when totalCount is zero', async () => {
    mockClient.dependencies.get.mockResolvedValue({
      definition: { type: 'workflow', name: 'my-wf', version: '1.0.0' },
      graph: { id: 'root', type: 'workflow', name: 'my-wf', version: '1.0.0', dependencies: [] },
      flat: [],
      totalCount: 0,
      maxDepth: 0,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0');
    expect(output.stdout()).toContain('No dependencies');
    output.restore();
  });
});

describe('deps dependents', () => {
  it('lists dependents with context (post-R12 envelope)', async () => {
    mockClient.dependencies.getDependents.mockResolvedValue({
      definition: { type: 'agent', name: 'my-agent', version: '1.0.0' },
      dependents: [
        {
          id: '1',
          type: 'workflow',
          name: 'consumer-wf',
          version: '2.0.0',
          context: 'invokes.agent',
        },
      ],
      totalCount: 1,
    });
    const output = captureOutput();
    await parse('deps', 'dependents', 'agent', 'my-agent', '1.0.0');
    expect(mockClient.dependencies.getDependents).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0');
    const out = output.stdout();
    expect(out).toContain('Dependents of agent/my-agent@1.0.0 (1)');
    expect(out).toContain('workflow/consumer-wf@2.0.0  ←  invokes.agent');
    output.restore();
  });

  it('shows the no-dependents message when totalCount is zero', async () => {
    mockClient.dependencies.getDependents.mockResolvedValue({
      definition: { type: 'agent', name: 'my-agent', version: '1.0.0' },
      dependents: [],
      totalCount: 0,
    });
    const output = captureOutput();
    await parse('deps', 'dependents', 'agent', 'my-agent', '1.0.0');
    expect(output.stdout()).toContain('No dependents of agent/my-agent@1.0.0');
    output.restore();
  });
});

// CONTRACT ANCHOR — guards the default `--json` output shape of `deps get`.
// This is the exact surface that regressed silently in v0.13.0 (the captive-user
// EPI-ASS/H finding): the envelope's fields must not disappear without a major
// bump. A change here should fail CI and force a conscious `kind` schemaVersion
// bump. See src/formatters/json.ts "JSON Output Stability Contract".
describe('deps get --json (stability anchor)', () => {
  it('emits the full DependenciesEnvelope shape, not a degraded subset', async () => {
    mockedCreateRegistryContext.mockReturnValue(
      createMockRegistryContext({
        client: mockClient as unknown as RegistryCliContext['client'],
        json: true,
      }),
    );
    mockClient.dependencies.get.mockResolvedValue({
      definition: { type: 'workflow', name: 'my-wf', version: '1.0.0' },
      graph: { id: 'root', type: 'workflow', name: 'my-wf', version: '1.0.0', dependencies: [] },
      flat: [],
      totalCount: 0,
      maxDepth: 0,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0');
    const parsed = JSON.parse(output.stdout()) as Record<string, unknown>;
    // The five fields a captive consumer parses. Dropping any is breaking.
    expect(parsed).toHaveProperty('definition');
    expect(parsed).toHaveProperty('graph');
    expect(parsed).toHaveProperty('flat');
    expect(parsed).toHaveProperty('totalCount');
    expect(parsed).toHaveProperty('maxDepth');
    output.restore();
  });
});
