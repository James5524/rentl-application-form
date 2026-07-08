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

function getMongoDb() {
  if (!mongoDbPromise) {
    const { MongoClient } = require('mongodb');
    const client = new MongoClient(MONGODB_URI);
    mongoDbPromise = client.connect().then(() => client.db('formforge'));
  }
  return mongoDbPromise;
}

async function readMongoDb() {
  const db = await getMongoDb();
  const forms = await db.collection('forms').find({}).toArray();
  const submissions = await db.collection('submissions').find({}).toArray();
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
}

// ---------- Public API (always async now, whichever backend is active) ----------

async function readDb() {
  return useMongo ? readMongoDb() : readLocalDb();
}

async function writeDb(data) {
  return useMongo ? writeMongoDb(data) : writeLocalDb(data);
}

module.exports = { readDb, writeDb, useMongo };
