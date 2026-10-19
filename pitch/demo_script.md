# 90-second demo script

This script follows the five-beat offline demo. The narration is deliberately
honest: the policy, fake tools, cassette, fallback predicate, admission proof,
and gate are deterministic and local.

## Beat 1 — capture the mistake (0:00–0:15)

**Action:** Start `grudge demo` and let the trace timeline fill.

**Narration:** “Agents do not need a spectacular exploit to make a costly
mistake. In this example, a poisoned email tells a gullible policy to read
`api_keys.txt` and send the result to an attacker-controlled URL. Grudge records
the real tool calls and results as a typed trace, without contacting a provider
or the network.”

## Beat 2 — shrink the world (0:15–0:32)

**Action:** Pause on the shrink panel as ordinary entries disappear and the
counter moves toward the three surviving entries.

**Narration:** “The trace is too large to review, so Grudge freezes the external
world in a cassette and keeps the policy live. Delta debugging removes entries,
then content reducers remove irrelevant detail, but each candidate must still
reproduce the failure. What remains is the poisoned email, the secret read, and
the sink call: a small causal reproducer rather than a copied transcript.”

## Beat 3 — write the rule (0:32–0:49)

**Action:** Show the predicate card and its provenance badge.

**Narration:** “From that reproducer, Grudge produces a readable behavioral
predicate: never allow data read from a key file to flow into the HTTP body.
The offline path uses a hand-verified fallback rule; an optional model may draft
text later, but the local parser and compiler decide what is executable and show
the exact trace evidence.”

## Beat 4 — prove the Scar (0:49–1:10)

**Action:** Show the admission panel: red vulnerable agent, green fixed agent,
and clean controls.

**Narration:** “A rule does not enter the suite because it sounds plausible.
Admission runs the vulnerable agent and requires witnessed red violations, then
runs the defended agent and requires successful green replays. It also checks
nonempty benign controls and fails closed on replay or checker errors. That proof
packages the cassette, predicate, provenance, and evidence into a Scar.”

## Beat 5 — block the regression (1:10–1:30)

**Action:** Show the fixed gate passing, swap back to the vulnerable agent, and
let the PR-style regression comment appear.

**Narration:** “Finally, the gate repeats the admitted Scar. The fixed agent
passes, and the Wilson lower bound is compared with the threshold. When the
vulnerable policy is reintroduced, the gate turns red and produces a reviewable
regression comment. Grudge turns one agent mistake into a deterministic scar so
the same mistake has a place to fail next time.”
