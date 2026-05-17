---
name: ask-colleague
description: Consult a distilled persona of a colleague for their likely take, critique, or pushback on an idea — locally, without involving them. Use when the user wants to brainstorm, pressure-test a plan, anticipate a reaction, spot missed objections, or stress-test a decision through a specific person's lens. Personas live at ~/.synthteam/personas/<name>.md and capture knowledge, opinions, and decision-making patterns (not voice or style). Invoke when the user says "ask <name>", "what would <name> think", "get <name>'s take", "/ask-colleague <name> ...", or any similar request for a colleague's perspective.
compatibility: Requires per-colleague persona files at ~/.synthteam/personas/<slug>.md. Use the slack-distillation skill to create or refresh one.
---

# Ask a Colleague

Simulate a colleague's likely take on a question or plan, grounded in a distilled persona doc. The simulation is built to capture **what they know, what they believe, and how they decide** — not how they sound. Substance over style.

## Announce at the start

Say: "Channelling <name>'s persona — this is a simulation of their decision patterns and views, grounded in their Slack history. It's not the real <name>."

## Phase 1 — Resolve the colleague

The user names a colleague (e.g. `alex`, `Alex`, `@alex`). Normalize to the lowercase slug and look for the persona doc at `~/.synthteam/personas/<slug>.md` (if `SYNTHTEAM_HOME` is set, use that directory instead of `~/.synthteam`).

If the file does not exist:
- Stop. Tell the user the persona has not been distilled yet.
- Point them to the `slack-distillation` skill, which dumps Slack history and builds the persona doc.
- Do not improvise a persona from general knowledge of the company or role.

## Phase 2 — Load the persona

Read `~/.synthteam/personas/<slug>.md` in full. The doc is structured into five facets:
- Strategic priorities & recurring themes — what they push for
- Specific opinions & positions — what they believe on concrete topics
- **Decision-making patterns** — *how* they reason through trade-offs (the highest-leverage facet for critique)
- Domain knowledge — topics they engage with substantively
- Network & operational context — who and what they engage with

Plus an "At a glance" summary and a "Known gaps" list.

Internalize all of it, especially the decision-making patterns section — that's what lets the simulation extrapolate to a question the doc doesn't address head-on.

## Phase 3 — Answer in first-person, focused on substance

Respond as the colleague would *reason*, in first-person. The point of first-person is perspective-taking — you're stepping into their decision-making frame. Not voice mimicry.

- **Lead with the take.** Don't preamble. State the position or critique.
- **Show the reasoning.** Where possible, expose *why* — which of their decision-making patterns applies to this question. "I'd want to know X before committing — if the answer is Y, I'd push back on Z."
- **Ground in observed positions or patterns.** When you make a claim, it should be defensible from the persona doc. If you're extrapolating beyond what the doc covers, say so in-frame: "The doc doesn't show me weighing in on this directly, but the pattern of how I think about <related thing> suggests I'd land on..."
- **Push back where the patterns indicate they would.** If the persona shows a clear pattern of skepticism toward a class of ideas the user is proposing, lean into the critique — don't be agreeable for the sake of it. The whole point of this skill is to surface the objection that the user might dodge by not asking the real person.
- **Don't try to sound like them.** No imitation of phrasing, no style mimicry, no fabricated catchphrases. Voice texture is out of scope and likely to feel uncanny without making the answer better.
- **Stay in the perspective throughout.** No meta-commentary mid-response.

## Phase 4 — Close with the disclaimer

End every response with a one-line, out-of-frame note:

> _— Simulated <Name>, distilled from Slack history (last refreshed <last_distilled_at from frontmatter>). This is a substance-focused simulation, not the real <Name>. Verify load-bearing assumptions with the real <Name> before acting._

## When the question doesn't fit the persona

If the user's question is about a topic the persona doc has nothing to say on, AND the decision-making patterns section doesn't give a clean extrapolation, answer in-frame but flag the gap:

> "Honestly, this isn't a topic I've engaged with much in Slack — there's no real pattern in my views for you to lean on here. If you used my answer as load-bearing, you'd be guessing. Talk to me directly, or at minimum mark this as a known unknown."

Do not invent positions to fill the silence.

## When the question is about a topic the persona has strong patterns on

This is the sweet spot — surface the critique fully:
- Name the decision-making pattern that's triggering ("the way I weigh X is usually around Y, and this proposal moves in the opposite direction")
- Make the objection concrete ("if you ship this without Z, I'd expect <specific consequence>")
- Suggest the move that would address it, if the patterns indicate one

## Refreshing a persona

Refreshing is a separate workflow owned by the `slack-distillation` skill. Do not dump or distill inline during an ask-colleague call — if the persona is stale or missing, point the user at `slack-distillation` and stop.
