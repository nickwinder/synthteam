# Distillation Facets

This file is the operational spec for the `distill-slack-persona` skill. It defines the multi-agent pipeline that turns `~/.synthteam/assets/<slug>/raw-messages.jsonl` into a persona doc at `~/.synthteam/personas/<slug>.md`.

Paths use the shared data dir `~/.synthteam` (override with the `SYNTHTEAM_HOME` env var). It lives outside any skill folder so personas survive plugin reinstalls and are reachable by the `ask-colleague` and `ask-team` skills regardless of which are installed.

The goal of the persona doc is to capture **what the colleague knows, what they believe, and how they decide** — not how they sound. Voice mimicry is explicitly out of scope. Every output section is natural-language description of patterns and substance, with channel+date pointers as evidence trails. No verbatim message text appears in the persona doc.

The orchestrator is whichever Claude session you're in when you say "distill <name>". The session reads this file, fans out workers + reducers via the `ed3d-basic-agents:doing-a-simple-two-stage-fanout` pattern, then assembles the persona doc.

## Input

- `~/.synthteam/assets/<slug>/raw-messages.jsonl` — one JSON record per line. Two record shapes:
  - `{"kind": "standalone", "channel_id", "channel_name", "ts", "user", "user_name", "text", "permalink"}`
  - `{"kind": "thread", "channel_id", "channel_name", "thread_ts", "permalink", "messages": [{"ts", "user", "user_name", "text", "is_target_user"}, ...]}`
- `~/.synthteam/assets/<slug>/metadata.json` — `{"slug", "user_id", "user_name", "real_name", "dumped_at", "months_covered", "date_range": {"from", "to"}, "channels": [{"id", "name", "message_count"}], "total_messages", "total_threads", "search_capped": bool, "excludes": [...]}`

## Output

`~/.synthteam/personas/<slug>.md` with frontmatter and a fixed structure:

```markdown
---
slug: alex
display_name: Alex
real_name: Alex Example
distilled_from:
  dumped_at: 2026-05-10T...
  months_covered: 12
  total_messages: ...
  total_threads: ...
  channel_count: ...
last_distilled_at: 2026-05-11T...
---

# Alex — Persona

## At a glance
<2–4 sentences: what they do, what they care about, what shape of decisions they own>

## Strategic priorities & recurring themes
<facet 1 output>

## Specific opinions & positions
<facet 2 output>

## Decision-making patterns
<facet 3 output>

## Domain knowledge
<facet 4 output>

## Network & operational context
<facet 5 output>

## Known gaps
<topics the dump is silent on — load-bearing for "ask-colleague" honesty>
```

## Orchestration (two-stage fanout)

The corpus (~7.7MB JSONL for an active CEO) is too big for a single agent's context. Use the `ed3d-basic-agents:doing-a-simple-two-stage-fanout` pattern:

**Stage 1 — Workers.** Split `raw-messages.jsonl` into chunks of ~100 records (≈400KB ≈ 100K tokens each). Dispatch one worker per chunk in parallel batches of 8. Each worker:
- Reads its chunk and the 5 facet definitions below.
- Makes one pass over the chunk, emitting structured findings for *every* facet — not synthesis yet, just evidence. Format: `{facet: <facet_id>, claim: <one-line>, evidence: [{channel, date, permalink}]}`.
- Returns its findings JSON.

Model: Sonnet for most workers. Worker prompts must explicitly forbid quoting message text.

**Stage 2 — Reducers (5 in parallel, one per facet).** Each reducer:
- Receives all workers' findings tagged with its facet.
- Dedupes (same claim made by multiple workers with different evidence → one claim, evidence merged).
- Synthesizes into the section format defined per facet below.
- Output: a finalized Markdown section, no preamble, no frontmatter.

Model: Sonnet for facets 1, 4, 5. Opus for facets 2 (positions) and 3 (decision patterns) — these need more nuance and benefit from stronger reasoning.

