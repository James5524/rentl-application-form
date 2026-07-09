// Storage layer. Two modes:
//  - MONGODB_URI set (e.g. on Render): reads/writes go to a free MongoDB Atlas
//    cluster, so data survives restarts/redeploys - unlike Render's own disk.
//  - MONGODB_URI not set (local dev): falls back to a plain data/db.json file,
//    so you don't need a database just to run this on your own machine.

const fs = require('fs');
const path = require('path');

const MONGODB_URI = process.env.MONGODB_URI;
const useMongo = !!MONGODB_URI;

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

// ---------- MongoDB-backed storage ----------

let mongoDbPromise = null;
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function connectOnce() {
  const { MongoClient } = require('mongodb');
  const client = new MongoClient(MONGODB_URI, {
    // Fail fast and predictably instead of hanging indefinitely - Render's
    // network path to this free cluster has been intermittently slow/flaky.
    serverSelectionTimeoutMS: 15000,
    connectTimeoutMS: 15000,
    socketTimeoutMS: 20000,
    // Force IPv4. Mixed IPv4/IPv6 routing between some hosts and Atlas has
    // been a known cause of exactly the "tlsv1 alert internal error" seen here.
    family: 4
  });
  const connectedClient = await client.connect();
  const db = connectedClient.db('formforge');
  console.log(`[mongo] Connected. Using database "${db.databaseName}" on cluster "${connectedClient.options.srvHost || 'unknown'}"`);
  try {
    const allDbs = await connectedClient.db().admin().listDatabases();
    console.log(`[mongo] Databases visible to this connection: ${allDbs.databases.map(d => d.name).join(', ')}`);
  } catch (listErr) {
    console.log(`[mongo] (couldn't list databases - not critical: ${listErr.message})`);
  }
  return db;
}

function getMongoDb() {
  if (!mongoDbPromise) {
    const redacted = MONGODB_URI.replace(/:\/\/([^:]+):[^@]+@/, '://$1:****@');
    const ATTEMPTS = 3;
    mongoDbPromise = (async () => {
      let lastErr;
      for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
        console.log(`[mongo] Connecting (attempt ${attempt}/${ATTEMPTS}) using: ${redacted}`);
        try {
          return await connectOnce();
        } catch (err) {
          lastErr = err;
          console.log(`[mongo] Attempt ${attempt} failed: ${err.message}`);
          if (attempt < ATTEMPTS) await sleep(2000);
        }
      }
      throw lastErr;
    })().catch((err) => {
      mongoDbPromise = null; // allow a fresh retry on the next call instead of caching a rejected promise forever
      throw err;
    });
  }
  return mongoDbPromise;
}

async function readMongoDb() {
  const db = await getMongoDb();
  const forms = await db.collection('forms').find({}).toArray();
  const submissions = await db.collection('submissions').find({}).toArray();
  console.log(`[mongo] read: ${forms.length} form(s), ${submissions.length} submission(s)`);
  // Strip Mongo's internal _id so the shape matches what the rest of the app expects.
  return {
    forms: forms.map(({ _id, ...f }) => f),
    submissions: submissions.map(({ _id, ...s }) => s)
  };
}

async function writeMongoDb(data) {
  const db = await getMongoDb();
  // The app always reads/writes the whole collection at once (small dataset,
  // simplicity over efficiency), so mirror that here with a full replace.
  await db.collection('forms').deleteMany({});
  if (data.forms.length) await db.collection('forms').insertMany(data.forms);
  await db.collection('submissions').deleteMany({});
  if (data.submissions.length) await db.collection('submissions').insertMany(data.submissions);
  const formsCount = await db.collection('forms').countDocuments();
  console.log(`[mongo] wrote: ${data.forms.length} form(s), ${data.submissions.length} submission(s) - verified ${formsCount} form(s) now in collection`);
}

// ---------- Public API (always async now, whichever backend is active) ----------

async function readDb() {
  return useMongo ? readMongoDb() : readLocalDb();
}

async function writeDb(data) {
  return useMongo ? writeMongoDb(data) : writeLocalDb(data);
}

module.exports = { readDb, writeDb, useMongo };
