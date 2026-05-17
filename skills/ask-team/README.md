# ask-team

Convene a simulated **panel** of Nutrient teammate personas to deliberate a question together, then synthesize a neutral conclusion.

## Relationship to ask-colleague

`ask-team` is the multi-persona sibling of `ask-colleague`. It does **not** maintain its own personas — it reads the same distilled docs from the shared data dir `~/.synthteam/personas/<slug>.md`. To add, refresh, or review a persona, use the `slack-distillation` skill; every persona in that directory automatically joins `ask-team` panels.

- **One person's take →** `ask-colleague`
- **A panel that deliberates and converges →** `ask-team`
- **Build or refresh a persona →** `slack-distillation`

## How it works

The skill runs in your Claude session as an orchestrator. Subagents are isolated and cannot message each other, so "the personas talk to each other" is implemented as orchestrated rounds:

1. **Briefing packet** — the query plus every source you supplied, assembled once and handed to every persona.
2. **Round 1** — one subagent per persona, in parallel; each researches and forms an independent position with open questions.
3. **React rounds** — the orchestrator compiles a digest of all positions, routes questions to their addressees, and re-spawns each persona to react. Iterates until positions stabilize (hard cap: 4 rounds).
4. **Neutral synthesis** — the orchestrator maps consensus, genuine disagreements, and open questions impartially. No persona gets a tiebreaker.
5. **Output** — conclusion first, then a condensed deliberation transcript, then the simulation disclaimer.

## Cost

Every persona joins every panel and rounds iterate to convergence, so a call is roughly 8–12 subagent runs. Use `ask-colleague` when you only need one perspective.

## Limitations

- The panel is a simulation. The conclusion is a structured prompt for your own judgment, not a decision — verify load-bearing assumptions with the real people.
- Personas are only as current as the last `slack-distillation` run.
- A persistent split at the round cap is reported as-is; the skill will not manufacture consensus.
