# synthteam (plugin)

A Claude Code plugin for consulting *distilled personas* of colleagues — locally, without involving them. Useful for pressure-testing plans, anticipating pushback, or stress-testing decisions through someone else's lens.

Personas are simulations, not the real people. Verify anything load-bearing with the real humans before acting on it.

## Skills

The plugin has three skills that split into an *ingestion* side and a *consumption* side. `distill-slack-persona` **produces** persona docs; `ask-colleague` and `ask-team` **consume** them. Every persona that exists is automatically available to both consuming skills.

### distill-slack-persona — build a persona

Turns a colleague's Slack history into a structured **persona doc**: a natural-language description of *what they know, what they believe, and how they decide*. It dumps their channel messages with a script, then runs a multi-agent pipeline that distills the raw messages into five facets (strategic priorities, specific opinions, decision-making patterns, domain knowledge, and operational context). The doc captures **substance, not voice** — no verbatim text, no style mimicry. This is the only skill that writes personas; the others just read them. See [how to use it](#building-a-persona-with-distill-slack-persona) below.

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
    ├── distill-slack-persona/       # ingestion: dump Slack + distill personas
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

This repo is a Claude Code plugin marketplace. Inside Claude Code, add the marketplace, then install the plugin from it.

From GitHub:

```
/plugin marketplace add nickwinder/synthteam
/plugin install synthteam@synthteam-marketplace
```

Or from a local clone (point at the repo directory):

```
/plugin marketplace add /absolute/path/to/synthteam
/plugin install synthteam@synthteam-marketplace
```

## Building a persona with distill-slack-persona

Before `ask-colleague` or `ask-team` can do anything, you need at least one persona. You build one entirely by prompting Claude Code — just ask it to distill a colleague:

```
distill alex's persona
```

Claude Code triggers the `distill-slack-persona` skill and handles the whole flow for you:

1. **Slack access** — the first time you build a persona, Claude Code will prompt you for a Slack *user* token (`xoxp-…`) and walk you through saving it. You provide the token; it does the rest.
2. **Dump** — it searches that colleague's public Slack messages over a time window, expands the threads they took part in, and stores the raw data locally under `~/.synthteam/assets/<slug>/`. DMs are never touched, and it can't see anything your token can't.
3. **Distill** — it runs a multi-agent distillation that turns the raw messages into a structured persona doc at `~/.synthteam/personas/<slug>.md`.
4. **Review** — it spot-checks the result and tells you what it found so you can sanity-check before relying on it.

To **refresh** a persona later, prompt it the same way (`refresh alex's persona`) — monthly is a reasonable cadence. You can also ask for a different time window, e.g. *"distill alex's persona from the last 6 months"*.

Once the persona exists, that colleague is immediately available to both `ask-colleague` and `ask-team` — no extra step. Full details in the [distill-slack-persona README](skills/distill-slack-persona/README.md).

## Privacy

Raw Slack data and persona docs stay on your machine in `~/.synthteam/` — nothing persona-related is committed to this repo. Persona docs describe what someone believes and how they decide; treat them as private notes about colleagues. The dump script cannot exceed the Slack access your token already has, and excludes DMs entirely. See the [distill-slack-persona README](skills/distill-slack-persona/README.md#privacy) for the full notes.
