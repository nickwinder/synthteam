# synthteam (plugin)

A Claude Code plugin for consulting *distilled personas* of colleagues — locally, without involving them. Useful for pressure-testing plans, anticipating pushback, or stress-testing decisions through someone else's lens.

Personas are simulations, not the real people. Verify anything load-bearing with the real humans before acting on it.

## Skills

The plugin has three skills that split into an *ingestion* side and a *consumption* side. `slack-distillation` **produces** persona docs; `ask-colleague` and `ask-team` **consume** them. Every persona that exists is automatically available to both consuming skills.

### slack-distillation — build a persona

Turns a colleague's Slack history into a structured **persona doc**: a natural-language description of *what they know, what they believe, and how they decide*. It dumps their channel messages with a script, then runs a multi-agent pipeline that distills the raw messages into five facets (strategic priorities, specific opinions, decision-making patterns, domain knowledge, and operational context). The doc captures **substance, not voice** — no verbatim text, no style mimicry. This is the only skill that writes personas; the others just read them. See [how to use it](#building-a-persona-with-slack-distillation) below.

### ask-colleague — one person's take

Consults a single distilled persona for their likely take, critique, or pushback on an idea — locally, without involving the real person. Use it to pressure-test a plan, anticipate a reaction, or surface the objection you might dodge by not asking. It answers in first-person *as that person would reason*, grounded in their persona doc, and flags when it's extrapolating beyond what the doc covers.

> Invoke it: `ask alex about <idea>`, `what would alex think of <plan>`, or `/ask-colleague alex …`

### ask-team — a panel that deliberates

Convenes a simulated **panel** of all your personas to deliberate a question together. Each persona becomes its own research agent, forms a position, then reacts to everyone else's positions across multiple rounds until the panel converges. The output maps where the team agrees, where it genuinely splits and why, and what only the real humans can settle. More expensive than `ask-colleague` (~8–12 subagent runs) — reach for it when one perspective isn't enough.

> Invoke it: `ask the team about <question>`, `run this past everyone`, or `/ask-team …`

## Shared data directory

Personas and raw Slack dumps live under `~/.synthteam/` — deliberately outside the plugin so they survive reinstalls and are reachable by whichever skills are installed (override the location with the `SYNTHTEAM_HOME` env var):

```
~/.synthteam/
├── assets/<slug>/          # raw Slack dumps — local-only, never committed
│   ├── raw-messages.jsonl
│   └── metadata.json
└── personas/<slug>.md      # the distilled persona docs the ask-* skills read
```

## Repo layout

```
synthteam/
├── .claude-plugin/
│   └── plugin.json               # plugin manifest
├── .env.example                  # SLACK_USER_TOKEN for the dump script
├── README.md                     # this file
└── skills/
    ├── slack-distillation/       # ingestion: dump Slack + distill personas
    │   ├── SKILL.md
    │   ├── README.md
    │   ├── package.json          # node deps for the dump script
    │   ├── scripts/              # Slack ingestion
    │   └── references/           # distillation-facets.md — the pipeline spec
    ├── ask-colleague/            # consume: single-persona take
    │   ├── SKILL.md
    │   └── README.md
    └── ask-team/                 # consume: multi-persona deliberation panel
        ├── SKILL.md
        └── README.md
```

## Installation

This repo is a Claude Code plugin. Install it locally with:

```bash
/plugin install file:///absolute/path/to/synthteam
```

## Building a persona with slack-distillation

Before `ask-colleague` or `ask-team` can do anything, you need at least one persona. Personas are built once and refreshed occasionally (monthly is a reasonable cadence) — the consuming skills just read whatever exists.

### One-time setup

1. **Install the dump script's deps:**

   ```bash
   cd skills/slack-distillation
   npm install
   ```

2. **Get a Slack user token.** It must be a *user* token (`xoxp-…`) — bot tokens lack `search.messages` access. It needs these scopes: `search:read`, `users:read`, `channels:history`, `groups:history`, `channels:read`, `groups:read`.

3. **Set the token.** Copy `.env.example` to `.env` and fill in `SLACK_USER_TOKEN`. The script walks up from the working directory to find the `.env`, and `.env` is gitignored.

### Build a persona — three steps

The skill runs these for you when, in a Claude Code session, you say something like **"distill alex's persona"** or **"add alex as a colleague"**. Under the hood:

1. **Dump** — the script searches `from:@<user>` over a time window, expands every thread they touched, and writes raw messages locally:

   ```bash
   node scripts/dump-user-messages.js <slug> [--months=12]
   ```

   `<slug>` is the colleague's lowercase first name. Output lands in `~/.synthteam/assets/<slug>/`. DMs are excluded by design — personas are grounded in public/channel conversation only, and the script can never exceed the access your token already has.

2. **Distill** — the Claude Code session orchestrates a multi-agent pipeline: it chunks the raw messages, fans out worker subagents to extract per-facet findings, runs one reducer per facet, optionally a critic pass, then assembles the persona doc at `~/.synthteam/personas/<slug>.md`. The full spec lives in `skills/slack-distillation/references/distillation-facets.md`.

3. **Review** — read the finished persona doc, spot-check a few claims against the raw `raw-messages.jsonl`, and run the verbatim-leak sweep (any distinctive shared phrasing is a leak to rewrite). Don't rely on a persona you haven't eyeballed.

**Refreshing** an existing persona is the same three steps — the dump overwrites the raw messages and the distillation rewrites the doc from scratch.

Once a `<slug>.md` exists under `~/.synthteam/personas/`, that colleague is immediately available to both `ask-colleague` and `ask-team`. Full details in the [slack-distillation README](skills/slack-distillation/README.md).

## Privacy

Raw Slack data and persona docs stay on your machine in `~/.synthteam/` — nothing persona-related is committed to this repo. Persona docs describe what someone believes and how they decide; treat them as private notes about colleagues. The dump script cannot exceed the Slack access your token already has, and excludes DMs entirely. See the [slack-distillation README](skills/slack-distillation/README.md#privacy) for the full notes.
