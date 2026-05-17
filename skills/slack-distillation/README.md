# slack-distillation

The ingestion side of the `synthteam` plugin. It dumps a colleague's Slack history and distills it into a structured **persona doc** that the `ask-colleague` and `ask-team` skills consume.

`slack-distillation` *produces* personas. `ask-colleague` and `ask-team` only *read* them — they have no ingestion logic of their own.

## Shared data directory

Personas and raw dumps live under `~/.synthteam/`, deliberately outside any skill folder:

```
~/.synthteam/
├── assets/<slug>/          # raw Slack dumps — local-only, gitignored, never commit
│   ├── raw-messages.jsonl
│   └── metadata.json
└── personas/<slug>.md      # the distilled persona doc — the deliverable
```

This keeps personas alive across plugin reinstalls and reachable by whichever `ask-*` skills are installed. Override the location with the `SYNTHTEAM_HOME` environment variable.

## Skill folder layout

```
skills/slack-distillation/
├── SKILL.md                      # the workflow skill (dump → distill → review)
├── README.md                     # this file
├── package.json                  # node deps for the dump script
├── scripts/
│   ├── dump-user-messages.js     # Slack ingestion
│   └── slack.js                  # vendored Slack client helper
└── references/
    └── distillation-facets.md    # full operational spec for the distillation pipeline
```

## Setup

Install the dump script's runtime deps once:

```bash
cd skills/slack-distillation
npm install
```

Set `SLACK_USER_TOKEN` (see the repo-root `.env.example`). It must be a user token (`xoxp-…`) — bot tokens lack `search.messages` access.

## Adding or refreshing a colleague

Three steps, detailed in `SKILL.md`:

1. **Dump** — `node scripts/dump-user-messages.js <slug> [--months=12]` writes raw messages to `~/.synthteam/assets/<slug>/`.
2. **Distill** — in a Claude Code session, say "distill <name>'s persona". The session orchestrates a multi-agent pipeline (workers → per-facet reducers → critic → assembly) that writes `~/.synthteam/personas/<slug>.md`. `references/distillation-facets.md` is the operational spec.
3. **Review** — read the persona doc, spot-check claims against the raw JSONL, run the verbatim-leak sweep.

Refreshing is the same three steps; monthly is a reasonable cadence.

## Privacy

- Raw Slack dumps stay local — `~/.synthteam/assets/` is never committed. Verbatim message text never enters the persona doc.
- Persona docs describe what someone believes and how they decide; treat `~/.synthteam/personas/` as private notes about colleagues.
- The dump script cannot exceed the Slack access the user's token already has, and excludes DMs entirely.

## Limitations

- Slack `search.messages` is user-token only and capped at ~10,000 results per query; the script reports if it hit the cap.
- Only public channels and conversations the token's user belongs to are searchable.
- Voice / style mimicry is out of scope — personas capture substance, not phrasing.
