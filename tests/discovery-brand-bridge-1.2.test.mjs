import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('secure opening explains the agency-to-CoverageFit relationship', () => {
  const html = read('pvx/web/index.html');
  assert.match(html, /Connected from Virginia Tam Insurance Agency/);
  assert.match(html, /Your Tech Professional Review/);
  assert.match(html, /One more step makes this useful/);
  assert.doesNotMatch(html, /408FARMERS → CoverageFit/);
  assert.doesNotMatch(html, /408farmers[^<]*(logo|mark)|farmers[^<]*(logo|mark)/i);
});

test('discovery acknowledges only real carried-answer continuity', () => {
  const html = read('pvx/discovery/index.html');
  const script = read('assets/js/pvx-discovery.js');
  assert.match(html, /You won’t have to start over\./);
  assert.match(script, /Your earlier answers are already connected\./);
  assert.match(script, /continuity\.hidden = carriedCount === 0/);
  assert.match(script, /\$\{editableTotal\} quick/);
  assert.match(script, /const BUILD = 'CF-DISCOVERY-1\.3'/);
});

test('brand bridge does not reskin CoverageFit or weaken protected behavior', () => {
  const html = read('pvx/discovery/index.html');
  const bootstrap = read('assets/js/pvx-web-bootstrap.js');
  const contract = JSON.parse(read('CF-DISCOVERY-1.2_CONTRACT.json'));
  assert.match(html, /coveragefit-logo\.svg/);
  assert.doesNotMatch(html, /408farmers-logo|farmers-logo/i);
  assert.match(html, /See my Snapshot/);
  assert.match(bootstrap, /credentials: 'same-origin'/);
  assert.match(bootstrap, /history\.replaceState/);
  assert.equal(contract.brand_bridge.full_408_header_added, false);
  assert.equal(contract.security_and_semantic_boundaries.protection_score_changed, false);
  assert.equal(contract.security_and_semantic_boundaries.automated_sms_permission_inferred, false);
});
