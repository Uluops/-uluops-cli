import { describe, it, expect } from 'vitest';
import {
  formatAgentResult,
  formatExecutionResult,
  formatRecommendations,
  formatDefinitionList,
  formatDefinitionDetails,
} from '../../src/formatters/core.js';
import type { AgentResult, ValidatorAgentResult, ExecutionResult, Recommendation, DefinitionSummary } from '@uluops/core';

// ── Fixtures ─────────────────────────────────────────────────────────────

function createMetrics(overrides: Partial<AgentResult['metrics']> = {}): AgentResult['metrics'] {
  return {
    model: 'claude-sonnet-4-5',
    inputTokens: 1000,
    outputTokens: 500,
    cacheCreationTokens: 0,
    cacheReadTokens: 0,
    totalEffectiveTokens: 1500,
    ...overrides,
  };
}

function createValidatorResult(overrides: Partial<ValidatorAgentResult> = {}): ValidatorAgentResult {
  return {
    type: 'agent',
    name: 'code-validator',
    version: '1.0.0',
    agentType: 'validator',
    decision: 'PASS',
    score: 85,
    maxScore: 100,
    threshold: 70,
    durationMs: 5000,
    dashboardUrl: undefined,
    categories: [],
    recommendations: [],
    metrics: createMetrics(),
    ...overrides,
  } as ValidatorAgentResult;
}

function createGenericAgentResult(overrides: Partial<AgentResult> = {}): AgentResult {
  return {
    type: 'agent',
    name: 'my-agent',
    version: '2.0.0',
    agentType: 'general',
    decision: 'COMPLETED',
    durationMs: 3000,
    dashboardUrl: undefined,
    recommendations: [],
    metrics: createMetrics(),
    ...overrides,
  } as AgentResult;
}

function createExecResult(overrides: Partial<ExecutionResult> = {}): ExecutionResult {
  return {
    type: 'command',
    name: 'my-command',
    version: '1.0.0',
    decision: 'PASS',
    score: 90,
    durationMs: 3000,
    dashboardUrl: undefined,
    recommendations: [],
    metrics: createMetrics(),
    ...overrides,
  } as ExecutionResult;
}

// ── formatAgentResult ────────────────────────────────────────────────────

