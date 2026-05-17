#!/usr/bin/env node

/**
 * Dump a Slack user's messages + thread context for persona distillation.
 *
 * Usage:
 *   node dump-user-messages.js <slug> [--months=12]
 *
 * Resolves <slug> against Slack's user directory (matches username, display name,
 * or real name), runs `search.messages` with `from:@<username>` over the requested
 * time window, expands every thread the user touched, and writes:
 *   - ~/.synthteam/assets/<slug>/raw-messages.jsonl
 *   - ~/.synthteam/assets/<slug>/metadata.json
 *
 * The shared data dir (~/.synthteam) is intentionally outside any skill
 * folder so personas and raw dumps survive plugin reinstalls and stay reachable
 * by whichever ask-* skills are installed. Override with SYNTHTEAM_HOME.
 *
 * Requires SLACK_USER_TOKEN in .env.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');

const { SlackClient, loadEnv } = require('./slack.js');

// ---- Args ----

function parseArgs(argv) {
  const positional = [];
  const flags = { months: 12 };
  for (const arg of argv) {
    if (arg.startsWith('--months=')) flags.months = Number(arg.split('=')[1]);
    else if (!arg.startsWith('--')) positional.push(arg);
  }
  if (positional.length === 0) {
    console.error('usage: dump-user-messages.js <slug> [--months=12]');
    process.exit(1);
  }
  if (!Number.isFinite(flags.months) || flags.months <= 0) {
    console.error(`invalid --months value: ${flags.months}`);
    process.exit(1);
  }
  return { slug: positional[0].toLowerCase(), months: flags.months };
}

// ---- Slack helpers (extending SlackClient via composition) ----

class Dumper {
  constructor(client) {
    this.client = client;
    this.userCache = new Map(); // user_id -> { name, real_name, display_name }
  }

  async resolveUser(slug) {
    const target = slug.toLowerCase();
    let cursor;
    let page = 0;
    do {
      const url = `${this.client.baseUrl}/users.list?limit=200${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const res = await this.get(url);
      if (!res.ok) throw new Error(`users.list failed: ${res.error}`);
      for (const m of res.members || []) {
        if (m.deleted || m.is_bot) continue;
        const candidates = [
          m.name,
          m.profile?.display_name,
          m.profile?.display_name_normalized,
          m.profile?.real_name,
          m.profile?.real_name_normalized,
        ].filter(Boolean).map(s => s.toLowerCase());
        if (candidates.some(c => c === target || c.split(/\s+/)[0] === target)) {
          return {
            id: m.id,
            name: m.name,
            real_name: m.profile?.real_name || m.real_name || m.name,
            display_name: m.profile?.display_name || m.name,
          };
        }
      }
      cursor = res.response_metadata?.next_cursor;
      page += 1;
      if (page > 50) throw new Error('users.list: too many pages, giving up');
    } while (cursor);
    throw new Error(`could not resolve slug "${slug}" to a Slack user`);
  }

  async getUserName(userId) {
    if (!userId) return null;
    if (this.userCache.has(userId)) return this.userCache.get(userId);
    try {
      const info = await this.client.getUserInfo(userId);
      const entry = {
        name: info.name,
        real_name: info.profile?.real_name || info.real_name || info.name,
        display_name: info.profile?.display_name || info.name,
      };
      this.userCache.set(userId, entry);
      return entry;
    } catch (e) {
      const entry = { name: userId, real_name: userId, display_name: userId };
      this.userCache.set(userId, entry);
      return entry;
    }
  }

  async searchMessages(username, afterDate) {
    const query = `from:@${username} after:${afterDate}`;
    const results = [];
    let page = 1;
    let pages = 1;
    while (page <= pages) {
      const url = `${this.client.baseUrl}/search.messages?query=${encodeURIComponent(query)}&sort=timestamp&sort_dir=desc&count=100&page=${page}`;
      const res = await this.get(url);
      if (!res.ok) throw new Error(`search.messages failed: ${res.error}`);
      const matches = res.messages?.matches || [];
      for (const m of matches) results.push(m);
      pages = res.messages?.paging?.pages || 1;
      const total = res.messages?.paging?.total || results.length;
      console.log(`  search page ${page}/${pages} (${matches.length} matches, ${results.length}/${total} cumulative)`);
      page += 1;
      await sleep(750); // tier 2: 20+/min, stay polite
    }
    return results;
  }

  async getThread(channelId, threadTs) {
    const url = `${this.client.baseUrl}/conversations.replies?channel=${channelId}&ts=${threadTs}&limit=200`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`conversations.replies failed: ${res.error}`);
    return res.messages || [];
  }

  async get(url) {
    let attempt = 0;
    while (true) {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json', ...this.client.getHeaders() },
      });
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after') || 5);
        console.log(`  429 from Slack, sleeping ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        continue;
      }
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`HTTP ${response.status}: ${body}`);
      }
      return response.json();
    }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function isoDateNDaysAgo(months) {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

// ---- Main ----

async function main() {
  const { slug, months } = parseArgs(process.argv.slice(2));

  loadEnv();
  const client = new SlackClient();
  const dumper = new Dumper(client);

  console.log(`Resolving slug "${slug}"...`);
  const user = await dumper.resolveUser(slug);
  console.log(`  -> @${user.name} (${user.real_name}, ${user.id})`);

  const afterDate = isoDateNDaysAgo(months);
  console.log(`Searching messages from @${user.name} after ${afterDate}...`);
  const allMatches = await dumper.searchMessages(user.name, afterDate);

  // Filter out DMs (1:1) and group DMs (mpim). Persona distillation should
  // be grounded in channel conversations, not private messages.
  const matches = allMatches.filter(m => {
    const ch = m.channel;
    if (!ch) return false;
    if (ch.is_im || ch.is_mpim) return false;
    if (ch.id?.startsWith('D')) return false;
    if (ch.name?.startsWith('mpdm-')) return false;
    return true;
  });
  const droppedDmCount = allMatches.length - matches.length;
  if (droppedDmCount > 0) console.log(`  dropped ${droppedDmCount} DM / group-DM matches`);

  // search.messages does not include thread_ts / reply_count at the top level;
  // it lives in the permalink as ?thread_ts=...  For messages where the permalink
  // has thread_ts, hydrate the whole thread via conversations.replies (gets us
  // parent + all sibling replies, which is the right context). Messages without
  // a permalink thread_ts may still be thread parents — those are kept as
  // standalone for v1.
  const threadKeys = new Set();   // `${channel}/${thread_ts}`
  const standaloneByKey = new Map(); // `${channel}/${ts}` -> match
  for (const m of matches) {
    const channelId = m.channel?.id;
    if (!channelId) continue;
    const threadTs = parseThreadTsFromPermalink(m.permalink);
    if (threadTs) {
      threadKeys.add(`${channelId}/${threadTs}`);
    } else {
      standaloneByKey.set(`${channelId}/${m.ts}`, m);
    }
  }

  console.log(`Hydrating ${threadKeys.size} threads...`);
  const threads = [];
  let i = 0;
  for (const key of threadKeys) {
    i += 1;
    const [channelId, threadTs] = key.split('/');
    try {
      const messages = await dumper.getThread(channelId, threadTs);
      threads.push({ channelId, threadTs, messages, channelName: messages[0]?.channel || matchChannelName(matches, channelId) });
      if (i % 10 === 0) console.log(`  ${i}/${threadKeys.size} threads hydrated`);
      await sleep(150); // tier 3: 50+/min
    } catch (e) {
      console.error(`  failed to hydrate ${key}: ${e.message}`);
    }
  }

  // Dedup: if Jonathan's standalone message later appears inside a hydrated
  // thread (e.g. he was the thread parent and also replied), drop the standalone.
  for (const t of threads) {
    for (const m of t.messages) {
      if (m.user === user.id) standaloneByKey.delete(`${t.channelId}/${m.ts}`);
    }
  }

  // Resolve channel names from any match per channel.
  const channelNames = new Map();
  for (const m of matches) {
    if (m.channel?.id && m.channel?.name) channelNames.set(m.channel.id, m.channel.name);
  }

  // Resolve user display names for everyone who appears in a thread or standalone message.
  const userIds = new Set([user.id]);
  for (const m of standaloneByKey.values()) if (m.user) userIds.add(m.user);
  for (const t of threads) for (const m of t.messages) if (m.user) userIds.add(m.user);
  console.log(`Resolving ${userIds.size} user display names...`);
  for (const id of userIds) await dumper.getUserName(id);

  // ---- Write outputs ----

  const dataHome = process.env.SYNTHTEAM_HOME || path.join(os.homedir(), '.synthteam');
  const outDir = path.join(dataHome, 'assets', slug);
  fs.mkdirSync(outDir, { recursive: true });
  const jsonlPath = path.join(outDir, 'raw-messages.jsonl');
  const metaPath = path.join(outDir, 'metadata.json');

  const channelMessageCounts = new Map();
  const bump = (id) => channelMessageCounts.set(id, (channelMessageCounts.get(id) || 0) + 1);

  const out = fs.createWriteStream(jsonlPath);

  for (const [key, m] of standaloneByKey.entries()) {
    const channelId = key.split('/')[0];
    bump(channelId);
    out.write(JSON.stringify({
      kind: 'standalone',
      channel_id: channelId,
      channel_name: channelNames.get(channelId) || null,
      ts: m.ts,
      user: m.user,
      user_name: dumper.userCache.get(m.user)?.display_name || null,
      text: m.text,
      permalink: m.permalink || null,
    }) + '\n');
  }

  for (const t of threads) {
    bump(t.channelId);
    out.write(JSON.stringify({
      kind: 'thread',
      channel_id: t.channelId,
      channel_name: channelNames.get(t.channelId) || null,
      thread_ts: t.threadTs,
      permalink: null, // could be filled via chat.getPermalink if needed
      messages: t.messages.map(m => ({
        ts: m.ts,
        user: m.user,
        user_name: dumper.userCache.get(m.user)?.display_name || null,
        text: m.text || '',
        is_target_user: m.user === user.id,
      })),
    }) + '\n');
  }

  await new Promise(r => out.end(r));

  const metadata = {
    slug,
    user_id: user.id,
    user_name: user.name,
    real_name: user.real_name,
    display_name: user.display_name,
    dumped_at: new Date().toISOString(),
    months_covered: months,
    date_range: { from: afterDate, to: new Date().toISOString().slice(0, 10) },
    channels: [...channelMessageCounts.entries()].map(([id, count]) => ({
      id,
      name: channelNames.get(id) || null,
      message_count: count,
    })).sort((a, b) => b.message_count - a.message_count),
    total_messages: standaloneByKey.size + threads.length,
    total_standalone: standaloneByKey.size,
    total_threads: threads.length,
    total_search_matches: matches.length,
    search_capped: matches.length >= 9900, // Slack caps at ~10k
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n');

  console.log('\nDone.');
  console.log(`  ${jsonlPath}`);
  console.log(`  ${metaPath}`);
  console.log(`  ${metadata.total_standalone} standalone + ${metadata.total_threads} threads across ${metadata.channels.length} channels`);
  if (metadata.search_capped) {
    console.log('  WARNING: search.messages returned near the 10k cap — older messages may be missing.');
  }
}

function matchChannelName(matches, channelId) {
  const found = matches.find(m => m.channel?.id === channelId && m.channel?.name);
  return found?.channel?.name || null;
}

function parseThreadTsFromPermalink(permalink) {
  if (!permalink) return null;
  try {
    const u = new URL(permalink);
    return u.searchParams.get('thread_ts');
  } catch {
    return null;
  }
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
