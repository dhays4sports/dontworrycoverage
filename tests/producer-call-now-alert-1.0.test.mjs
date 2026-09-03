import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildProducerCallNowAlert,
  sendProducerCallNowAlert
} from '../server/producer-booking-alert-core.mjs';
import { handleRingCentralWebhook } from '../server/ringcentral-sms-connection-core.mjs';
import { smsLiveConversationId } from '../server/sms-outbound-gateway.mjs';

const NOW = new Date('2026-09-03T20:20:00.000Z');
const ENV = {
  RINGCENTRAL_CLIENT_ID: 'rc-client-id',
  RINGCENTRAL_CLIENT_SECRET: 'rc-client-secret',
  RINGCENTRAL_JWT_TOKEN: 'rc-jwt-token',
  RINGCENTRAL_FROM_NUMBER: '+14083276377',
  RINGCENTRAL_CONVERSATION_HASH_SECRET: 'call-now-alert-test-secret-1234567890',
  PRODUCER_ALERT_PHONE: '+14085550199'
};

class Store {
  constructor() { this.rows = new Map(); }
  async get(key) { return structuredClone(this.rows.get(key) || null); }
  async setJSON(key, value, options = {}) {
    if (options.onlyIfNew && this.rows.has(key)) throw new Error('duplicate');
    this.rows.set(key, structuredClone(value));
  }
  async delete(key) { this.rows.delete(key); }
}

function ringCentral() {
  const sms = [];
  return {
    sms,
    fetch: async (url, init = {}) => {
      const href = String(url);
      if (href === 'https://platform.ringcentral.com/restapi/oauth/token') return Response.json({ access_token: 'rc-token', expires_in: 3600 });
      if (href.endsWith('/restapi/v1.0/account/~/extension/~/sms') && init.method === 'POST') {
        const message = JSON.parse(init.body);
        sms.push(message);
        return Response.json({ id: `rc-call-now-${sms.length}` });
      }
      throw new Error(`Unexpected request: ${init.method || 'GET'} ${href}`);
    }
  };
}

test('call-now producer alert is concise and includes the customer message', () => {
  const body = buildProducerCallNowAlert({
    firstName: 'Anice',
    prospectPhone: '7143690815',
    customerMessage: "Today is good. I'm available now."
  });
  assert.match(body, /^CALL-NOW REQUEST/m);
  assert.match(body, /^Anice$/m);
  assert.match(body, /Mobile: \(714\) 369-0815/);
  assert.match(body, /Customer: “Today is good\. I'm available now\.”/);
  assert.match(body, /Call as soon as you are available/);
});

test('call-now producer alert is sent once through the audited RingCentral gateway', async () => {
  const store = new Store();
  const provider = ringCentral();
  const input = {
    eventId: 'rc-inbound-call-now-12345',
    firstName: 'Anice',
    prospectPhone: '+17143690815',
    customerMessage: 'Now is good.'
  };
  const first = await sendProducerCallNowAlert(input, { store, env: ENV, fetchImpl: provider.fetch, now: NOW });
  const retry = await sendProducerCallNowAlert(input, { store, env: ENV, fetchImpl: provider.fetch, now: NOW });
  assert.equal(first.status, 'sent');
  assert.equal(retry.status, 'sent');
  assert.equal(retry.deduped, true);
  assert.equal(provider.sms.length, 1);
  assert.equal(provider.sms[0].from.phoneNumber, '+14083276377');
  assert.equal(provider.sms[0].to[0].phoneNumber, '+14085550199');
  assert.match(provider.sms[0].text, /CALL-NOW REQUEST/);
});

test('live webhook pivots NOW to human handoff, acknowledges the prospect, and alerts the producer', async () => {
  const store = new Store();
  const provider = ringCentral();
  const env = {
    ...ENV,
    RINGCENTRAL_WEBHOOK_URL: 'https://coveragefit.com/api/sms/ringcentral/webhook',
    RINGCENTRAL_WEBHOOK_VALIDATION_TOKEN: 'call-now-validation-token'
  };
  const prospectPhone = '+17143690815';
  const conversationId = await smsLiveConversationId(prospectPhone, env.RINGCENTRAL_FROM_NUMBER, env.RINGCENTRAL_CONVERSATION_HASH_SECRET);
  await store.setJSON(`sms-live-conversations/${conversationId}`, {
    id: conversationId,
    contactPhone: prospectPhone,
    businessPhone: env.RINGCENTRAL_FROM_NUMBER,
    state: 'human_takeover',
    answers: { firstName: 'Anice' },
    callbackScheduling: { status: 'clarification_needed', pendingDay: { year: 2026, month: 9, day: 3 } },
    transcript: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString()
  });
  const payload = {
    uuid: 'webhook-call-now-0001',
    timestamp: NOW.toISOString(),
    body: {
      id: 'rc-live-call-now-0001',
      type: 'SMS',
      direction: 'Inbound',
      creationTime: NOW.toISOString(),
      subject: "Today is good. I'm available now.",
      from: { phoneNumber: prospectPhone },
      to: [{ phoneNumber: env.RINGCENTRAL_FROM_NUMBER, target: true }]
    }
  };
  const request = new Request(env.RINGCENTRAL_WEBHOOK_URL, {
    method: 'POST',
    body: JSON.stringify(payload),
    headers: { 'Content-Type': 'application/json', 'Validation-Token': env.RINGCENTRAL_WEBHOOK_VALIDATION_TOKEN }
  });
  const response = await handleRingCentralWebhook(request, { store, env, fetchImpl: provider.fetch, now: NOW });
  assert.equal(response.status, 200);
  const result = await response.json();
  assert.equal(result.callbackStatus, 'call_now_requested');
  assert.equal(result.producerAlertStatus, 'sent');
  assert.equal(result.state, 'human_takeover');
  assert.equal(provider.sms.length, 2);
  assert.equal(provider.sms[0].to[0].phoneNumber, prospectPhone);
  assert.match(provider.sms[0].text, /let Dylan know you’re available now/i);
  assert.equal(provider.sms[1].to[0].phoneNumber, ENV.PRODUCER_ALERT_PHONE);
  assert.match(provider.sms[1].text, /CALL-NOW REQUEST/);
  assert.match(provider.sms[1].text, /Anice/);

  const conversation = await store.get(`sms-live-conversations/${conversationId}`);
  assert.equal(conversation.callbackScheduling.status, 'call_now_requested');
  assert.equal(conversation.callbackScheduling.producerAlert.status, 'sent');
  assert.equal(conversation.orchestration.replyContext, null);
});

test('missing producer alert number fails closed without affecting the customer state', async () => {
  const result = await sendProducerCallNowAlert({ eventId: 'rc-inbound-call-now-12345' }, { store: new Store(), env: {} });
  assert.deepEqual(result, {
    status: 'skipped',
    reason: 'producer_alert_phone_missing',
    build: 'CF-PRODUCER-BOOKING-ALERT-1.1'
  });
});
