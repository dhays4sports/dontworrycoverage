# CoverageFit v3.20.222 — CF-SMS-CALL-NOW-1.0

CoverageFit now treats a prospect’s natural-language availability to talk immediately as a distinct human-handoff outcome instead of repeatedly asking for a calendar time.

## Behavior

- Replies such as “Now is good,” “I’m available now,” “I can talk right now,” and “Please call me now” stop the callback scheduler.
- CoverageFit acknowledges the prospect and tells them Dylan has been notified.
- No Google Calendar event is created for a call-now request.
- CoverageFit immediately sends Dylan an operational RingCentral SMS containing the prospect’s first name, mobile number, and exact inbound message.
- The inbound RingCentral message ID makes the producer alert idempotent, so webhook retries cannot create duplicate alerts.
- The conversation enters human takeover and the callback date/time reply context is explicitly cleared.
- Negative phrases such as “not now,” “I can’t talk now,” “I’m busy now,” and “don’t call me now” are excluded from the urgent path.
- Ordinary `ANYTIME` and explicit future date/time scheduling remain unchanged.

## Production configuration

The existing `PRODUCER_ALERT_PHONE` variable is used for both confirmed-appointment and call-now alerts. In production it should remain set to the producer’s separate mobile number in E.164 format.

No D1 migration is required. Only CoverageFit needs to be deployed for this change.
