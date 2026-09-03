import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scriptSource=fs.readFileSync(path.join(root,'assets/js/pvx-unified-workspace.js'),'utf8');
const html=fs.readFileSync(path.join(root,'agent/workspace/index.html'),'utf8');

test('early lead UI reloads on the actual producer inbox sync event', () => {
  assert.match(scriptSource,/coveragefit:producer-inbox-synced/);
  assert.match(scriptSource,/\/api\/pvx\/producer-records/);
  assert.ok(html.indexOf('id="pvxEarlyLeadInbox"') > html.indexOf('id="workspaceViewInbox"'));
  assert.ok(html.indexOf('id="pvxEarlyLeadInbox"') < html.indexOf('id="consultationRecordsBar"'));
  assert.match(html,/pvx-unified-workspace\.js\?v=CF-APPOINTMENT-FIRST-INBOX-1\.0/);
  assert.match(html,/New 408FARMERS inquiries/);
  assert.match(html,/data-early-lead-filter="needs_scheduling"/);
  assert.match(html,/data-early-lead-filter="scheduled"/);
  assert.match(html,/data-early-lead-filter="today"/);
  assert.doesNotMatch(html,/before completing a full CoverageFit review/i);
  assert.match(scriptSource,/Appointment:/);
  assert.match(scriptSource,/reviewReason/);
  assert.match(scriptSource,/propertyZip/);
  assert.match(scriptSource,/lifeGoal/);
  assert.match(scriptSource,/businessType/);
});

test('early lead UI exposes readable identity and contact helpers', () => {
  const listeners=[];
  const window={
    addEventListener:(name,handler)=>listeners.push({name,handler}),
    sessionStorage:{getItem:()=>''}
  };
  vm.runInNewContext(scriptSource,{window,document:{},Intl,Date,URLSearchParams,encodeURIComponent});
  const api=window.CoverageFitEarlyLeadInbox;
  assert.equal(api.BUILD,'CF-APPOINTMENT-FIRST-INBOX-1.0');
  assert.equal(api.displayPhone('4085551234'),'(408) 555-1234');
  assert.equal(api.stageLabel('started'),'Needs scheduling');
  assert.equal(api.earlyLead({earlyLead:{checkpointId:'408d_test',firstName:'Maya'}}).firstName,'Maya');
  assert.equal(api.earlyLead({checkpointId:'408d_phone_only_123456',fallbackIdentity:{mobile:'4085551234'}}).mobile,'4085551234');
  assert.equal(api.appointmentState({appointment:null}),'needs_scheduling');
  assert.equal(api.filterLeads([{mobile:'4085551234'}],'needs_scheduling').length,1);
  const now=new Date('2026-09-03T16:00:00.000Z');
  const sorted=api.sortLeads([
    {firstName:'Past',appointment:{status:'scheduled',start:'2026-09-01T18:00:00.000Z'}},
    {firstName:'Unscheduled',appointment:null,updatedAt:'2026-09-03T15:00:00.000Z'},
    {firstName:'Upcoming',appointment:{status:'scheduled',start:'2026-09-04T18:00:00.000Z'}},
    {firstName:'Today',appointment:{status:'scheduled',start:'2026-09-03T18:00:00.000Z'}}
  ],now);
  assert.deepEqual(Array.from(sorted,value=>value.firstName),['Today','Upcoming','Unscheduled','Past']);
  assert.ok(listeners.some(item=>item.name==='coveragefit:producer-inbox-synced'));
});
