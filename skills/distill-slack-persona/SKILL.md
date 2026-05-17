---
name: distill-slack-persona
description: Build or refresh a distilled persona doc for a colleague from their Slack history — dump their channel messages, then run a multi-agent distillation into a structured persona file that the ask-colleague and ask-team skills consume. Use when the user wants to "dump <name>'s Slack", "distill <name>'s persona", "build a persona for <name>", "add <name> as a colleague", "refresh <name>'s persona", or otherwise create/update the source files behind ask-colleague. This is the ingestion-side skill; ask-colleague and ask-team only read what this produces.
compatibility: Requires Node.js and a Slack user token (SLACK_USER_TOKEN, xoxp-) with search:read, users:read, channels:history, groups:history, channels:read, groups:read scopes. Writes to ~/.synthteam/ (override with SYNTHTEAM_HOME).
---

# Slack Distillation

Turn a colleague's Slack history into a distilled **persona doc** — a natural-language description of *what they know, what they believe, and how they decide*. The persona docs produced here are the sole input to the `ask-colleague` and `ask-team` skills.

A persona doc captures **substance, not voice**. No verbatim message text, no tone/style mimicry — patterns and positions only.

## Shared data directory

Everything lives under `~/.synthteam/` (override with the `SYNTHTEAM_HOME` env var). This directory is intentionally outside any skill folder so personas and raw dumps survive plugin reinstalls and stay reachable by whichever `ask-*` skills are installed:

```
~/.synthteam/
├── assets/<slug>/          # raw Slack dumps — local-only, never commit
│   ├── raw-messages.jsonl
│   └── metadata.json
└── personas/<slug>.md      # the distilled persona doc — the deliverable
```

`<slug>` is the colleague's lowercase first name (e.g. `alex`).

## The workflow has three steps

Step 1 is mechanical (a script). Step 2 is the agent-driven distillation. Step 3 is human review. Do them in order — distillation needs the dump, review needs the doc.

### Step 1 — Dump their Slack messages

The dump script lives in this skill at `scripts/dump-user-messages.js`. It needs `SLACK_USER_TOKEN` in a `.env` file (see the repo `.env.example`; `loadEnv` walks up from the cwd to find it).

First install its runtime deps once:

```bash
cd <this-skill>/  &&  npm install
```

Then run the dump:

```bash
node scripts/dump-user-messages.js <slug> [--months=12]
```

The script resolves `<slug>` to a Slack user, runs `search.messages` with `from:@<username>` over the time window, expands every thread the user touched, and writes `raw-messages.jsonl` + `metadata.json` into `~/.synthteam/assets/<slug>/`. DMs and multi-person DMs are excluded by design — personas are grounded in public/channel conversation only. It only reads what the authenticating token can already see.

### Step 2 — Distill the persona

`references/distillation-facets.md` is the full operational spec for this step — the multi-agent pipeline, the five facet definitions, the persona doc format, and the quality checks. Read it in full before starting; it is the authority for everything below.

In short: the current session is the orchestrator. It splits `raw-messages.jsonl` into chunks, fans out worker subagents to extract per-facet findings, runs one reducer subagent per facet to synthesize sections, optionally runs a critic pass, then assembles `~/.synthteam/personas/<slug>.md` with frontmatter and the fixed five-facet structure. The pipeline follows the `ed3d-basic-agents:doing-a-simple-two-stage-fanout` pattern.

Do not improvise the persona from general knowledge of the company or the person — every claim in the doc must be defensible from the dump.

### Step 3 — Review the diff

Read the finished `~/.synthteam/personas/<slug>.md` before relying on it. Spot-check a few claims against `raw-messages.jsonl`. If a section feels uncanny — putting words in their mouth that aren't grounded — re-run that facet or trim it. Run the verbatim-leak sweep described in the facets spec: any distinctive 4–6-word substring shared between the persona doc and the raw JSONL is a leak and must be rewritten in indirect prose.

## Refreshing an existing persona

Same three steps. The dump script overwrites `raw-messages.jsonl` (the time window slides forward). The distillation rewrites the persona doc from scratch. Diff against the previous version to see what changed. Monthly is a reasonable cadence.

## Privacy

- **Raw Slack data stays local.** `~/.synthteam/assets/` should never be committed to a repo. Verbatim message text never belongs in the persona doc.
- **Persona docs describe what someone believes and how they decide.** Even paraphrased, that is sensitive. Treat `~/.synthteam/personas/` as private notes about colleagues. Before adding anyone, consider whether they'd be comfortable with the persona existing.
- The dump script cannot exceed the Slack access the user's token already has, and excludes DMs entirely.

## Limitations

- Slack `search.messages` is user-token only and capped at ~10,000 results per query. A highly active person may hit the cap; the script reports if it did.
- Only public channels and conversations the token's user belongs to are searchable.
- Voice / style mimicry is explicitly out of scope. The persona doc captures substance, not phrasing.