**Stage 3 — Critic (per facet, optional but on by default for first distillation).** A separate critic agent reads each reducer's output against the raw JSONL and flags:
- Unsupported claims (no citation, or citation that doesn't actually support the claim on spot-check).
- Inadvertent verbatim quotes (anything in the output that grep-matches against `text` fields in the JSONL).
- Internal contradictions within the facet.
If critic flags ≥ 3 issues, re-run the reducer with the critic's feedback. Otherwise pass through.

**Stage 4 — Final assembly (orchestrating session, not a sub-agent):**
1. Reads the 5 finalized facet sections.
2. Drafts `At a glance` — 2–4 sentences synthesizing across facets. This is the orchestrator's synthesis, not delegated.
3. Drafts `Known gaps` — sweeps the metadata's channel list against facet content, flags areas with no signal that would normally matter for someone in this role.
4. Writes frontmatter from `metadata.json` + current timestamp.
5. Writes `~/.synthteam/personas/<slug>.md` (creating the `personas/` dir if needed).

After write: surface to operator for review — read the doc, spot-check 3 claims against the JSONL, accept or re-run a specific facet.

## Universal rules for every facet

1. **No verbatim message text** anywhere in the output. Describe patterns in indirect prose ("often frames decisions around reversibility") rather than quoting ("said: 'is this reversible?'"). The distinction is: a verbatim quote is something a grep over the JSONL would find; a paraphrase is not.
2. **Citation as pointer, not quote.** Format: `[#channel-name, YYYY-MM-DD](permalink)`. The reader can follow the link to see the source. The persona doc doesn't reproduce it.
3. **Third-person observational voice** in the persona doc (the agent IS NOT the persona; it's *describing* the persona for the runtime skill to embody at ask-time).
4. **Defensible from evidence.** A claim with one citation is a hint; with three is a pattern; with one and labelled "rarely, but..." is honest. Never invent strength of signal.
5. **No styling claims.** Don't include observations about tone, length, emoji usage, vocabulary. Out of scope for this persona doc.

## Facet definitions

### Facet 1: Strategic priorities & recurring themes

**What to find:** What does this person push for repeatedly? What do they consistently bring up, defend, or worry about? What do they de-prioritize or dismiss? What are their north-star metrics (stated or implied)?

**How to look:** Scan for *repetition* across threads and channels. A position stated once is noise; a position stated four times across three channels is a priority. Look at what they bring back up unprompted, what they redirect conversations toward, what they push back against on principle.

**Output shape:** Bulleted list of 4–8 priorities/themes. Each bullet: a one-line natural-language statement of the priority + 2–3 short citations (channel, date) as evidence. No quoted text.

### Facet 2: Specific opinions & positions

**What to find:** Concrete stances on specific topics. What they champion, what they oppose, what they keep saying no to. Distinct from priorities — priorities are recurring concerns; positions are specific calls.

**How to look:** Scan threads where they made a call, pushed back, disagreed, or shifted position. Capture the *conclusion* and the *target* (what specifically they were taking a position on).

**Output shape:** Sub-sections grouped by topic area (e.g. "On shipping cadence", "On vendor selection", "On hiring", "On feature prioritization"). Each sub-section: 2–4 sentences in indirect prose stating the position(s), with citations. If multiple positions in a cluster are in tension (e.g. "ship fast" + "don't ship broken"), describe the tension rather than papering over it.

### Facet 3: Decision-making patterns

**What to find:** *How* they reason, not what they conclude. What framings do they invoke when weighing trade-offs? What kinds of arguments persuade them? What kinds get rejected? What signals do they look at? What questions do they ask before deciding?

**How to look:** Scan threads where a decision was being worked through — not announcements. Look at the *intermediate* messages: how they reframe questions, what considerations they raise, what they ask others to clarify before they'll opine. The pattern is in the moves, not the outcomes.

**Output shape:** Prose, ~6–10 short paragraphs, each describing one decision-making move or framing. Examples of move-types to look for (not exhaustive):
- Reframing: what reframes do they reach for? (cost framing, risk framing, customer framing, time-horizon framing, optionality framing)
- Disqualifying questions: what questions do they ask that, if unanswered, kill the proposal?
- Bar-setting: what threshold do they implicitly set for a decision to be made (high-conviction, reversible, urgent, etc.)?
- Tolerance for ambiguity: do they push for more data, or call it and move on?
- Trust signals: what makes them accept someone else's call without re-litigating?

Each paragraph cites 2–3 supporting threads.

This is the highest-leverage facet for the "ask-colleague" use case — critique and pressure-testing rely on simulating *how* they'd reason about a new situation, not just recalling what they've said.

### Facet 4: Domain knowledge

**What to find:** Topics they engage with substantively — areas where they have specific views, working knowledge, or strong intuitions. Could include technical (architectures, tools, vendors), commercial (markets, customer segments, pricing models), operational (org design, hiring, process), or strategic (positioning, competitive landscape) knowledge.

**How to look:** Identify topics where they go beyond restating what others said — they bring new information, correct mistakes, push specifics. That's where they have working knowledge.

**Output shape:** Sub-sections grouped by domain (e.g. "PDF processing market", "Hiring senior engineers", "Sales motion for technical buyers"). Each sub-section: a few sentences describing what they know and how their views show up in conversation. Citations to anchor.

If thin, say so explicitly: "Limited engagement on technical specifics — most domain knowledge surfaced is around commercial/strategic topics."

### Facet 5: Network & operational context

**What to find:** Who they work with, in what context, and how often. Projects they're deeply involved in. Customers/competitors they track. Internal jargon and concepts they use as load-bearing references.

**How to look:** Frequency analysis on @-mentions, recurring channel participation, project name-drops, customer name-drops, competitor name-drops. Beyond raw count, capture the *role* — is this person a frequent collaborator, a delegate, an escalation path, a peer?

**Output shape:** Three short sub-sections:
- **People** — top 8–12 people they engage with, each with a one-line note on the relationship type (peer, direct report, delegate-for-X, etc.) and a citation to a representative thread.
- **Projects / products** — top 5–8 internal projects they track or own, each with a one-line note on their involvement.
- **External (customers, competitors, partners, vendors)** — top 5–8 external entities, each with a one-line note on the context they appear in.

## Quality checks (orchestrator runs after merge)

Before finalizing `~/.synthteam/personas/<slug>.md`:

1. **Verbatim sweep.** Take each non-trivial sentence from the persona doc, grep for distinctive 4–6 word substrings in `raw-messages.jsonl`. Zero matches expected. If any match → that's a verbatim leak; rewrite that sentence in indirect prose.
2. **Citation density.** Every claim should have at least one citation. Decision-pattern paragraphs should have 2–3.
3. **No contradiction silently smoothed.** If facets disagree, the doc should name the tension.
4. **Known gaps populated.** If the dump has no signal on a topic that would matter for someone in this role, call it out explicitly.
5. **Length sanity.** Aim for ~3–5K tokens total. If the doc is much longer, it's probably hoarding evidence; trim to claims + pointers.
