# synthteam (plugin)

A Claude Code plugin for consulting *distilled personas* of colleagues — locally, without involving them. Useful for pressure-testing plans, anticipating pushback, or stress-testing decisions through someone else's lens.

Personas are simulations, not the real people. Verify anything load-bearing with the real humans before acting on it.

## Skills

| Skill | Use it for |
|-------|------------|
| **[slack-distillation](skills/slack-distillation/)** | Build or refresh a persona — dump a colleague's Slack history and distill it into a structured persona doc. |
| **[ask-colleague](skills/ask-colleague/)** | One colleague's likely take, critique, or pushback on an idea. |
| **[ask-team](skills/ask-team/)** | A simulated panel of colleagues that deliberates a question across rounds and converges on a synthesized conclusion. |

`slack-distillation` *produces* personas; `ask-colleague` and `ask-team` *consume* them. Every persona that exists is automatically available to both consuming skills.

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

To run the Slack dump script, install its runtime deps:

```bash
cd skills/slack-distillation
npm install
```

Then set `SLACK_USER_TOKEN` (see `.env.example`) and follow the [slack-distillation README](skills/slack-distillation/README.md) to build your first persona.

## Privacy

Raw Slack data and persona docs stay on your machine in `~/.synthteam/` — nothing persona-related is committed to this repo. Persona docs describe what someone believes and how they decide; treat them as private notes about colleagues. The dump script cannot exceed the Slack access your token already has, and excludes DMs entirely. See the [slack-distillation README](skills/slack-distillation/README.md#privacy) for the full notes.
