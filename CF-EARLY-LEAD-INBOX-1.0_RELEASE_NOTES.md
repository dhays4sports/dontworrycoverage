# CoverageFit v3.20.219 — CF-EARLY-LEAD-INBOX-1.0

The Agent Workspace Inbox now includes an explicit **New 408FARMERS leads** section for early first-name and phone checkpoints.

- The section loads from the producer-authorized unified PVX endpoint.
- It refreshes on the real `coveragefit:producer-inbox-synced` event used by the Sync Inbox control.
- Each lead shows name, formatted phone number, source, technology role when present, housing context, stage, and received time.
- Consent-bounded Call and Text actions are available directly from the lead card.
- Completed consultation records remain separate and continue to appear under Homeowner Reviews.
- Asset query versions prevent a previously cached Workspace script from hiding the new behavior after deployment.

No D1 schema change or SQL migration is required. Existing D1 lead records become visible immediately after deployment and Sync Inbox.
