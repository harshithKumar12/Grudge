### Lane A → integrator: doctor budget measurements
- Phase 20 exposes `measureOutputs()` and `CAPS` from `src/core/budget.js`.
- Please update owned `commands/doctor.js` to measure the four injected outputs.
- Print each measured character count and cap, and fail the doctor check if any exceeds its cap.
- Use `measureOutputs({ sessionStart, blockReason, promptNudge, agentsBlock })`; empty strings are valid measurements.
- Keep the existing doctor ownership and do not change the shared interfaces.
