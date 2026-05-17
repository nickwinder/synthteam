#!/usr/bin/env node

/**
 * Slack API Client
 * Docs: https://api.slack.com/methods
 *
 * Standalone module - only requires dotenv and .env file
 */

const path = require('path');
const fs = require('fs');

// --- Shared Utilities ---

/**
 * Find and load .env file from current directory or parents.
 */
function loadEnv() {
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    const envPath = path.join(dir, '.env');
    if (fs.existsSync(envPath)) {
      require('dotenv').config({ path: envPath, quiet: true });
      return envPath;
    }
    dir = path.dirname(dir);
  }
  require('dotenv').config({ quiet: true });
  return null;
}

/**
 * Load required environment variable or throw error
 */
function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/**
 * Make HTTP GET request
 */
async function get(url, headers = {}) {
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', ...headers },
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorBody}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

/**
 * Make HTTP POST request
 */
async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`HTTP ${response.status}: ${response.statusText}\n${errorBody}`);
  }

  const contentType = response.headers.get('content-type');
  if (contentType && contentType.includes('application/json')) {
    return response.json();
  }
  return response.text();
}

// --- Slack Client ---

class SlackClient {
  constructor(config = {}) {
    this.userToken = config.userToken || requireEnv('SLACK_USER_TOKEN');
    this.baseUrl = 'https://slack.com/api';
  }

  getHeaders() {
    return { Authorization: `Bearer ${this.userToken}` };
  }

  async getAuthTest() {
    return get(`${this.baseUrl}/auth.test`, this.getHeaders());
  }

  async getSavedMessages() {
    const url = `${this.baseUrl}/stars.list?count=100`;
    const response = await get(url, this.getHeaders());
    if (!response.ok) throw new Error(`Slack API error: ${response.error}`);
    return response.items || [];
  }

  /**
   * Extract context around where the user is mentioned in a message
   * Shows ~60 chars before and after the mention for context
   */
  extractMentionContext(text, userId, contextChars = 60) {
    const mentionPattern = `<@${userId}>`;
    const mentionIndex = text.indexOf(mentionPattern);
    if (mentionIndex === -1) return text.substring(0, 150);

    const start = Math.max(0, mentionIndex - contextChars);
    const end = Math.min(text.length, mentionIndex + mentionPattern.length + contextChars);

    let context = text.substring(start, end);
    if (start > 0) context = '...' + context;
    if (end < text.length) context = context + '...';

    return context.replace(/\n/g, ' ');
  }

