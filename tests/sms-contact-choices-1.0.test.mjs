import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  SMS_CONTACT_CHOICES_MESSAGE,
  routeSmsInbound
} from '../server/sms-conversation-core.mjs';
import {
  handleCallbackInbound,
  isCallNowRequest,
  shouldHandleCallbackInbound
} from '../server/sms-callback-scheduling-core.mjs';

const completionTurns = [
  routeSmsInbound({ state: 'buyer_bundle_requested', answers: {} }, 'YES'),
  routeSmsInbound({ state: 'home_review_reason_requested', answers: {} }, '1'),
  routeSmsInbound({ state: 'bundle_occupancy_requested', answers: {} }, '1'),
  routeSmsInbound({ state: 'auto_need_requested', answers: {} }, '1'),
  routeSmsInbound({ state: 'life_goal_requested', answers: {} }, '1'),
  routeSmsInbound({ state: 'business_need_requested', answers: {} }, '1'),
  routeSmsInbound({ state: 'tech_review_requested', answers: {} }, '1')
];

test('every primary SMS intake completion visibly offers CALLBACK and ANYTIME', () => {
  for (const turn of completionTurns) {
    assert.match(turn.reply, /reply CALLBACK to choose a time/i);
    assert.match(turn.reply, /ANYTIME if Dylan may call when available/i);
    assert.ok(turn.reply.endsWith(SMS_CONTACT_CHOICES_MESSAGE));
  }
});

test('ANYTIME works as an independent contact choice and records auditable intent', async () => {
  assert.equal(shouldHandleCallbackInbound({}, 'ANYTIME'), true);
  const result = await handleCallbackInbound({ answers: { lifeGoal: 'family_income' } }, 'ANYTIME', {
    now: new Date('2026-09-01T18:00:00.000Z')
  });
  assert.equal(result.handled, true);
  assert.equal(result.contactChoice, 'anytime');
  assert.equal(result.conversation.callbackScheduling.status, 'call_anytime_requested');
  assert.equal(result.conversation.answers.callAnytimeRequested, true);
  assert.equal(result.conversation.answers.callAnytimeRequestedAt, '2026-09-01T18:00:00.000Z');
  assert.match(result.reply, /may call you at this number when he is available/i);
});

test('CALLBACK still opens the existing date-and-time scheduling path', async () => {
  const result = await handleCallbackInbound({}, 'CALLBACK', {
    now: new Date('2026-09-01T18:00:00.000Z')
  });
  assert.equal(result.handled, true);
  assert.equal(result.conversation.callbackScheduling.status, 'callback_requested');
  assert.match(result.reply, /best day and time/i);
});

test('natural call-now replies pivot to urgent human handoff without touching Google Calendar', async () => {
  const positive = [
    "Today is good. I'm available now.",
    'Now is good.',
    'I can talk right now',
    'Please call me now'
  ];
  for (const reply of positive) assert.equal(isCallNowRequest(reply), true, reply);

  const result = await handleCallbackInbound({
    answers: { firstName: 'Anice' },
    callbackScheduling: {
      status: 'clarification_needed',
      pendingDay: { year: 2026, month: 9, day: 3 },
      pendingTime: { hour: 15, minute: 0 }
    }
  }, "Today is good. I'm available now.", {
    now: new Date('2026-09-03T20:20:00.000Z'),
    fetchImpl: async () => { throw new Error('Google Calendar must not be called for NOW.'); }
  });
  assert.equal(result.handled, true);
  assert.equal(result.contactChoice, 'now');
  assert.equal(result.conversation.callbackScheduling.status, 'call_now_requested');
  assert.equal(result.conversation.callbackScheduling.pendingDay, null);
  assert.equal(result.conversation.callbackScheduling.pendingTime, null);
  assert.equal(result.conversation.answers.callNowRequested, true);
  assert.equal(result.conversation.answers.callNowRequestedAt, '2026-09-03T20:20:00.000Z');
  assert.match(result.reply, /let Dylan know you’re available now/i);
});

test('negative now phrases never create an urgent call alert', () => {
  const negative = [
    'Not now',
    "I can't talk now",
    "I'm not available now",
    "I'm busy right now",
    "Don't call me now"
  ];
  for (const reply of negative) assert.equal(isCallNowRequest(reply), false, reply);
});

test('ANYTIME and NOW acknowledgements do not leave a date parser armed', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const source = fs.readFileSync(path.join(root, 'server/ringcentral-sms-connection-core.mjs'), 'utf8');
  assert.match(source, /const callAnytime = callbackResult\.contactChoice === 'anytime'/);
  assert.match(source, /const callNow = callbackResult\.contactChoice === 'now'/);
  assert.match(source, /const exitsScheduling = callAnytime \|\| callNow/);
  assert.match(source, /replyContext: exitsScheduling \? '' : 'callback_time_request'/);
});
