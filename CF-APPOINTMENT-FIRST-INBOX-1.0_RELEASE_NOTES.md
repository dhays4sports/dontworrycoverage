# CoverageFit v3.20.224 — CF-APPOINTMENT-FIRST-INBOX-1.0

## Outcome

The Agent Workspace now treats short 408FARMERS intake records as appointment-first inquiries instead of incomplete homeowner Snapshots.

## Changes

- Displays phone-only inbound SMS leads without inventing a customer name.
- Updates the same SMS or web lead card when an appointment is booked.
- Shows source, review type, housing, professional role, review reason, and appointment status at a glance.
- Preserves and displays buyer ZIP and closing timing, auto request, life goal, business type, and business request when supplied.
- Adds All, Needs scheduling, Scheduled, and Today filters.
- Sorts today's and upcoming appointments ahead of unscheduled inquiries, with past appointments last.
- Adds an expandable compact intake brief and direct Call/Text actions.
- Separates appointment-first inquiries from deeper CoverageFit review records.
- Removes obsolete wording that implied every prospect should complete a full CoverageFit review.

## Boundaries

- SMS intake remains a reply-authorized relationship and does not infer automated marketing consent.
- Call access for an SMS lead is exposed only after that prospect books the call.
- No date of birth, street address, driver-license data, VIN, or policy document is added to the early lead card.
- No D1 schema migration or SQL console execution is required.

## Verification

- 101 regression tests passed.
- Changed JavaScript modules passed syntax validation.
