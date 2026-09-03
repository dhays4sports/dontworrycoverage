import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const require = createRequire(import.meta.url);
const model = require('../assets/js/pvx-snapshot-model.js');

test('fresh technology handoff shows a role and housing-specific first look before discovery', () => {
  const html = read('pvx/web/index.html');
  const script = read('assets/js/pvx-web-bootstrap.js');
  assert.match(html, /id="pvxTechRole"/);
  assert.match(html, /id="pvxTechHousing"/);
  assert.match(html, /Professional discount/);
  assert.match(html, /Worth verifying/);
  assert.match(html, /href="\/pvx\/discovery\/"/);
  assert.match(script, /professional\.program !== 'technology'/);
  assert.match(script, /productTrack === 'renter' \? 'Renter' : 'Homeowner'/);
  assert.match(script, /handoffState !== 'fresh'/);
});

test('completed technology Snapshot always carries the professional context without claiming eligibility', () => {
  const result = model.derive(
    { productTrack:'home', answers:{ shoppingReason:'comparison', improvementPriorities:['understanding'] }, exactCustomerWords:{} },
    [{ topicKey:'coverage_clarity', label:'Coverage clarity', becauseYouToldUs:'You asked to understand your coverage.', evidenceRefs:[{ source:'pvx_discovery', key:'improvementPriorities', value:['understanding'], status:'customer-reported' }], status:'worth_reviewing', recommendation:false }],
    { professional:{ active:true, program:'technology', role:'software_engineering', roleLabel:'Software engineering', eligibilityDetermined:false, discountDetermined:false } }
  );
  const professional = result.whatDylanWouldLookAtFirst.find(item => item.topicKey === 'professional_discount_eligibility');
  assert.ok(professional);
  assert.match(professional.becauseYouToldUs, /Software engineering/);
  assert.match(professional.whyWorthReviewing, /worth verifying/);
  assert.equal(professional.recommendation, false);
  assert.equal(result.guardrails.eligibilityDetermined, false);
});

test('Snapshot removes the early decision maze and exposes only the progressive actions', () => {
  const html = read('pvx/snapshot/index.html');
  for (const required of ['Continue toward a quote','Review this with Dylan','Save for later','Keep exploring']) assert.match(html, new RegExp(required));
  for (const removed of ['No forced topic','First in your review','scan order, not severity','Optional refinement','Requested channel','What would you like to do now?']) assert.doesNotMatch(html, new RegExp(removed, 'i'));
  assert.doesNotMatch(html, /data-readiness-state|data-next-action/);
  assert.match(html, /pvx-callback-continuity\.js/);
});

test('Snapshot v2 remains accepted by browser and server checkpoint validation', () => {
  assert.match(read('assets/js/pvx-checkpoint.js'), /coveragefit-discovery-only-snapshot-v2/);
  assert.match(read('server/pvx-checkpoint-core.mjs'), /coveragefit-discovery-only-snapshot-v2/);
});

test('a different secure journey clears stale browser-only Snapshot state before rendering', () => {
  const source = read('assets/js/pvx-web-bootstrap.js');
  assert.match(source, /RESET_ON_NEW_JOURNEY/);
  assert.match(source, /coveragefit_pvx_snapshot_v1/);
  assert.match(source, /coveragefit_pvx_branch_answers_v1/);
  assert.match(source, /previousBridge\.journeyId/);
  assert.match(source, /clean\(previousBridge\.journeyId, 120\) !== clean\(journey\.journeyId, 120\)/);
  assert.match(source, /clearJourneyState\(\)/);
});
