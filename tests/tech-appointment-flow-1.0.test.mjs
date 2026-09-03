import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOrReusePvxWebJourney, pvxWebJourneyKey } from '../server/pvx-web-journey-core.mjs';
import { recoverLeadFromWebMapping, leadRecordKey } from '../server/lead-operations-core.mjs';
import { handleJourneyWebBooking } from '../server/callback-web-booking-core.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const NOW=new Date('2026-09-03T16:00:00.000Z');
const ENV={GOOGLE_CALENDAR_ID:'calendar-test-id',GOOGLE_CALENDAR_CLIENT_ID:'calendar-client-id',GOOGLE_CALENDAR_CLIENT_SECRET:'calendar-client-secret',GOOGLE_CALENDAR_REFRESH_TOKEN:'calendar-refresh-token',CALLBACK_TIME_ZONE:'America/Los_Angeles'};
const ALERT_ENV={...ENV,RINGCENTRAL_CLIENT_ID:'rc-client-id',RINGCENTRAL_CLIENT_SECRET:'rc-client-secret',RINGCENTRAL_JWT_TOKEN:'rc-jwt-token',RINGCENTRAL_FROM_NUMBER:'+14083276377',RINGCENTRAL_CONVERSATION_HASH_SECRET:'appointment-alert-test-secret-1234567890',PRODUCER_ALERT_PHONE:'+14085550199'};

class Store{
  constructor(){this.rows=new Map();}
  async get(key){return structuredClone(this.rows.get(key)||null);}
  async setJSON(key,value,options={}){if(options.onlyIfNew&&this.rows.has(key))throw new Error('duplicate');this.rows.set(key,structuredClone(value));}
  async delete(key){this.rows.delete(key);}
}

function google(){
  const events=new Map();
  return async(url,init={})=>{
    const href=String(url);
    if(href==='https://oauth2.googleapis.com/token')return Response.json({access_token:'token'});
    if(href==='https://www.googleapis.com/calendar/v3/freeBusy')return Response.json({calendars:{'calendar-test-id':{busy:[]}}});
    if(/\/events$/.test(href)&&init.method==='POST'){const event=JSON.parse(init.body);events.set(event.id,event);return Response.json({...event,htmlLink:`https://calendar.google.com/event/${event.id}`});}
    if(/\/events\/[a-f0-9]{32,64}$/.test(href)&&init.method==='GET')return Response.json({}, {status:404});
    throw new Error(`Unexpected request: ${init.method||'GET'} ${href}`);
  };
}

function googleAndRingCentral(){
  const events=new Map();
  const sms=[];
  return {
    sms,
    fetch:async(url,init={})=>{
      const href=String(url);
      if(href==='https://oauth2.googleapis.com/token')return Response.json({access_token:'google-token'});
      if(href==='https://www.googleapis.com/calendar/v3/freeBusy')return Response.json({calendars:{'calendar-test-id':{busy:[]}}});
      if(/\/events$/.test(href)&&init.method==='POST'){const event=JSON.parse(init.body);events.set(event.id,event);return Response.json({...event,htmlLink:`https://calendar.google.com/event/${event.id}`});}
      if(/\/events\/[a-f0-9]{32,64}$/.test(href)&&init.method==='GET')return Response.json({}, {status:404});
      if(href==='https://platform.ringcentral.com/restapi/oauth/token')return Response.json({access_token:'rc-token',expires_in:3600});
      if(href.endsWith('/restapi/v1.0/account/~/extension/~/sms')&&init.method==='POST'){
        const message=JSON.parse(init.body);sms.push(message);return Response.json({id:`rc-alert-${sms.length}`});
      }
      throw new Error(`Unexpected request: ${init.method||'GET'} ${href}`);
    }
  };
}

const source={
  bootstrap_id:'pvxb_appointmentcontract1234567890',entry_type:'professional',route_path:'/tech/',host_mode:'408farmers',source:'408farmers',customer_selection:'review_home_auto',product_track:'bundle',campaign:'TECH Appointment',
  journey_goal:'appointment',review_track:'bundle',review_reason:'upcoming_renewal',housing_context:'homeowner',
  lead_capture_status:'confirmed',contact_consent:'true',first_name:'Sarah',phone:'4085551234',lead_checkpoint_id:'408d_appointmentlead1234567890',consent_at:NOW.toISOString(),consent_version:'408farmers-agency-contact-v2',
  professional_program:'technology',professional_role:'software_engineering',professional_role_label:'Software engineering'
};

test('a valid technology appointment journey bypasses discovery',async()=>{
  const store=new Store();
  const result=await createOrReusePvxWebJourney(source,{store,sourceOrigin:'https://408farmers.com',now:NOW});
  assert.equal(result.mapping.journey.experience,'appointment_only');
  assert.equal(result.record.currentStage,'appointment_requested');
  assert.equal(result.record.seed.context.appointment.reviewTrack,'bundle');
  assert.equal(result.record.seed.context.appointment.reason,'upcoming_renewal');
  assert.equal(result.record.seed.context.appointment.housing,'homeowner');
});

