# CoverageFit v3.20.221 — CF-TECH-APPOINTMENT-1.0

CoverageFit now accepts a narrowly validated appointment-only journey from the 408FARMERS `/tech/` campaign.

## Behavior

- A valid secure technology handoff bypasses discovery and Snapshot.
- The prospect sees the context already shared and selects an exact date and time in CoverageFit.
- The server verifies the appointment-only journey, saved identity, and explicit call permission before checking Google Calendar.
- A successful booking advances the same web journey and early-lead record to `contact_requested` and stores the appointment display, start, and end.
- Agent Workspace early-lead cards show role, housing, review type, reason, and confirmed appointment.
- Confirmation opens the existing polished CoverageFit appointment page with Google Calendar and device-calendar options.
- Ordinary CoverageFit journeys cannot invoke the technology appointment endpoint.
- After Google Calendar confirms an appointment, CoverageFit sends an immediate operational alert through the existing RingCentral connection to the separately configured producer mobile number.
- The alert includes only the first name, professional role, housing context, review type, reason, appointment time, and prospect mobile number.
- The appointment request ID makes the producer alert idempotent, so browser retries do not produce duplicate texts.
- Alert delivery is isolated from booking completion: a temporary RingCentral failure never removes or invalidates a confirmed Google Calendar appointment.

## Required production variable

Set `PRODUCER_ALERT_PHONE` in the CoverageFit Cloudflare Pages environment to the producer’s separate mobile number in E.164 format. It must not match `RINGCENTRAL_FROM_NUMBER`.

No D1 migration is required.
