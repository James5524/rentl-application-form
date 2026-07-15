// Storage layer. Two modes:
//  - UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN set (e.g. on Render): reads/writes
//    go to a free Upstash Redis database over a plain HTTPS REST API, so data survives
//    restarts/redeploys - unlike Render's own disk. (We tried MongoDB Atlas first, but its
//    native TLS socket connection was consistently incompatible with Render's network -
//    Upstash's REST API uses ordinary HTTPS instead, the same way the Resend email
//    integration already does, sidestepping that whole problem.)
//  - Neither set (local dev): falls back to a plain data/db.json file, so you don't need
//    an external database just to run this on your own machine.

const fs = require('fs');
const path = require('path');

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL;
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
const useUpstash = !!(UPSTASH_URL && UPSTASH_TOKEN);

const REDIS_KEY = 'formforge:db';

// ---------- Local JSON file fallback ----------

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

function ensureLocalDb() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ forms: [], submissions: [] }, null, 2));
  }
}

function readLocalDb() {
  ensureLocalDb();
  const raw = fs.readFileSync(DB_FILE, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (e) {
    return { forms: [], submissions: [] };
  }
}

function writeLocalDb(data) {
  ensureLocalDb();
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ---------- Upstash Redis-backed storage (plain HTTPS REST calls) ----------

async function upstashCommand(command) {
  const res = await fetch(UPSTASH_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${UPSTASH_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(command)
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Upstash request failed: ${res.status} ${body}`);
  }
  const json = await res.json();
  if (json.error) throw new Error(`Upstash error: ${json.error}`);
  return json.result;
}

async function readUpstashDb() {
  const raw = await upstashCommand(['GET', REDIS_KEY]);
  if (!raw) {
    console.log('[upstash] No data yet - starting fresh');
    return { forms: [], submissions: [] };
  }
  try {
    const data = JSON.parse(raw);
    console.log(`[upstash] read: ${data.forms.length} form(s), ${data.submissions.length} submission(s)`);
    return data;
  } catch (e) {
    console.error('[upstash] Stored data was not valid JSON, starting fresh:', e.message);
    return { forms: [], submissions: [] };
  }
}

async function writeUpstashDb(data) {
  await upstashCommand(['SET', REDIS_KEY, JSON.stringify(data)]);
  console.log(`[upstash] wrote: ${data.forms.length} form(s), ${data.submissions.length} submission(s)`);
}

// ---------- Public API ----------

async function readDb() {
  return useUpstash ? readUpstashDb() : readLocalDb();
}

async function writeDb(data) {
  return useUpstash ? writeUpstashDb(data) : writeLocalDb(data);
}

module.exports = { readDb, writeDb, useUpstash };
