# TECH-PVX-UX-1.1 — CoverageFit v3.20.217

## Journey continuity

- Compares the incoming secure journey ID with the browser’s prior CoverageFit journey ID.
- When the IDs differ, clears stale browser-only Snapshot, branch-answer, topic-response, readiness, continuation, checkpoint, Home Profile, property-cache, and assessment-draft state before writing the new journey.
- When the IDs match, preserves browser state so a legitimate resume remains a resume.

## Preserved experience and infrastructure

- Keeps the technology role/homeowner-or-renter first look and **Worth verifying** professional-discount boundary.
- Keeps the simplified completed Snapshot with two primary actions and two secondary actions.
- Keeps submission-scoped fresh-versus-retry handling, D1 persistence, lead sync, consent evidence, callback booking, RingCentral SMS, automatic maintenance, and strict health behavior.

Verification: `npm test` — 77 passed, 0 failed.
