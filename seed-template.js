// Run this with `node seed-template.js` to add a fresh copy of the "RENTL Application
// Template" form to the app's data file. The server also auto-creates this template
// on startup if none exists, so you normally won't need to run this manually -
// it's here in case you ever want an extra clean copy.

const crypto = require('crypto');
const { readDb, writeDb } = require('./db');
const template = require('./template-data');

const genId = () => crypto.randomBytes(6).toString('hex');

const db = readDb();
const now = new Date().toISOString();
const form = {
  id: genId(),
  title: template.title,
  description: '',
  fields: template.fields,
  createdAt: now,
  updatedAt: now
};
db.forms.push(form);
writeDb(db);

console.log(`Created "${template.title}" (id: ${form.id}).`);
console.log('Open the app, click "Duplicate" on this form for each property, and give it that property\'s title.');
