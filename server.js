const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { readDb, writeDb } = require('./db');

// Load simple KEY=VALUE pairs from a .env file, if present, without adding a dependency.
function loadEnvFile() {
  const envPath = path.join(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const app = express();
const PORT = process.env.PORT || 3210;

// Email notifications (optional): set RESEND_API_KEY and NOTIFY_EMAIL to get an
// email copy of every submission, sent via https://resend.com's free tier.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const NOTIFY_FROM = process.env.NOTIFY_FROM || 'FormForge <onboarding@resend.dev>';

async function sendSubmissionEmail(form, submission) {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.warn('Email notifications skipped: set RESEND_API_KEY and NOTIFY_EMAIL to enable them.');
    return;
  }
  const columns = getColumns(form.fields);
  const rowValues = getRowValues(form.fields, submission.data);
  const rows = columns.map(c => {
    return `<tr><td style="padding:4px 10px;color:#6b7280;">${escapeHtml(c.label)}</td><td style="padding:4px 10px;">${escapeHtml(rowValues[c.key] ?? '')}</td></tr>`;
  }).join('');

  const html = `
    <h2>New submission: ${escapeHtml(form.title)}</h2>
    <p style="color:#6b7280;">Submitted ${new Date(submission.submittedAt).toLocaleString()}</p>
    <table>${rows}</table>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: NOTIFY_FROM,
        to: [NOTIFY_EMAIL],
        subject: `New application: ${form.title}`,
        html
      })
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('Resend email failed:', res.status, body);
    }
  } catch (err) {
    console.error('Resend email error:', err.message);
  }
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---------- Field helpers (shared logic for validation / CSV / flattening) ----------
// A "repeater" field asks a count question (e.g. "how many adults?") and then
// repeats a small set of sub-fields ("itemFields") once per unit, up to field.max.
// A "heading" field is just static instructional text - it holds no data.

function validateRequired(fields, data) {
  const missing = [];
  for (const field of fields) {
    if (field.type === 'heading') continue;
    if (field.type === 'repeater') {
      const arr = Array.isArray(data[field.id]) ? data[field.id] : [];
      if (field.required && arr.length < (field.min || 1)) {
        missing.push(field.label);
        continue;
      }
      arr.forEach((item, idx) => {
        (field.itemFields || []).forEach(itemField => {
          if (itemField.type === 'heading') return;
          if (itemField.required && !String((item || {})[itemField.id] ?? '').trim()) {
            missing.push(`${field.itemLabel || 'Person'} ${idx + 1} - ${itemField.label}`);
          }
        });
      });
    } else if (field.required && !String(data[field.id] ?? '').trim()) {
      missing.push(field.label);
    }
  }
  return missing;
}

// Flatten a form's fields into a flat list of {key, label} columns, for CSV export
// and the responses table. Repeater fields expand into one column per sub-field
// per unit, up to their configured max.
function getColumns(fields) {
  const cols = [];
  for (const field of fields) {
    if (field.type === 'heading') continue;
    if (field.type === 'repeater') {
      cols.push({ key: `${field.id}__count`, label: field.label });
      const max = field.max || 4;
      for (let i = 1; i <= max; i++) {
        (field.itemFields || []).forEach(itemField => {
          if (itemField.type === 'heading') return;
          cols.push({ key: `${field.id}__${i}__${itemField.id}`, label: `${field.itemLabel || 'Person'} ${i} - ${itemField.label}` });
        });
      }
    } else {
      cols.push({ key: field.id, label: field.label });
    }
  }
  return cols;
}

// Flatten one submission's data into a flat {key: value} row matching getColumns().
function getRowValues(fields, data) {
  const row = {};
  for (const field of fields) {
    if (field.type === 'heading') continue;
    if (field.type === 'repeater') {
      const arr = Array.isArray(data[field.id]) ? data[field.id] : [];
      row[`${field.id}__count`] = arr.length || '';
      const max = field.max || 4;
      for (let i = 1; i <= max; i++) {
        const item = arr[i - 1] || {};
        (field.itemFields || []).forEach(itemField => {
          if (itemField.type === 'heading') return;
          row[`${field.id}__${i}__${itemField.id}`] = item[itemField.id] ?? '';
        });
      }
    } else {
      row[field.id] = data[field.id] ?? '';
    }
  }
  return row;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const genId = () => crypto.randomBytes(6).toString('hex');

// If there are no forms at all (fresh install, or free-tier storage got wiped
// on restart), recreate the RENTL Application Template so it's always there.
function ensureSeedTemplate() {
  const db = readDb();
  if (db.forms.length > 0) return;
  const template = require('./template-data');
  const now = new Date().toISOString();
  db.forms.push({
    id: genId(),
    title: template.title,
    description: '',
    fields: template.fields,
    createdAt: now,
    updatedAt: now
  });
  writeDb(db);
  console.log(`Seeded default form: "${template.title}"`);
}
ensureSeedTemplate();

// ---------- Forms API ----------

// List all forms (summary only)
app.get('/api/forms', (req, res) => {
  const db = readDb();
  const summaries = db.forms.map(f => ({
    id: f.id,
    title: f.title,
    description: f.description,
    fieldCount: f.fields.length,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    submissionCount: db.submissions.filter(s => s.formId === f.id).length
  }));
  res.json(summaries);
});

// Get a single form (full editable version, for the builder)
app.get('/api/forms/:id', (req, res) => {
  const db = readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
});

// Public-safe version of a form (for the shareable link, no internal metadata needed beyond fields)
app.get('/api/forms/:id/public', (req, res) => {
  const db = readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json({
    id: form.id,
    title: form.title,
    description: form.description,
    fields: form.fields
  });
});

// Create a new form
app.post('/api/forms', (req, res) => {
  const { title, description, fields } = req.body;
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }
  const db = readDb();
  const now = new Date().toISOString();
  const form = {
    id: genId(),
    title,
    description: description || '',
    fields: Array.isArray(fields) ? fields : [],
    createdAt: now,
    updatedAt: now
  };
  db.forms.push(form);
  writeDb(db);
  res.status(201).json(form);
});

// Duplicate an existing form (same fields/description, new id, new title)
app.post('/api/forms/:id/duplicate', (req, res) => {
  const db = readDb();
  const source = db.forms.find(f => f.id === req.params.id);
  if (!source) return res.status(404).json({ error: 'Form not found' });

  const now = new Date().toISOString();
  const title = (req.body && req.body.title) || `Copy of ${source.title}`;
  const copy = {
    id: genId(),
    title,
    description: source.description,
    fields: JSON.parse(JSON.stringify(source.fields)),
    createdAt: now,
    updatedAt: now
  };
  db.forms.push(copy);
  writeDb(db);
  res.status(201).json(copy);
});

// Update an existing form
app.put('/api/forms/:id', (req, res) => {
  const db = readDb();
  const idx = db.forms.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Form not found' });

  const { title, description, fields } = req.body;
  const form = db.forms[idx];
  if (title !== undefined) form.title = title;
  if (description !== undefined) form.description = description;
  if (fields !== undefined) form.fields = fields;
  form.updatedAt = new Date().toISOString();

  db.forms[idx] = form;
  writeDb(db);
  res.json(form);
});

// Delete a form (and its submissions)
app.delete('/api/forms/:id', (req, res) => {
  const db = readDb();
  const exists = db.forms.some(f => f.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Form not found' });

  db.forms = db.forms.filter(f => f.id !== req.params.id);
  db.submissions = db.submissions.filter(s => s.formId !== req.params.id);
  writeDb(db);
  res.status(204).end();
});

// ---------- Submissions API ----------

// Submit a response to a form (public endpoint used by the shared form page)
app.post('/api/forms/:id/submit', (req, res) => {
  const db = readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });

  const data = req.body.data || {};

  const missing = validateRequired(form.fields, data);
  if (missing.length) {
    return res.status(400).json({ error: `Missing required field(s): ${missing.join(', ')}` });
  }

  const submission = {
    id: genId(),
    formId: form.id,
    data,
    submittedAt: new Date().toISOString()
  };
  db.submissions.push(submission);
  writeDb(db);
  res.status(201).json(submission);

  // Fire-and-forget: don't let email issues affect the applicant's experience.
  sendSubmissionEmail(form, submission);
});

// List submissions for a form
app.get('/api/forms/:id/submissions', (req, res) => {
  const db = readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  const submissions = db.submissions
    .filter(s => s.formId === req.params.id)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ form, submissions });
});

// Export submissions as CSV
app.get('/api/forms/:id/submissions/export', (req, res) => {
  const db = readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  const submissions = db.submissions.filter(s => s.formId === req.params.id);

  const columns = getColumns(form.fields);
  const headers = ['Submitted At', ...columns.map(c => c.label)];
  const escapeCsv = (val) => {
    const s = String(val ?? '');
    if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const rows = submissions.map(s => {
    const rowValues = getRowValues(form.fields, s.data);
    const row = [s.submittedAt, ...columns.map(c => rowValues[c.key] ?? '')];
    return row.map(escapeCsv).join(',');
  });
  const csv = [headers.map(escapeCsv).join(','), ...rows].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${form.title.replace(/[^a-z0-9]+/gi, '_')}_submissions.csv"`);
  res.send(csv);
});

// Delete a single submission
app.delete('/api/forms/:formId/submissions/:subId', (req, res) => {
  const db = readDb();
  const before = db.submissions.length;
  db.submissions = db.submissions.filter(s => !(s.formId === req.params.formId && s.id === req.params.subId));
  if (db.submissions.length === before) return res.status(404).json({ error: 'Submission not found' });
  writeDb(db);
  res.status(204).end();
});

// ---------- Pages ----------

// Public shareable form page
app.get('/f/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'form.html'));
});

app.listen(PORT, () => {
  console.log(`FormForge running at http://localhost:${PORT}`);
});