describe('formatAgentResult', () => {
  it('renders header with name and version', () => {
    const result = formatAgentResult(createValidatorResult());
    expect(result).toContain('Agent: code-validator v1.0.0');
    expect(result).toContain('Decision: PASS');
  });

  it('renders score and threshold for validator agents', () => {
    const result = formatAgentResult(createValidatorResult({ score: 92, maxScore: 100, threshold: 80 }));
    expect(result).toContain('Score: 92/100');
    expect(result).toContain('Threshold: 80');
  });

  it('does not render score for non-validator agents', () => {
    const result = formatAgentResult(createGenericAgentResult());
    expect(result).not.toContain('Score:');
    expect(result).not.toContain('Threshold:');
  });

  it('renders duration in seconds', () => {
    const result = formatAgentResult(createValidatorResult({ durationMs: 5000 }));
    expect(result).toContain('Duration: 5.0s');
  });

  it('renders duration in milliseconds for short runs', () => {
    const result = formatAgentResult(createValidatorResult({ durationMs: 500 }));
    expect(result).toContain('Duration: 500ms');
  });

  it('renders duration in minutes for long runs', () => {
    const result = formatAgentResult(createValidatorResult({ durationMs: 125000 }));
    expect(result).toContain('Duration: 2m 5s');
  });

  it('renders model name', () => {
    const result = formatAgentResult(createValidatorResult());
    expect(result).toContain('Model: claude-sonnet-4-5');
  });

  it('renders dashboard URL when present', () => {
    const result = formatAgentResult(createValidatorResult({ dashboardUrl: 'https://dash.uluops.com/run/123' }));
    expect(result).toContain('Dashboard: https://dash.uluops.com/run/123');
  });

  it('omits dashboard URL when not present', () => {
    const result = formatAgentResult(createValidatorResult({ dashboardUrl: undefined }));
    expect(result).not.toContain('Dashboard:');
  });

  it('renders token usage', () => {
    const result = formatAgentResult(createValidatorResult());
    expect(result).toContain('Token Usage:');
    expect(result).toContain('Input: 1,000');
    expect(result).toContain('Output: 500');
    expect(result).toContain('Total effective: 1,500');
  });

  it('renders cache tokens when present', () => {
    const result = formatAgentResult(createValidatorResult({
      metrics: createMetrics({ cacheCreationTokens: 200, cacheReadTokens: 300 }),
    }));
    expect(result).toContain('Cache write: 200');
    expect(result).toContain('Cache read: 300');
  });

  it('omits cache tokens when zero', () => {
    const result = formatAgentResult(createValidatorResult());
    expect(result).not.toContain('Cache write:');
    expect(result).not.toContain('Cache read:');
  });

  it('renders cost when present', () => {
    const result = formatAgentResult(createValidatorResult({
      metrics: createMetrics({ costUsd: 0.0123 }),
    }));
    expect(result).toContain('Estimated cost: $0.0123');
  });

  it('renders categories table for validators', () => {
    const result = formatAgentResult(createValidatorResult({
      categories: [
        { name: 'Code Quality', score: 28, maxScore: 30, findings: [{ title: 'issue' } as never] },
        { name: 'Testing', score: 25, maxScore: 25, findings: [] },
      ],
    }));
    expect(result).toContain('Categories:');
    expect(result).toContain('Code Quality');
    expect(result).toContain('Testing');
  });

  it('renders recommendations when present', () => {
    const result = formatAgentResult(createValidatorResult({
      recommendations: [
        { title: 'Fix lint error', priority: 'critical', description: 'Fix it now' } as Recommendation,
      ],
    }));
    expect(result).toContain('Fix lint error');
    expect(result).toContain('Critical (1):');
  });

  it('shows a completeness badge when the run is not complete', () => {
    const result = formatAgentResult(createGenericAgentResult({ decision: 'PASS', completeness: 'partial' }));
    expect(result).toContain('Decision: PASS  ·  Completeness: PARTIAL');
  });

  it('omits the completeness badge for a complete run', () => {
    const result = formatAgentResult(createGenericAgentResult({ decision: 'PASS', completeness: 'complete' }));
    expect(result).not.toContain('Completeness:');
    expect(result).toContain('Decision: PASS');
  });

  it('omits the completeness badge when completeness is absent', () => {
    const result = formatAgentResult(createGenericAgentResult({ decision: 'PASS' }));
    expect(result).not.toContain('Completeness:');
  });

  it('lists degradation markers only under verbose', () => {
    const withMarkers = createGenericAgentResult({
      completeness: 'partial',
      degradationMarkers: [
        { code: 'budget.forced-wrap-up', phase: 'execution', severity: 'degraded', detail: 'coverage may be partial' },
      ],
    });
    expect(formatAgentResult(withMarkers)).not.toContain('Degradations:');
    const verbose = formatAgentResult(withMarkers, { verbose: true });
    expect(verbose).toContain('Degradations:');
    expect(verbose).toContain('[DEGRADED] budget.forced-wrap-up — coverage may be partial');
  });
});

// ── formatExecutionResult ────────────────────────────────────────────────

describe('formatExecutionResult', () => {
  it('renders header with capitalized type', () => {
    const result = formatExecutionResult(createExecResult());
    expect(result).toContain('Command: my-command v1.0.0');
    expect(result).toContain('Decision: PASS');
  });

  it('renders workflow type correctly', () => {
    const result = formatExecutionResult(createExecResult({ type: 'workflow', name: 'ship' }));
    expect(result).toContain('Workflow: ship v1.0.0');
  });

  it('renders score when present', () => {
    const result = formatExecutionResult(createExecResult({ score: 90 }));
    expect(result).toContain('Score: 90/100');
  });

  it('omits score when undefined', () => {
    const result = formatExecutionResult(createExecResult({ score: undefined }));
    expect(result).not.toContain('Score:');
  });

  it('renders duration', () => {
    const result = formatExecutionResult(createExecResult({ durationMs: 3000 }));
    expect(result).toContain('Duration: 3.0s');
  });

  it('renders token usage', () => {
    const result = formatExecutionResult(createExecResult());
    expect(result).toContain('Token Usage:');
    expect(result).toContain('Input: 1,000');
  });

  it('renders dashboard URL when present', () => {
    const result = formatExecutionResult(createExecResult({ dashboardUrl: 'https://example.com' }));
    expect(result).toContain('Dashboard: https://example.com');
  });

  it('renders recommendations when present', () => {
    const result = formatExecutionResult(createExecResult({
      recommendations: [
        { title: 'Add tests', priority: 'suggested', description: 'Coverage low' } as Recommendation,
      ],
    }));
    expect(result).toContain('Add tests');
  });
});

