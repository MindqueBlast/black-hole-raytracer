import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const shaderPath = join(root, 'src', 'shader.js');

describe('shader source contract', () => {
  const source = readFileSync(shaderPath, 'utf8');

  it('uses the mass-dependent Cartesian acceleration', () => {
    assert.match(source, /3\.0\s*\*\s*uMass/);
    assert.doesNotMatch(source, /return\s+-1\.5\s*\*\s*h2/);
  });

  it('does not add a soft bias to r⁵', () => {
    assert.doesNotMatch(source, /r5\s*=\s*[^;]+\+\s*0\.0001/);
  });

  it('marks exhausted rays and does not starfield them', () => {
    assert.match(source, /RAY_EXHAUSTED/);
    assert.match(source, /outcome\s*==\s*RAY_ESCAPED/);
    assert.match(source, /outcome\s*==\s*RAY_EXHAUSTED/);
    // Starfield only under escaped branch.
    const escapedBlock = source.indexOf('outcome == RAY_ESCAPED');
    const starIdx = source.indexOf('get_starfield', escapedBlock);
    const exhaustedIdx = source.indexOf('outcome == RAY_EXHAUSTED', escapedBlock);
    assert.ok(escapedBlock >= 0);
    assert.ok(starIdx > escapedBlock);
    assert.ok(exhaustedIdx > starIdx);
  });

  it('rejects disk emission inside the horizon', () => {
    assert.match(source, /r_disk\s*>\s*rs/);
  });
});
