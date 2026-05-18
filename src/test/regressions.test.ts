import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPortfolioAuditSummary, countExpiringSoonContracts } from '../lib/dashboardAudit.ts';
import { hasPermission } from '../lib/authorization.ts';
import { getContractOwnerId, normalizeComparisonContract } from '../lib/contracts.ts';
import { computeImpactedContractCount } from '../lib/sentinelImpact.ts';

test('countExpiringSoonContracts only counts contracts due within 30 days', () => {
  const now = new Date('2026-05-18T09:00:00Z');
  const contracts = [
    { expiry: '2026-05-20' },
    { expiry: '15 June 2026' },
    { expiry: '2026-06-17' },
    { expiry: '2026-06-18' },
    { expiry: '2026-05-01' },
    { expiry: 'Not specified' },
  ];

  assert.equal(countExpiringSoonContracts(contracts, now), 3);
});

test('buildPortfolioAuditSummary reports live portfolio findings', () => {
  const now = new Date('2026-05-18T09:00:00Z');
  const summary = buildPortfolioAuditSummary(
    [
      { riskLevel: 'High Risk', status: 'Review Required', expiry: '2026-05-25' },
      { riskLevel: 'Medium Risk', status: 'Review Complete', expiry: '2026-08-01' },
      { riskLevel: 'Low Risk', status: 'Review Required', expiry: '2026-06-10' },
    ],
    now
  );

  assert.match(summary, /1 high-priority risk/);
  assert.match(summary, /2 documents awaiting review/);
  assert.match(summary, /2 contracts expiring within 30 days/);
  assert.match(summary, /across 3 documents/);
});

test('normalizeComparisonContract keeps current expiry field and falls back to legacy expiryDate', () => {
  const current = normalizeComparisonContract({
    id: 'doc-1',
    expiry: '2026-07-01',
    expiryDate: '2026-01-01',
    riskLevel: 'High Risk',
  });
  const legacy = normalizeComparisonContract({
    id: 'doc-2',
    expiryDate: '2026-08-15',
    riskLevel: 'Medium Risk',
  });

  assert.equal(current.expiry, '2026-07-01');
  assert.equal(current.risk, 'High Risk');
  assert.equal(legacy.expiry, '2026-08-15');
  assert.equal(legacy.risk, 'Medium Risk');
});

test('getContractOwnerId supports both ownerId and legacy userId fields', () => {
  assert.equal(getContractOwnerId({ ownerId: 'owner-123', userId: 'legacy-123' }), 'owner-123');
  assert.equal(getContractOwnerId({ userId: 'legacy-123' }), 'legacy-123');
  assert.equal(getContractOwnerId(undefined), null);
});

test('hasPermission gates sensitive settings by role', () => {
  assert.equal(hasPermission('user', 'settings.security.read'), false);
  assert.equal(hasPermission('manager', 'settings.notifications.read'), true);
  assert.equal(hasPermission('manager', 'settings.integration.read'), false);
  assert.equal(hasPermission('admin', 'settings.integration.read'), true);
});

test('computeImpactedContractCount deduplicates matching chunks from the same contract', () => {
  const eventEmbedding = [1, 0];
  const chunks = [
    { embedding: [1, 0], metadata: { docId: 'doc-a' } },
    { embedding: [0.95, 0.05], metadata: { docId: 'doc-a' } },
    { embedding: [0.8, 0.2], metadata: { docId: 'doc-b' } },
    { embedding: [0.2, 0.98], metadata: { docId: 'doc-c' } },
  ];

  assert.equal(computeImpactedContractCount(eventEmbedding, chunks), 2);
});