// ── formatRecommendations ────────────────────────────────────────────────

describe('formatRecommendations', () => {
  it('returns empty message for no recommendations', () => {
    expect(formatRecommendations([])).toBe('No recommendations.');
  });

  it('groups by priority in correct order', () => {
    const recs: Recommendation[] = [
      { title: 'Backlog item', priority: 'backlog' } as Recommendation,
      { title: 'Critical fix', priority: 'critical' } as Recommendation,
      { title: 'Suggestion', priority: 'suggested' } as Recommendation,
    ];
    const result = formatRecommendations(recs);
    const criticalIdx = result.indexOf('Critical (1):');
    const suggestedIdx = result.indexOf('Suggested (1):');
    const backlogIdx = result.indexOf('Backlog (1):');
    expect(criticalIdx).toBeLessThan(suggestedIdx);
    expect(suggestedIdx).toBeLessThan(backlogIdx);
  });

  it('renders file path and line number', () => {
    const recs: Recommendation[] = [
      { title: 'Fix it', priority: 'critical', filePath: 'src/index.ts', lineNumber: 42 } as Recommendation,
    ];
    const result = formatRecommendations(recs);
    expect(result).toContain('src/index.ts:42');
  });

  it('renders file path without line number', () => {
    const recs: Recommendation[] = [
      { title: 'Fix it', priority: 'critical', filePath: 'src/index.ts' } as Recommendation,
    ];
    const result = formatRecommendations(recs);
    expect(result).toContain('src/index.ts');
    expect(result).not.toContain('src/index.ts:');
  });

  it('truncates long descriptions', () => {
    const longDesc = 'A'.repeat(200);
    const recs: Recommendation[] = [
      { title: 'Fix it', priority: 'critical', description: longDesc } as Recommendation,
    ];
    const result = formatRecommendations(recs);
    expect(result).toContain('...');
  });

  it('renders count in header', () => {
    const recs: Recommendation[] = [
      { title: 'Fix A', priority: 'critical' } as Recommendation,
      { title: 'Fix B', priority: 'critical' } as Recommendation,
    ];
    const result = formatRecommendations(recs);
    expect(result).toContain('Critical (2):');
  });
});

// ── formatDefinitionList ─────────────────────────────────────────────────

describe('formatDefinitionList', () => {
  it('returns empty message for no definitions', () => {
    expect(formatDefinitionList([])).toBe('No definitions found.');
  });

  it('renders definitions in a table', () => {
    const items: DefinitionSummary[] = [
      { name: 'code-validator', type: 'agent', version: '1.0.0', domain: 'validation', description: 'Validates code quality' } as DefinitionSummary,
    ];
    const result = formatDefinitionList(items);
    expect(result).toContain('code-validator');
    expect(result).toContain('agent');
    expect(result).toContain('1.0.0');
    expect(result).toContain('validation');
  });

  it('renders multiple definitions', () => {
    const items: DefinitionSummary[] = [
      { name: 'code-validator', type: 'agent', version: '1.0.0', domain: 'validation', description: 'Validates code' } as DefinitionSummary,
      { name: 'ship', type: 'workflow', version: '2.0.0', domain: 'release', description: 'Ship workflow' } as DefinitionSummary,
    ];
    const result = formatDefinitionList(items);
    expect(result).toContain('code-validator');
    expect(result).toContain('ship');
  });
});

// ── formatDefinitionDetails ──────────────────────────────────────────────

describe('formatDefinitionDetails', () => {
  it('renders key-value pairs', () => {
    const result = formatDefinitionDetails({
      type: 'agent',
      name: 'code-validator',
      version: '1.0.0',
      hash: 'abc123def',
      interface: { input: 'directory', output: 'json' },
    });
    expect(result).toContain('code-validator');
    expect(result).toContain('agent');
    expect(result).toContain('1.0.0');
    expect(result).toContain('abc123def');
  });

  it('renders interface section', () => {
    const result = formatDefinitionDetails({
      type: 'agent',
      name: 'test',
      version: '1.0.0',
      hash: 'xyz',
      interface: { input: 'directory', output: 'json' },
    });
    expect(result).toContain('Interface:');
  });

  it('handles null interface', () => {
    const result = formatDefinitionDetails({
      type: 'agent',
      name: 'test',
      version: '1.0.0',
      hash: 'xyz',
      interface: null,
    });
    expect(result).not.toContain('Interface:');
    expect(result).toContain('test');
  });
});
