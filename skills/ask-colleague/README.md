# ask-colleague

A Claude Code skill for consulting a *distilled persona* of a colleague — locally, without involving them. Useful for pressure-testing plans, anticipating pushback, or stress-testing decisions through someone else's lens.

It is a simulation, not the real person. Verify anything load-bearing with the real human before acting on it.

## How it works

When the user asks for a colleague's take ("ask alex", "what would alex think", "/ask-colleague alex …"), the skill:

1. Resolves the named colleague to a lowercase slug.
2. Reads the persona doc at `~/.synthteam/personas/<slug>.md`.
3. Answers in first-person from that colleague's decision-making frame — substance and reasoning patterns, not voice or style.
4. Closes with a disclaimer that it's a simulation.

If no persona doc exists for the named colleague, the skill stops and points the user at the `distill-slack-persona` skill. `ask-colleague` does **not** create or refresh personas — it only reads them.

See `SKILL.md` for the full runtime behaviour.

## Persona docs

Personas live at `~/.synthteam/personas/<slug>.md` (override the base dir with the `SYNTHTEAM_HOME` env var). This location is outside any skill folder on purpose: personas survive plugin reinstalls and are shared by both `ask-colleague` and the sibling `ask-team` skill.

To create or refresh a persona, use the **`distill-slack-persona`** skill — it dumps a colleague's Slack history and distills it into the persona doc this skill consumes.

## Limitations

- The skill is one-shot per turn — no memory of prior `/ask-colleague` calls within a session. Each call re-reads the persona doc cold.
- Voice / style mimicry is explicitly out of scope. The persona doc captures substance, not phrasing.
- A persona is only as current as the last `distill-slack-persona` run.
