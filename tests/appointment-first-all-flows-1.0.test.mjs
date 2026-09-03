import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapWebToPvx, validateWebPvxMapping } from '../server/web-pvx-mapping-core.mjs';
import { mapSmsToPvx, validateSmsPvxMapping } from '../server/sms-pvx-mapping-core.mjs';
import { createSmsPvxJourney, pvxSmsJourneyKey } from '../server/pvx-sms-journey-core.mjs';
import { handleJourneyWebBooking } from '../server/callback-web-booking-core.mjs';
import { leadRecordKey, normalizeLeadPayload, smsCheckpointId, upsertSmsLeadJourney } from '../server/lead-operations-core.mjs';
import { projectUnifiedProducerRecord } from '../server/pvx-unified-producer-record-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const base={journey_goal:'appointment',lead_capture_status:'confirmed',contact_consent:'true',first_name:'Sam',phone:'4085550199',lead_checkpoint_id:'408d_abcdefghijklmnop',consent_at:'2026-09-03T18:00:00.000Z',consent_version:'408farmers-agency-contact-v2'};
class Store{constructor(){this.rows=new Map();}async get(key){return structuredClone(this.rows.get(key)||null);}async setJSON(key,value,options={}){if(options.onlyIfNew&&this.rows.has(key))throw new Error('duplicate');this.rows.set(key,structuredClone(value));}async delete(key){this.rows.delete(key);}}
const calendarFetch=async(url,init={})=>{const href=String(url);if(href==='https://oauth2.googleapis.com/token')return Response.json({access_token:'token'});if(href==='https://www.googleapis.com/calendar/v3/freeBusy')return Response.json({calendars:{calendar:{busy:[]}}});if(/\/events$/.test(href)&&init.method==='POST'){const event=JSON.parse(init.body);return Response.json({...event,htmlLink:'https://calendar.google.com/event/test'});}if(/\/events\/[a-f0-9]{32,64}$/.test(href)&&init.method==='GET')return Response.json({}, {status:404});throw new Error(`Unexpected request ${href}`);};

test('every public 408 acquisition family can open only the appointment experience',()=>{
  const cases=[
    {entry_type:'home',route_path:'/home/',review_track:'home',review_reason:'price'},
    {entry_type:'home',route_path:'/home/qr/95112/rate/',review_track:'bundle',review_reason:'upcoming_renewal'},
    {entry_type:'home_auto',route_path:'/auto-bundle/',review_track:'bundle',review_reason:'comparison'},
    {entry_type:'buyer',route_path:'/buyer/',review_track:'home',review_reason:'new_home_or_vehicle',closing_date:'within_30_days',property_zip:'95112'},
    {entry_type:'life',route_path:'/life/',review_track:'life',review_reason:'family_income'},
    {entry_type:'professional',route_path:'/healthcare/',professional_program:'healthcare',professional_role:'clinical',review_track:'home',review_reason:'coverage_concern'},
    {entry_type:'professional',route_path:'/teachers/',professional_program:'teachers',professional_role:'teacher',review_track:'auto',review_reason:'comparison'},
    {entry_type:'professional',route_path:'/engineers/',professional_program:'engineers',professional_role:'mechanical',review_track:'bundle',review_reason:'price'},
    {entry_type:'professional',route_path:'/tech/',professional_program:'technology',professional_role:'software_engineering',review_track:'bundle',review_reason:'upcoming_renewal'}
  ];
  for(const input of cases){
    const mapping=mapWebToPvx({...base,...input});
    assert.equal(validateWebPvxMapping(mapping).valid,true,input.route_path);
    assert.equal(mapping.journey.experience,'appointment_only',input.route_path);
    assert.equal(mapping.context.appointment.active,true,input.route_path);
    assert.equal(mapping.context.appointment.fullAddressRequested,false,input.route_path);
    assert.equal(mapping.context.appointment.dateOfBirthRequested,false,input.route_path);
  }
});

test('SMS product entries carry only minimal context into secure appointment booking',()=>{
  const cases=[
    ['home_review',{housing:'homeowner',reviewReason:'renewal'}],
    ['auto',{autoNeed:'current_review'}],
    ['bundle',{housing:'renter',reviewReason:'price'}],
    ['buyer',{closingDateDisplay:'Within 30 days',propertyZip:'95112',autoReview:true}],
    ['life',{lifeGoal:'family_income'}],
    ['business',{businessType:'Bakery',businessNeed:'liability_property'}],
    ['tech',{professionalProgram:'technology',professionalRole:'software_engineering',housing:'homeowner',reviewTrack:'bundle'}]
  ];
  for(const [intent,answers] of cases){
    const mapping=mapSmsToPvx({conversationId:`sms-${intent}-12345678`,intent,answers,mobile:'+14085550199'});
    assert.equal(validateSmsPvxMapping(mapping).valid,true,intent);
    assert.equal(mapping.destination,'/pvx/appointment/',intent);
    assert.equal(mapping.journey.experience,'appointment_only',intent);
    assert.equal(mapping.contact.callConsent,false,intent);
    assert.equal(mapping.context.appointment.quoteDetailsDeferred,true,intent);
  }
});

