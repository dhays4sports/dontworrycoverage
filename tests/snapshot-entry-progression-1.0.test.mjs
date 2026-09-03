import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mapWebToPvx } from '../server/web-pvx-mapping-core.mjs';
import { resolvePvxWebDestination } from '../server/pvx-web-journey-core.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const require=createRequire(import.meta.url);
const model=require('../assets/js/pvx-snapshot-model.js');

test('408 snapshot entry remains snapshot and carries the review reason',()=>{
  const mapped=mapWebToPvx({entry_type:'snapshot',customer_selection:'coverage_concern',product_track:'home',route_path:'/snapshot/'});
  assert.equal(mapped.entry.type,'snapshot');
  assert.equal(mapped.discovery.answers.shoppingReason,'something_else');
  assert.match(mapped.discovery.exactCustomerWords.shoppingReason,/coverage question/i);
});

test('fresh snapshot skips the unrelated address gate and opens discovery',()=>{
  assert.equal(resolvePvxWebDestination({currentStage:'entry',seed:{entry:{type:'snapshot'}}}),'/pvx/discovery/');
});

test('snapshot discovery removes the premature permission question',()=>{
  const source=read('assets/js/pvx-discovery.js');
  assert.match(source,/entryType\(\) === 'snapshot'/);
  assert.match(source,/question\.id !== 'permissionToAdvise'/);
});

test('snapshot model produces a traceable current-policy topic',()=>{
  const result=model.derive({productTrack:'home',answers:{shoppingReason:'something_else'},exactCustomerWords:{shoppingReason:'I want to review what I have.'}},[],{entry:{type:'snapshot'}});
  assert.equal(result.whatDylanWouldLookAtFirst[0].topicKey,'current_coverage_confirmation');
  assert.equal(result.whatDylanWouldLookAtFirst[0].recommendation,false);
  assert.equal(result.guardrails.currentPolicyEvaluated,false);
});

test('next step collects evidence before presenting Review Readiness',()=>{
  const snapshot=read('assets/js/pvx-checkpoint-view.js');
  const policy=read('pvx/policy/index.html');
  const intake=read('assets/js/pvx-policy-intake-view.js');
  assert.match(snapshot,/choice:'current_policy'/);
  assert.match(policy,/Answer 5 policy questions/);
  assert.match(policy,/evidence-based Review Readiness result/i);
  assert.match(intake,/KEYS=\['dwelling','water','deductible','liability','umbrella'\]/);
  assert.match(intake,/customer_confirmed/);
});

test('policy completion advances both persistent SMS and web journeys',()=>{
  const endpoint=read('functions/api/pvx/policy-checkpoint.js');
  assert.match(endpoint,/loadPvxSmsJourneyFromRequest/);
  assert.match(endpoint,/loadPvxWebJourneyFromRequest/);
  assert.match(endpoint,/stage: 'coverage_review_ready'/);
});
