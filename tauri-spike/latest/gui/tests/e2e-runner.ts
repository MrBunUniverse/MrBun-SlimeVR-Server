#!/usr/bin/env node
/**
 * SlimeVR UI Redesign - Master Automated Test Runner
 *
 * Executes 4 feature tiers plus support suites:
 * - Tier 1: Feature Coverage (F1 - F8)
 * - Tier 2: Boundary & Corner Cases (B1 - B5)
 * - Tier 3: Cross-Feature Combinations (C1 - C5)
 * - Tier 4: Real-World Application Scenarios (S1 - S4)
 */

import { run } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spec as SpecReporter } from 'node:test/reporters';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const testFiles = [
  path.join(__dirname, 'adaptive-bpm.test.ts'),
  path.join(__dirname, 'tier1-features.test.ts'),
  path.join(__dirname, 'tier2-boundaries.test.ts'),
  path.join(__dirname, 'tier3-combinations.test.ts'),
  path.join(__dirname, 'tier4-scenarios.test.ts'),
  path.join(__dirname, 'runtime-efficiency.test.ts'),
  path.join(__dirname, 'quest-capture.test.ts'),
];

console.log('='.repeat(70));
console.log('   SLIMEVR MACOS ELECTRON/REACT UI REDESIGN - AUTOMATED TEST SUITE   ');
console.log('='.repeat(70));
console.log(`Executing ${testFiles.length} automated suites across 4 feature tiers...\n`);

const testStream = run({
  files: testFiles,
  concurrency: false,
});

testStream.compose(new SpecReporter()).pipe(process.stdout);

testStream.on('test:fail', () => {
  process.exitCode = 1;
});

testStream.on('error', (err) => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});

testStream.on('end', () => {
  console.log('\n' + '='.repeat(70));
  console.log('   E2E TEST SUITE EXECUTION COMPLETE');
  console.log('='.repeat(70));
});