test('booking updates the same lead and journey before opening confirmation',async()=>{
  const store=new Store();
  const started=await createOrReusePvxWebJourney(source,{store,sourceOrigin:'https://408farmers.com',now:NOW});
  await recoverLeadFromWebMapping(started.mapping,{store,env:{},now:NOW,waitUntil:()=>{}});
  const body=JSON.stringify({action:'book_from_tech_journey',request_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',date:'2026-09-04',time:'14:00',call_request:true,call_request_version:'408-callback-browser-booking-v1',call_request_timestamp:NOW.toISOString()});
  const request=new Request('https://coveragefit.com/api/callback/journey-book',{method:'POST',body,headers:{Origin:'https://coveragefit.com','Content-Type':'application/json','X-CoverageFit-Callback-Version':'1',Cookie:`cf_pvx_web_resume=${started.token}`}});
  const response=await handleJourneyWebBooking(request,{store,leadStore:store,env:ENV,fetchImpl:google(),now:NOW,waitUntil:()=>{}});
  assert.equal(response.status,201);
  const payload=await response.json();
  assert.equal(payload.booked,true);
  assert.match(payload.appointment.calendarUrl,/\/appointment\/\?token=/);
  const lead=await store.get(await leadRecordKey(source.lead_checkpoint_id));
  assert.equal(lead.stage,'contact_requested');
  assert.equal(lead.context.reviewReason,'upcoming_renewal');
  assert.equal(lead.context.appointment.status,'scheduled');
  const journey=await store.get(await pvxWebJourneyKey(started.token));
  assert.equal(journey.currentStage,'appointment_booked');
  assert.equal(journey.projection.requestedProducerAction,'contact_requested');
});

test('confirmed appointment sends one immediate idempotent RingCentral alert to the producer',async()=>{
  const leadStore=new Store();
  const smsStore=new Store();
  const alertedSource={...source,bootstrap_id:'pvxb_produceralert1234567890123',lead_checkpoint_id:'408d_produceralertlead123456789'};
  const started=await createOrReusePvxWebJourney(alertedSource,{store:leadStore,sourceOrigin:'https://408farmers.com',now:NOW});
  await recoverLeadFromWebMapping(started.mapping,{store:leadStore,env:{},now:NOW,waitUntil:()=>{}});
  const body=JSON.stringify({action:'book_from_tech_journey',request_id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',date:'2026-09-04',time:'14:00',call_request:true,call_request_version:'408-callback-browser-booking-v1',call_request_timestamp:NOW.toISOString()});
  const request=()=>new Request('https://coveragefit.com/api/callback/journey-book',{method:'POST',body,headers:{Origin:'https://coveragefit.com','Content-Type':'application/json','X-CoverageFit-Callback-Version':'1',Cookie:`cf_pvx_web_resume=${started.token}`}});
  const provider=googleAndRingCentral();
  const first=await handleJourneyWebBooking(request(),{store:smsStore,leadStore,env:ALERT_ENV,fetchImpl:provider.fetch,now:NOW,waitUntil:()=>{}});
  assert.equal(first.status,201);
  assert.equal((await first.json()).producerAlert.status,'sent');
  assert.equal(provider.sms.length,1);
  assert.equal(provider.sms[0].from.phoneNumber,'+14083276377');
  assert.equal(provider.sms[0].to[0].phoneNumber,'+14085550199');
  assert.match(provider.sms[0].text,/New CoverageFit appointment/);
  assert.match(provider.sms[0].text,/Sarah — Software engineering/);
  assert.match(provider.sms[0].text,/Homeowner · Home \+ auto/);
  assert.match(provider.sms[0].text,/Reason: Upcoming renewal/);
  assert.match(provider.sms[0].text,/Mobile: \(408\) 555-1234/);
  assert.match(provider.sms[0].text,/no reply needed/i);

  const retry=await handleJourneyWebBooking(request(),{store:smsStore,leadStore,env:ALERT_ENV,fetchImpl:provider.fetch,now:NOW,waitUntil:()=>{}});
  assert.equal(retry.status,200);
  assert.equal((await retry.json()).producerAlert.status,'sent');
  assert.equal(provider.sms.length,1);
});

test('ordinary CoverageFit journeys cannot call the appointment endpoint',async()=>{
  const store=new Store();
  const ordinary={...source,bootstrap_id:'pvxb_ordinarycontract12345678901',journey_goal:'',review_reason:''};
  const started=await createOrReusePvxWebJourney(ordinary,{store,sourceOrigin:'https://408farmers.com',now:NOW});
  const body=JSON.stringify({action:'book_from_tech_journey',request_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',date:'2026-09-04',time:'14:00',call_request:true,call_request_version:'408-callback-browser-booking-v1',call_request_timestamp:NOW.toISOString()});
  const request=new Request('https://coveragefit.com/api/callback/journey-book',{method:'POST',body,headers:{Origin:'https://coveragefit.com','Content-Type':'application/json','X-CoverageFit-Callback-Version':'1',Cookie:`cf_pvx_web_resume=${started.token}`}});
  const response=await handleJourneyWebBooking(request,{store,leadStore:store,env:ENV,fetchImpl:google(),now:NOW});
  assert.equal(response.status,409);
  assert.equal((await response.json()).error.code,'appointment_journey_required');
});

test('the polished CoverageFit booking page has no alternate completion route',()=>{
  const html=read('pvx/appointment/index.html');
  const script=read('assets/js/pvx-tech-appointment.js');
  assert.match(html,/Choose a time with Dylan/);
  assert.match(html,/Confirm my appointment/);
  assert.match(script,/book_from_journey/);
  assert.doesNotMatch(html,/Keep exploring|Snapshot|Call me when available|No contact|Text Dylan/);
});
