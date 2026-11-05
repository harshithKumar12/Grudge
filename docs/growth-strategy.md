# Growth strategy

**Purpose:** Plan how Grudge reaches developers who need it, where to engage, what content to produce, and which signals to track.
**Audience:** The maintainer deciding what to publish and where.
**Status:** draft
**Last updated (phase):** 0.2.3

How Grudge reaches developers who actually need it. The goal is not stars. It is
people who hit the same agent mistake twice, install the guard, and stay.

Everything below is a plan, not a record of results. Nothing has been posted,
emailed, or sent anywhere yet.

## Where the audience already is

Ranked by how well the audience matches Grudge's actual value. Verify each
community's current rules and activity before posting, since sizes and norms
change and this list was assembled without live access to Reddit.

### 1. r/ClaudeAI

The closest match. These users run Claude Code daily, hit the same
permission-prompt and runaway-command problems, and already accept hooks as a
concept. Grudge's strongest demo — a `PreToolUse` hook that exits `2` with a
reason — is native to their setup.

**Angle:** do not lead with the product. Answer "how do I stop Claude from
running `rm -rf` again" style threads with the hook pattern, and mention Grudge
only when someone asks how to persist it across sessions.

### 2. r/ClaudeCode and Claude Code GitHub Discussions

Smaller and more technical than r/ClaudeAI. Better conversion per view.
Discussions is where hook and permission questions get filed as issues.

**Angle:** the `verify` command's 10-check output is a concrete artifact that
belongs in a troubleshooting reply, not a launch post.

### 3. Hacker News (Show HN)

One shot, and the audience is unforgiving about vapourware. Grudge's honesty
sections — the Limits and Benchmark status — are an asset here, not a weakness.
Lead with the deterministic-replay claim and the fact that there is no model in
the loop.

**Angle:** Show HN after the README rewrite lands, ideally paired with one real
user story. A tool with 2 stars and no users asking for attention reads badly.

### 4. r/LocalLLaMA and r/AIAgents

Adjacent, not core. Replay and cassette-based determinism appeals to people
running local models, but most threads are about models, not agent safety.

**Angle:** only engage where the topic is already agent reliability. Low
priority until there is a concrete result to show.

### 5. LinkedIn

Weakest for a CLI tool technically, strongest for the "AI agents repeat
mistakes" narrative to engineering managers who own agent rollouts.

**Angle:** short posts about a specific failure class, not product announcements.

### Communities to skip

- General programming subs (r/ExperiencedDevs, r/programming): off-topic, and
  self-promotion is removed fast.
- Any "AI tools" directory or auto-tweet bot: no real users, inflates nothing
  that matters.

## Content plan

The pipeline has to produce things worth reading before anything gets posted.

**1. The failure gallery (highest value, do first).**
A page of five real, anonymised agent failures — the trace, the scar, the
predicate, and the evidence that the fix holds. This is the single most useful
asset because it shows what a scar actually looks like instead of describing it.

**2. A two-minute demo.** The existing `demo --guard` script already runs
offline. Record it. People will not run a Python package to find out whether an
idea is interesting.

**3. Release notes as content.** 0.2.3 was a docs release and still contained a
real insight: `setup -y` and the fully-flagged form write an identical tree.
That is a post, not just a changelog line.

**4. One honest comparison.** Grudge vs. eval frameworks (promptfoo, Braintrust)
and vs. transcript replay. The differentiator is that a scar is a *failing test
that blocks*, not a score that observes. Write it as a table with the cases
where the others are the better choice.

## Cadence

Sustainable beats aggressive. One meaningful artifact every two weeks:

- week 1: write the artifact (gallery entry, demo clip, comparison);
- week 2: post it in exactly one place, then spend the rest of the week
  answering questions in threads where the topic came up naturally.

Do not post the same link in five communities on the same day. That is the
pattern that gets accounts banned.

## What to measure

Track these monthly, not weekly — at this size, weekly numbers are noise:

| Signal | Why it matters | Where |
|---|---|---|
| npm + PyPI downloads | Actual installs, the only number that is not vanity | npm stats, pepy.tech |
| Issues opened by non-authors | Proof someone got far enough to hit a bug | GitHub |
| Stars | Weak, but tracks discoverability | GitHub |
| `verify` failures | Install friction — the biggest drop-off risk | user reports |
| Referrer traffic | Which community actually sent people | GitHub traffic |

Ignore fork count and watchers until there is a contributor base.

## The honest risk

A guard that blocks tool calls has a hard adoption barrier: a false positive
stops real work, and users uninstall after one bad block. The fail-open design
helps, but the first impression is everything. That argues for leading with
`verify` — which proves it works before anyone trusts it with their repo — and
against promoting it to anyone who has not already been bitten by a repeated
mistake.

## Sequencing

1. README restructure and `CONTRIBUTING.md` — done.
2. Build the failure gallery.
3. Record the demo.
4. Post the gallery to exactly one community and watch what happens.
5. Expand only if step 4 produces issues or questions from strangers.