test('appointment-first lead records preserve the compact product-specific brief',()=>{
  const normalized=normalizeLeadPayload({
    lead_checkpoint_id:'408d_workspace_context_123456',lead_stage:'started',first_name:'Maya',phone:'4085551234',
    contact_consent:true,contact_consent_state:'granted',contact_consent_version:'408farmers-agency-contact-v2',contact_consent_timestamp:'2026-09-03T16:00:00.000Z',
    source_key:'web_408_buyer',review_track:'bundle',review_reason:'new_home_or_vehicle',housing_context:'buyer',property_zip:'95112',closing_date:'within_30_days',source_type:'buyer'
  },{now:new Date('2026-09-03T16:00:00.000Z')});
  assert.equal(normalized.valid,true);
  assert.equal(normalized.value.context.reviewTrack,'bundle');
  assert.equal(normalized.value.context.propertyZip,'95112');
  assert.equal(normalized.value.context.closingDate,'within_30_days');
  assert.equal(normalized.value.context.sourceType,'buyer');
});

test('appointment UI is generic and supports both web and SMS journey cookies',()=>{
  const html=fs.readFileSync(path.join(root,'pvx/appointment/index.html'),'utf8');
  const script=fs.readFileSync(path.join(root,'assets/js/pvx-tech-appointment.js'),'utf8');
  assert.match(html,/Starting point/);
  assert.doesNotMatch(html,/Technology role/);
  assert.match(script,/api\/pvx\/web-journey/);
  assert.match(script,/api\/pvx\/sms-journey/);
  assert.match(script,/book_from_journey/);
});

test('an SMS appointment link books without inventing prior call consent',async()=>{
  const leadStore=new Store(),operationsStore=new Store();
  const conversation={id:'sms-life-appointment-1234',contactPhone:'+14085550199',intent:'life',answers:{lifeGoal:'family_income'},state:'coveragefit_ready',createdAt:'2026-09-03T16:00:00.000Z'};
  await upsertSmsLeadJourney(leadStore,conversation,{now:new Date('2026-09-03T16:00:00.000Z')});
  const started=await createSmsPvxJourney({conversationId:conversation.id,intent:'life',mobile:conversation.contactPhone,smsConsent:{status:'active',providerStatus:'subscribed',source:'ringcentral'},lifeGoal:'family_income'},{store:leadStore,now:new Date('2026-09-03T16:00:00.000Z')});
  const body=JSON.stringify({action:'book_from_journey',request_id:'dddddddd-dddd-4ddd-8ddd-dddddddddddd',date:'2026-09-04',time:'14:00',call_request:true,call_request_version:'408-callback-browser-booking-v1',call_request_timestamp:'2026-09-03T16:00:00.000Z'});
  const request=new Request('https://coveragefit.com/api/callback/journey-book',{method:'POST',body,headers:{Origin:'https://coveragefit.com','Content-Type':'application/json','X-CoverageFit-Callback-Version':'1',Cookie:`cf_pvx_sms_resume=${started.token}`}});
  const response=await handleJourneyWebBooking(request,{store:operationsStore,leadStore,env:{GOOGLE_CALENDAR_ID:'calendar',GOOGLE_CALENDAR_CLIENT_ID:'id',GOOGLE_CALENDAR_CLIENT_SECRET:'secret',GOOGLE_CALENDAR_REFRESH_TOKEN:'refresh',CALLBACK_TIME_ZONE:'America/Los_Angeles'},fetchImpl:calendarFetch,now:new Date('2026-09-03T16:00:00.000Z')});
  const responsePayload=await response.json();
  assert.equal(response.status,201,JSON.stringify(responsePayload));
  assert.equal(responsePayload.booked,true);
  const journey=await leadStore.get(await pvxSmsJourneyKey(started.token));
  assert.equal(journey.currentStage,'appointment_booked');
  assert.equal(journey.projection.appointmentStatus,'scheduled');
  const checkpointId=smsCheckpointId(conversation);
  const lead=await leadStore.get(await leadRecordKey(checkpointId));
  assert.equal(lead.identity.firstName,undefined);
  assert.equal(lead.identity.mobile,'4085550199');
  assert.equal(lead.context.lifeGoal,'family_income');
  assert.equal(lead.context.appointment.status,'scheduled');
  const card=projectUnifiedProducerRecord({},null,null,lead).earlyLead;
  assert.equal(card.firstName,'');
  assert.equal(card.mobile,'4085550199');
  assert.equal(card.lifeGoal,'family_income');
  assert.equal(card.appointment.status,'scheduled');
});