  async getMentions(limit = 50, hoursBack = 48, includeThreads = true) {
    const authTest = await this.getAuthTest();
    const userId = authTest.user_id;

    // Calculate time threshold (default: last 48 hours)
    const oldestTimestamp = (Date.now() / 1000) - (hoursBack * 60 * 60);

    // Get ALL channels (not just unread ones - this is the key fix)
    const listUrl = `${this.baseUrl}/conversations.list?types=public_channel,private_channel,im,mpim&exclude_archived=true&limit=1000`;
    const listResponse = await get(listUrl, this.getHeaders());
    if (!listResponse.ok) throw new Error(`Slack API error: ${listResponse.error}`);

    const conversations = listResponse.channels || [];
    const allMentions = [];
    let threadsScanned = 0;

    console.log(`Scanning ${conversations.length} conversations for @mentions in last ${hoursBack}h${includeThreads ? ' (including threads)' : ''}...`);

    // Check ALL conversations for recent mentions (not just "unread" ones)
    for (const conv of conversations) {
      try {
        // Get recent messages from this conversation
        const historyUrl = `${this.baseUrl}/conversations.history?channel=${conv.id}&oldest=${oldestTimestamp}&limit=100`;
        const historyResponse = await get(historyUrl, this.getHeaders());
        if (!historyResponse.ok) continue;

        const messages = historyResponse.messages || [];

        // Find all messages that mention the user (ignore read/unread status)
        for (const msg of messages) {
          // Check top-level message for mention
          if (msg.text?.includes(`<@${userId}>`)) {
            const permalink = await this.getPermalink(conv.id, msg.ts).catch(() => null);
            allMentions.push({
              ...msg,
              channel: conv.id,
              channel_name: conv.name || 'DM',
              permalink: permalink,
              is_thread_reply: false,
              mention_context: this.extractMentionContext(msg.text, userId),
            });
          }

          // Also scan thread replies for mentions (this catches mentions inside threads!)
          if (includeThreads && msg.reply_count && msg.reply_count > 0) {
            threadsScanned++;
            try {
              const repliesUrl = `${this.baseUrl}/conversations.replies?channel=${conv.id}&ts=${msg.ts}&oldest=${oldestTimestamp}`;
              const repliesResponse = await get(repliesUrl, this.getHeaders());
              if (!repliesResponse.ok) continue;

              const replies = repliesResponse.messages || [];
              for (const reply of replies) {
                // Skip the parent message (already checked above) and check replies
                if (reply.ts === msg.ts) continue;

                if (reply.text?.includes(`<@${userId}>`)) {
                  const permalink = await this.getPermalink(conv.id, reply.ts).catch(() => null);
                  allMentions.push({
                    ...reply,
                    channel: conv.id,
                    channel_name: conv.name || 'DM',
                    permalink: permalink,
                    is_thread_reply: true,
                    thread_ts: msg.ts,
                    parent_text: (msg.text || '').substring(0, 50),
                    mention_context: this.extractMentionContext(reply.text, userId),
                  });
                }
              }
            } catch (threadError) {
              // Continue if thread fetch fails
              continue;
            }
          }
        }
      } catch (error) {
        // Continue to next conversation on error
        console.error(`Error checking ${conv.name || conv.id}:`, error.message);
        continue;
      }
    }

    console.log(`Found ${allMentions.length} total @mentions in last ${hoursBack}h (scanned ${threadsScanned} threads)`);

    // Sort by timestamp descending (most recent first) and limit results
    return allMentions
      .sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts))
      .slice(0, limit);
  }

  async getUnreadDMs() {
    const url = `${this.baseUrl}/conversations.list?types=im&exclude_archived=true`;
    const response = await get(url, this.getHeaders());
    if (!response.ok) throw new Error(`Slack API error: ${response.error}`);

    const dmChannels = response.channels || [];
    const unreadDMs = [];

    for (const channel of dmChannels) {
      if (channel.unread_count_display && channel.unread_count_display > 0) {
        const historyUrl = `${this.baseUrl}/conversations.history?channel=${channel.id}&limit=10`;
        const history = await get(historyUrl, this.getHeaders());
        if (history.ok && history.messages) {
          unreadDMs.push({
            channel: channel.id,
            user: channel.user,
            unread_count: channel.unread_count_display,
            messages: history.messages,
          });
        }
      }
    }
    return unreadDMs;
  }

  async getMyCommitments(hoursBack = 168) {
    // hoursBack defaults to 168 (7 days)
    const authTest = await this.getAuthTest();
    const userId = authTest.user_id;

    // Commitment phrases to look for in your messages
    const commitmentPatterns = [
      /\bi'll\b/i,
      /\bi will\b/i,
      /\btodo\b/i,
      /\bi need to\b/i,
      /\blet me\b/i,
      /\bi'm going to\b/i,
      /\bi plan to\b/i,
    ];

    const oldestTimestamp = (Date.now() / 1000) - (hoursBack * 60 * 60);

    // Get all conversations
    const listUrl = `${this.baseUrl}/conversations.list?types=public_channel,private_channel,im,mpim&exclude_archived=true&limit=500`;
    const listResponse = await get(listUrl, this.getHeaders());
    if (!listResponse.ok) throw new Error(`Slack API error: ${listResponse.error}`);

    const conversations = listResponse.channels || [];
    const allCommitments = [];

    console.log(`Scanning ${conversations.length} conversations for your commitments in last ${Math.round(hoursBack/24)} days...`);

    // Check conversations for your messages with commitment phrases
    for (const conv of conversations) {
      try {
        const historyUrl = `${this.baseUrl}/conversations.history?channel=${conv.id}&oldest=${oldestTimestamp}&limit=100`;
        const historyResponse = await get(historyUrl, this.getHeaders());
        if (!historyResponse.ok) continue;

        const messages = historyResponse.messages || [];

        // Find your messages that contain commitment phrases
        for (const msg of messages) {
          if (msg.user === userId && msg.text) {
            const hasCommitment = commitmentPatterns.some(pattern => pattern.test(msg.text));
            if (hasCommitment) {
              const permalink = await this.getPermalink(conv.id, msg.ts).catch(() => null);
              allCommitments.push({
                ...msg,
                channel: conv.id,
                channel_name: conv.name || 'DM',
                permalink: permalink,
              });
            }
          }
        }
      } catch (error) {
        continue;
      }
    }

    console.log(`Found ${allCommitments.length} commitments in last ${Math.round(hoursBack/24)} days`);

    // Sort by timestamp descending and deduplicate
    const unique = [];
    const seen = new Set();
    for (const msg of allCommitments.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts))) {
      if (!seen.has(msg.ts)) {
        seen.add(msg.ts);
        unique.push(msg);
      }
    }
    return unique;
  }

  async getUserInfo(userId) {
    const url = `${this.baseUrl}/users.info?user=${userId}`;
    const response = await get(url, this.getHeaders());
    if (!response.ok) throw new Error(`Slack API error: ${response.error}`);
    return response.user;
  }

  async getPermalink(channelId, messageTs) {
    const url = `${this.baseUrl}/chat.getPermalink?channel=${channelId}&message_ts=${messageTs}`;
    const response = await get(url, this.getHeaders());
    if (!response.ok) throw new Error(`Slack API error: ${response.error}`);
    return response.permalink;
  }

  /**
   * Get unread messages from a specific channel
   * @param {string} channelName - Channel name (e.g., 'ai') or ID (e.g., 'C1234567890')
   * @returns {Promise<array>} Array of unread messages
   */
  async getUnreadChannelMessages(channelName) {
    // First, get the channel ID if a name was provided
    let channelId = channelName;
    if (!channelName.startsWith('C')) {
      const listUrl = `${this.baseUrl}/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=1000`;
      const listResponse = await get(listUrl, this.getHeaders());
      if (!listResponse.ok) throw new Error(`Slack API error: ${listResponse.error}`);

      const channel = listResponse.channels?.find(ch => ch.name === channelName);
      if (!channel) throw new Error(`Channel not found: ${channelName}`);
      channelId = channel.id;
    }

    // Get channel info to find the last read timestamp
    const infoUrl = `${this.baseUrl}/conversations.info?channel=${channelId}`;
    const infoResponse = await get(infoUrl, this.getHeaders());
    if (!infoResponse.ok) throw new Error(`Slack API error: ${infoResponse.error}`);

    const lastRead = infoResponse.channel.last_read || '0';

    // Get recent messages
    const historyUrl = `${this.baseUrl}/conversations.history?channel=${channelId}&limit=50`;
    const historyResponse = await get(historyUrl, this.getHeaders());
    if (!historyResponse.ok) throw new Error(`Slack API error: ${historyResponse.error}`);

    // Filter to only unread messages (timestamp > last_read)
    const unreadMessages = (historyResponse.messages || []).filter(msg =>
      parseFloat(msg.ts) > parseFloat(lastRead)
    );

    return unreadMessages.map(msg => ({
      ...msg,
      channel: channelId,
      channel_name: infoResponse.channel.name,
    }));
  }

  /**
   * Get threads where the user was mentioned or participated (time-based, not read-status)
   * @param {number} hoursBack - How many hours back to check (default: 48)
   * @returns {Promise<array>} Array of threads with user activity
   */
  async getUnreadThreads(hoursBack = 48) {
    const authTest = await this.getAuthTest();
    const userId = authTest.user_id;

    // Calculate time threshold
    const oldestTimestamp = (Date.now() / 1000) - (hoursBack * 60 * 60);

    // Get all channels the user is in
    const listUrl = `${this.baseUrl}/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=1000`;
    const listResponse = await get(listUrl, this.getHeaders());
    if (!listResponse.ok) throw new Error(`Slack API error: ${listResponse.error}`);

    const channels = listResponse.channels || [];
    const relevantThreads = [];

    console.log(`Scanning threads in ${channels.length} channels for last ${hoursBack}h...`);

    // For each channel, check for threads with user involvement
    for (const channel of channels) {
      if (!channel.is_member) continue;

      try {
        // Get recent messages that might have threads
        const historyUrl = `${this.baseUrl}/conversations.history?channel=${channel.id}&oldest=${oldestTimestamp}&limit=100`;
        const historyResponse = await get(historyUrl, this.getHeaders());
        if (!historyResponse.ok) continue;

        const messages = historyResponse.messages || [];

        // Check each message that has a thread
        for (const msg of messages) {
          if (msg.reply_count && msg.reply_count > 0) {
            // Get thread replies
            const repliesUrl = `${this.baseUrl}/conversations.replies?channel=${channel.id}&ts=${msg.ts}`;
            const repliesResponse = await get(repliesUrl, this.getHeaders());
            if (!repliesResponse.ok) continue;

            const replies = repliesResponse.messages || [];

            // Check if user is mentioned in thread or if user participated
            const userMentions = replies.filter(r => r.text?.includes(`<@${userId}>`));
            const userParticipated = replies.some(r => r.user === userId);

            if (userMentions.length > 0 || userParticipated) {
              // Check if thread has recent activity (within time window)
              const recentReplies = replies.filter(r => parseFloat(r.ts) > oldestTimestamp);

              if (recentReplies.length > 0) {
                // Get permalink for the thread
                const permalink = await this.getPermalink(channel.id, msg.ts).catch(() => null);

                relevantThreads.push({
                  channel: channel.id,
                  channel_name: channel.name,
                  thread_ts: msg.ts,
                  parent_message: msg.text?.substring(0, 100),
                  reply_count: msg.reply_count,
                  latest_reply: replies[replies.length - 1]?.text?.substring(0, 100),
                  recent_replies: recentReplies,
                  user_mentioned: userMentions.length > 0,
                  user_participated: userParticipated,
                  permalink: permalink,
                });
              }
            }
          }
        }
      } catch (error) {
        console.error(`Error checking threads in ${channel.name}:`, error.message);
        continue;
      }
    }

    console.log(`Found ${relevantThreads.length} threads with user activity in last ${hoursBack}h`);

    return relevantThreads;
  }

  /**
   * Post a message to a Slack channel
   * @param {string} channel - Channel ID or name (e.g., 'C1234567890' or '#general')
   * @param {string} text - Message text in mrkdwn format
   * @param {object} options - Additional options (thread_ts, attachments, etc.)
   * @returns {Promise<object>} Response with message details
   */
  async postMessage(channel, text, options = {}) {
    const url = `${this.baseUrl}/chat.postMessage`;
    const body = {
      channel,
      text,
      mrkdwn: true,
      ...options,
    };
    const response = await post(url, body, this.getHeaders());
    if (!response.ok) throw new Error(`Slack API error: ${response.error}`);
    return response;
  }
}

module.exports = { SlackClient, loadEnv, requireEnv };
