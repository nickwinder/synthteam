---
name: ask-team
description: Convene a simulated panel of colleague personas to deliberate a question together — each persona becomes its own research agent, they react to each other's positions over multiple rounds, and the panel converges on a synthesized conclusion. Use when the user wants more than one perspective on a decision, a cross-functional gut-check, a debate between viewpoints, or a comprehensive answer that surfaces where teammates would agree and disagree. Invoke when the user says "ask the team", "/ask-team ...", "what would the team think", "get a panel on this", "run this past everyone", "convene the personas", or asks for multiple colleagues' takes at once. For a single colleague's take, use ask-colleague instead.
compatibility: Requires distilled persona docs at ~/.synthteam/personas/<slug>.md (built by the distill-slack-persona skill). Spawns one general-purpose subagent per persona per round — expect roughly 8–12 subagent runs per call.
---

# Ask the Team

Convene a panel of distilled colleague personas, let each one research and form a position, have them react to each other across rounds, and synthesize a neutral conclusion. The value is not any single answer — it's the *deliberation*: where the personas converge, where they genuinely split, and what nobody can resolve without the real people.

Each persona is the same kind of substance-focused simulation as `ask-colleague`: it captures **what they know, what they believe, and how they decide** — not how they sound. No voice mimicry.

## How "communication between agents" actually works

Subagents are isolated — they cannot message each other directly. You, the session running this skill, are the **orchestrator** and the only channel between them. Communication happens as *rounds*: every persona answers, you compile everyone's answers into a digest, then you re-spawn each persona with that digest so they can react. Iterate until positions stabilize.

## Phase 0 — Announce

Say: "Convening a simulated panel — <names>. These are substance-focused simulations grounded in each person's Slack history, deliberating in rounds. Not the real people."

## Phase 1 — Assemble the panel and the briefing packet

**Find the personas.** Persona docs live in the shared data dir at `~/.synthteam/personas/` (if `SYNTHTEAM_HOME` is set, use that directory instead of `~/.synthteam`). Every `<slug>.md` file in that directory is a panelist. The whole roster sits on every panel — do not pre-filter by topic.

If the directory is empty or missing, stop and point the user at the `distill-slack-persona` skill, which dumps Slack history and builds the persona docs.

**Build the briefing packet.** This is the single shared input every persona receives, so assemble it once, carefully:
- The user's question, stated precisely.
- Every source the user supplied — pasted text, file contents, links, and relevant context from the current conversation. Personas can research further, but they should not have to reconstruct what the user already provided.
- Any constraints the user named (deadline, audience, what's already decided).

Keep the packet self-contained: a subagent sees only what you pass it.

## Phase 2 — Round 1: independent positions

Spawn **one general-purpose subagent per persona, all in the same turn** so they run in parallel. Each subagent prompt contains:

- The absolute path to that persona's doc (`~/.synthteam/personas/<slug>.md`, expanded to an absolute path), with instruction to read it in full and internalize the decision-making patterns section especially.
- The briefing packet.
- Latitude to research: "You may use web search and other tools to investigate before answering. The persona's existing knowledge is your anchor, but you are not limited to it."
- The persona contract (below).
- The Round 1 response format (below).

### Persona contract (every round, every persona)

- Reason in first-person *as that persona would reason* — first-person is for perspective-taking, not voice. No imitation of phrasing, no catchphrases.
- Ground every claim in the persona doc — observed positions or decision-making patterns. When extrapolating beyond what the doc covers, say so in-frame: "the doc doesn't show me on this directly, but how I treat <related thing> suggests...".
- Push back where the persona's patterns indicate they would. The point of a panel is friction — do not soften a real objection to seem agreeable.
- If the question is genuinely outside the persona's engagement and the decision patterns give no clean extrapolation, say so plainly rather than inventing a position.

### Round 1 response format

```
## Position
One or two sentences — the take, stated first.

## Reasoning
Why, tied to specific decision-making patterns. Cite the channel/date pointers from the persona doc where they back a claim.

## Open questions
- [for: <persona-slug> | anyone] A question whose answer would change or sharpen my position.

## Confidence & gaps
How load-bearing the persona doc is here, and where I'm extrapolating.
```

## Phase 3 — React rounds: iterate to convergence

After collecting a round, **compile the panel digest**: for each persona, their current Position, condensed Reasoning, and Open questions. Route each open question to its addressee.

Then run a react round — re-spawn every persona in parallel, each prompt containing:
- The persona doc path and the persona contract again.
- Their *own* prior-round response.
- The panel digest (everyone else's positions and questions).
- The questions routed *to them*.
- The react-round response format (below).

### React-round response format

```
## Stance change
held | sharpened | updated | conceded | hardened — and one line on what moved and why.

## Reaction
Direct engagement with the other personas — name them. Where you agree, say so. Where you disagree, make the objection concrete. A persona conceding a good point is a real outcome, not a failure.

## Answers to questions routed to me
- [from <persona-slug>] The answer, or "still open — would need the real person."

## Position (current)
Restated, post-reaction.

## New open questions
- [for: <persona-slug> | anyone] Only genuinely new ones.
```

### Convergence check

After each react round, decide whether to run another. **Stop** when both hold:
- No persona's `Stance change` was `updated`, `conceded`, or `hardened` — i.e. positions are stable.
- No open question remains that another panelist could actually answer (questions that need the *real* person don't count — those are findings, not blockers).

**Hard cap: 4 rounds total** (Round 1 + up to 3 react rounds). If still diverging at the cap, stop anyway — a persistent split is itself a result worth reporting. Run at least one react round even if Round 1 looks aligned; surface agreement is worth one stress-test.

State the round count and why you stopped before synthesizing.

## Phase 4 — Neutral synthesis

You synthesize — impartially. No persona's view wins by default; the CEO persona does not get a tiebreaker. Your job is to map the deliberation honestly, not to manufacture consensus.

- **Consensus** — what the panel actually agreed on, and how solid it is.
- **Disagreements** — each unresolved split: who holds what, the reasoning on each side, and *why* it didn't resolve (different priorities? missing information? genuine values difference?). Do not paper over a real split.
- **Open questions for the real humans** — what the simulation cannot settle and needs the actual people to answer.
- **Recommended move** — the action the deliberation best supports. If the panel split and you can't honestly call it, say so and give the user the decision criteria instead of a false verdict.

## Phase 5 — Output

ALWAYS use this structure:

```
# Panel: <question, short>

## Conclusion
### Consensus
### Disagreements
### Open questions for the real humans
### Recommended move

## Deliberation transcript (condensed)
For each round, for each persona: 2–4 lines — their position and what moved. Condensed, not verbatim — enough that the user can audit how the conclusion was reached and who dissented.
```

Then close with the disclaimer:

> _— Simulated panel, distilled from Slack history. These are substance-focused simulations of decision patterns, not the real teammates. Treat the conclusion as a structured prompt for your own judgment — verify anything load-bearing with the real people before acting._

## Notes on cost and scope

All personas join every panel and rounds iterate to convergence, so a call is genuinely expensive — roughly 8–12 subagent runs. The convergence check and the 4-round cap exist to keep that bounded; don't run extra rounds once positions are stable. If the user wants just one person's view, that's `ask-colleague`, not this.
