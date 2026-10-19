# ADR 0001: CLI-first with a supporting viewer

**Purpose:** Record the product-shape decision that keeps Grudge useful from a shell while making the buildathon story visible.
**Audience:** Contributors choosing where user-facing behavior belongs, and reviewers evaluating scope.
**Status:** accepted
**Last updated (phase):** 0

- **Date:** 2026-10-15
- **Context:** Grudge must be scriptable in CI and understandable during a short live demonstration. A browser-only product would make automation and offline testing harder; a CLI-only product would hide the value of shrinking and statistical evidence from a judge.
- **Decision:** Make the CLI the primary interface for capture, shrink, admission, gating, and demo orchestration. Add a small static viewer that consumes demo events and renders progress, but keep pipeline state and decisions in the Python engine. The viewer has no build step and is not required for headless CLI use.
- **Alternatives considered:**
  - **Viewer-first application:** Rejected because it couples core behavior to a browser and complicates CI and offline tests.
  - **CLI only:** Rejected because the shrink animation and red/green admission proof are central to communicating the idea quickly.
  - **Hosted SaaS dashboard:** Rejected because it adds authentication, network availability, and deployment scope before the deterministic core is proven.
- **Consequences:** The engine gets stable command and event contracts. The viewer remains intentionally thin and replaceable. Demo work must expose meaningful events, and the static page must degrade cleanly when no local server is running. This keeps the MVP compatible with the pipeline described in [`architecture.md`](../architecture.md); only full Scar registry browsing remains deferred in [`roadmap.md`](../roadmap.md).
