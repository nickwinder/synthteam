#!/usr/bin/env node

/**
 * Normalize an already-exported message thread into synthteam's raw JSONL shape.
 *
 * Usage:
 *   node scripts/import-message-thread.js --input thread.json --slug alex [--source=imessage]
 *
 * Input can be:
 *   - JSON object: { source, target, conversation, messages: [...] }
 *   - JSON array: [{ timestamp, sender, text, ... }, ...]
 *   - JSONL: one message object per line
 *
 * The script writes:
 *   - ~/.synthteam/assets/<slug>/raw-messages.jsonl
 *   - ~/.synthteam/assets/<slug>/metadata.json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = true;
      }
    }
    else flags[arg.slice(2, eq)] = arg.slice(eq + 1);
  }
  if (!flags.input || !flags.slug) {
    console.error('usage: import-message-thread.js --input <file.json|jsonl> --slug <slug> [--source=imessage]');
    process.exit(1);
  }
  return {
    input: flags.input,
    slug: String(flags.slug).toLowerCase(),
    source: flags.source ? String(flags.source).toLowerCase() : null,
  };
}

function readInput(inputPath) {
  const raw = fs.readFileSync(inputPath, 'utf8').trim();
  if (!raw) throw new Error(`input file is empty: ${inputPath}`);

  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { envelope: {}, messages: parsed };
    if (Array.isArray(parsed.messages)) return { envelope: parsed, messages: parsed.messages };
    throw new Error('JSON input must be an array or an object with a messages array');
  } catch (jsonError) {
    const messages = raw.split(/\r?\n/)
      .filter(Boolean)
      .map((line, index) => {
        try {
          return JSON.parse(line);
        } catch (lineError) {
          throw new Error(`line ${index + 1} is not valid JSON: ${lineError.message}`);
        }
      });
    return { envelope: {}, messages };
  }
}

function normalizeMessage(message, index, targetSlug) {
  const timestamp = message.timestamp || message.date || message.created_at || message.time;
  const sender = message.sender || message.from || message.author || message.handle || message.sender_display_name;
  const text = message.text || message.body || message.message || '';
  if (!timestamp) throw new Error(`message ${index + 1} is missing timestamp/date`);
  if (!sender) throw new Error(`message ${index + 1} is missing sender/from/author`);
  if (typeof text !== 'string' || text.trim() === '') return null;

  const senderKey = String(sender).trim();
  const isTargetUser = senderKey.toLowerCase() === targetSlug
    || String(message.sender_slug || '').toLowerCase() === targetSlug
    || Boolean(message.is_target_user);

  return {
    ts: new Date(timestamp).toISOString(),
    user: senderKey,
    user_name: message.sender_display_name || senderKey,
    text,
    is_target_user: isTargetUser,
    permalink: message.permalink || null,
    attachments: Array.isArray(message.attachments) ? message.attachments : [],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  const { envelope, messages } = readInput(inputPath);
  const source = args.source || envelope.source || 'generic';
  const target = envelope.target || {};
  const displayName = target.display_name || args.slug;

  const normalized = messages
    .map((message, index) => normalizeMessage(message, index, args.slug))
    .filter(Boolean)
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));

  if (normalized.length === 0) throw new Error('no messages with text were found');

  const dataHome = process.env.SYNTHTEAM_HOME || path.join(os.homedir(), '.synthteam');
  const outDir = path.join(dataHome, 'assets', args.slug);
  fs.mkdirSync(outDir, { recursive: true });

  const rawPath = path.join(outDir, 'raw-messages.jsonl');
  const metaPath = path.join(outDir, 'metadata.json');
  const conversationTitle = envelope.conversation?.title || `${source}:${args.slug}`;
  const targetMessages = normalized.filter(m => m.is_target_user).length;

  const record = {
    kind: 'message_thread',
    source,
    channel_id: envelope.conversation?.id || conversationTitle,
    channel_name: conversationTitle,
    thread_ts: normalized[0].ts,
    permalink: envelope.conversation?.permalink || null,
    messages: normalized,
  };
  fs.writeFileSync(rawPath, JSON.stringify(record) + '\n');

  const metadata = {
    slug: args.slug,
    source,
    display_name: displayName,
    imported_at: new Date().toISOString(),
    input_path: inputPath,
    date_range: {
      from: normalized[0].ts.slice(0, 10),
      to: normalized[normalized.length - 1].ts.slice(0, 10),
    },
    channels: [{
      id: record.channel_id,
      name: record.channel_name,
      message_count: normalized.length,
    }],
    total_messages: normalized.length,
    total_target_messages: targetMessages,
    total_threads: 1,
    search_capped: false,
  };
  fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2) + '\n');

  console.log('Done.');
  console.log(`  ${rawPath}`);
  console.log(`  ${metaPath}`);
  console.log(`  ${normalized.length} messages (${targetMessages} marked as ${args.slug}) from ${source}`);
}

main();
