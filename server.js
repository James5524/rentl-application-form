const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { readDb, writeDb, useUpstash } = require('./db');
const { buildGasCheckPdf } = require('./gas-check-pdf');
const { buildServiceRecordPdf } = require('./service-record-pdf');

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
// Render sits behind a proxy that terminates HTTPS before traffic reaches this
// app, so without this, req.protocol would always report "http" even on the
// live https:// site - this makes it read the real scheme from the proxy.
app.set('trust proxy', true);
const PORT = process.env.PORT || 3210;

// Email notifications (optional): set RESEND_API_KEY and NOTIFY_EMAIL to get an
// email copy of every submission, sent via https://resend.com's free tier.
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFY_EMAIL = process.env.NOTIFY_EMAIL;
const NOTIFY_FROM = process.env.NOTIFY_FROM || 'FormForge <onboarding@resend.dev>';

// Builds a clean, Jotform-style notification email: a colored title bar, then
// one label/value block per question, with repeater fields grouped under a
// pill-style "Adult 1" / "Adult 2" heading - only for adults actually
// submitted (not padded out to the field's max).
function buildSubmissionEmailHtml(form, submission) {
  const data = submission.data || {};

  const escVal = (v) => {
    const s = (v === undefined || v === null) ? '' : String(v).trim();
    return s ? escapeHtml(s) : '<span style="color:#9ca3af;">Not provided</span>';
  };

  const fieldRow = (field, value) => `
    <tr>
      <td style="padding:10px 20px;border-bottom:1px solid #eef0f5;">
        <div style="font-size:11px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;margin-bottom:4px;">${escapeHtml(field.label)}</div>
        <div style="font-size:14px;color:#1f2430;line-height:1.4;">${escVal(value)}</div>
      </td>
    </tr>`;

  const sectionRow = (label) => `
    <tr>
      <td style="padding:22px 20px 8px 20px;">
        <div style="display:inline-block;font-size:13px;font-weight:700;color:#4338ca;background:#eef2ff;padding:4px 10px;border-radius:999px;">${escapeHtml(label)}</div>
      </td>
    </tr>`;

  const rows = [];
  for (const field of form.fields) {
    if (field.type === 'heading') continue;
    if (field.type === 'repeater') {
      const arr = Array.isArray(data[field.id]) ? data[field.id] : [];
      arr.forEach((item, idx) => {
        rows.push(sectionRow(`${field.itemLabel || 'Person'} ${idx + 1}`));
        (field.itemFields || []).forEach(itemField => {
          if (itemField.type === 'heading') return;
          rows.push(fieldRow(itemField, (item || {})[itemField.id]));
        });
      });
    } else {
      rows.push(fieldRow(field, data[field.id]));
    }
  }

  return `
  <div style="background:#f5f6fa;padding:24px;">
    <table role="presentation" width="100%" style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e2e5ec;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
      <tr>
        <td style="background:#4338ca;color:#ffffff;padding:18px 20px;">
          <div style="font-size:12px;opacity:.8;text-transform:uppercase;letter-spacing:.05em;margin-bottom:2px;">New submission</div>
          <div style="font-size:18px;font-weight:700;">${escapeHtml(form.title)}</div>
        </td>
      </tr>
      <tr>
        <td style="padding:10px 20px 0 20px;font-size:12px;color:#6b7280;">
          Submitted ${new Date(submission.submittedAt).toLocaleString('en-GB')}
        </td>
      </tr>
      ${rows.join('')}
    </table>
  </div>`;
}

// Finds the applicant's own email address in their submitted data, so replying
// to the notification email goes straight to them instead of nowhere/no-one.
// Looks for a top-level "email" type field first, then the first "email" type
// field inside a repeater (e.g. the first adult's email address).
function findApplicantEmail(form, data) {
  for (const field of form.fields) {
    if (field.type === 'email' && data[field.id]) {
      return data[field.id];
    }
  }
  for (const field of form.fields) {
    if (field.type === 'repeater') {
      const arr = Array.isArray(data[field.id]) ? data[field.id] : [];
      const emailField = (field.itemFields || []).find(f => f.type === 'email');
      if (emailField) {
        for (const item of arr) {
          if (item && item[emailField.id]) return item[emailField.id];
        }
      }
    }
  }
  return null;
}

async function sendSubmissionEmail(form, submission) {
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    console.warn('Email notifications skipped: set RESEND_API_KEY and NOTIFY_EMAIL to enable them.');
    return;
  }
  const html = buildSubmissionEmailHtml(form, submission);
  const applicantEmail = findApplicantEmail(form, submission.data || {});

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
        html,
        ...(applicantEmail ? { reply_to: [applicantEmail] } : {})
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

// Wrap async route handlers so a thrown/rejected error becomes a clean 500
// response instead of hanging the request or crashing the process.
function asyncRoute(handler) {
  return (req, res) => {
    handler(req, res).catch(err => {
      console.error('Request error:', err);
      if (!res.headersSent) res.status(500).json({ error: 'Something went wrong on the server.' });
    });
  };
}

// If there are no forms at all (fresh install, or free-tier storage got wiped
// on restart), recreate the RENTL Application Template so it's always there.
async function ensureSeedTemplate() {
  const db = await readDb();
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
  await writeDb(db);
  console.log(`Seeded default form: "${template.title}"`);
}

// ---------- Forms API ----------

// List all forms (summary only)
app.get('/api/forms', asyncRoute(async (req, res) => {
  const db = await readDb();
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
}));

// Get a single form (full editable version, for the builder)
app.get('/api/forms/:id', asyncRoute(async (req, res) => {
  const db = await readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json(form);
}));

// Public-safe version of a form (for the shareable link, no internal metadata needed beyond fields)
app.get('/api/forms/:id/public', asyncRoute(async (req, res) => {
  const db = await readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  res.json({
    id: form.id,
    title: form.title,
    description: form.description,
    fields: form.fields
  });
}));

// Create a new form
app.post('/api/forms', asyncRoute(async (req, res) => {
  const { title, description, fields } = req.body;
  if (!title || typeof title !== 'string') {
    return res.status(400).json({ error: 'Title is required' });
  }
  const db = await readDb();
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
  await writeDb(db);
  res.status(201).json(form);
}));

// Duplicate an existing form (same fields/description, new id, new title)
app.post('/api/forms/:id/duplicate', asyncRoute(async (req, res) => {
  const db = await readDb();
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
  await writeDb(db);
  res.status(201).json(copy);
}));

// Update an existing form
app.put('/api/forms/:id', asyncRoute(async (req, res) => {
  const db = await readDb();
  const idx = db.forms.findIndex(f => f.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Form not found' });

  const { title, description, fields } = req.body;
  const form = db.forms[idx];
  if (title !== undefined) form.title = title;
  if (description !== undefined) form.description = description;
  if (fields !== undefined) form.fields = fields;
  form.updatedAt = new Date().toISOString();

  db.forms[idx] = form;
  await writeDb(db);
  res.json(form);
}));

// Delete a form (and its submissions)
app.delete('/api/forms/:id', asyncRoute(async (req, res) => {
  const db = await readDb();
  const exists = db.forms.some(f => f.id === req.params.id);
  if (!exists) return res.status(404).json({ error: 'Form not found' });

  db.forms = db.forms.filter(f => f.id !== req.params.id);
  db.submissions = db.submissions.filter(s => s.formId !== req.params.id);
  await writeDb(db);
  res.status(204).end();
}));

// ---------- Submissions API ----------

// Submit a response to a form (public endpoint used by the shared form page)
app.post('/api/forms/:id/submit', asyncRoute(async (req, res) => {
  const db = await readDb();
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
  await writeDb(db);
  res.status(201).json(submission);

  // Fire-and-forget: don't let email issues affect the applicant's experience.
  sendSubmissionEmail(form, submission);
}));

// List submissions for a form
app.get('/api/forms/:id/submissions', asyncRoute(async (req, res) => {
  const db = await readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  if (!form) return res.status(404).json({ error: 'Form not found' });
  const submissions = db.submissions
    .filter(s => s.formId === req.params.id)
    .sort((a, b) => new Date(b.submittedAt) - new Date(a.submittedAt));
  res.json({ form, submissions });
}));

// Export submissions as CSV
app.get('/api/forms/:id/submissions/export', asyncRoute(async (req, res) => {
  const db = await readDb();
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
}));

// Delete a single submission
app.delete('/api/forms/:formId/submissions/:subId', asyncRoute(async (req, res) => {
  const db = await readDb();
  const before = db.submissions.length;
  db.submissions = db.submissions.filter(s => !(s.formId === req.params.formId && s.id === req.params.subId));
  if (db.submissions.length === before) return res.status(404).json({ error: 'Submission not found' });
  await writeDb(db);
  res.status(204).end();
}));

// ---------- Gas Safety Record (fixed contractor form, no dashboard storage) ----------

// Generates a CP12-style PDF from the submission and emails it straight to
// RENTL. Unlike the application forms, nothing is saved to the database - if
// the email fails to send, the contractor is told so directly (there's no
// dashboard fallback to recover a lost submission from).
app.post('/api/gas-check/submit', asyncRoute(async (req, res) => {
  const data = req.body || {};
  if (!data.addressLine1 || !data.engineerName || !data.signature) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    return res.status(500).json({ error: 'Email sending is not configured on this server.' });
  }

  // No database for this form, so there's no sequential counter to draw a
  // serial number from - instead generate a short, practically-unique code
  // from the current time plus a few random bytes.
  const serialNo = `GSR-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  data.serialNo = serialNo;

  const pdfBuffer = await buildGasCheckPdf(data);
  const addressSlug = (data.addressLine1 || 'property').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
  const filename = `Gas_Safety_Record_${addressSlug}_${data.inspectionDate || ''}.pdf`;

  const recipients = [NOTIFY_EMAIL];
  if (data.engineerEmail && data.engineerEmail.trim()) {
    recipients.push(data.engineerEmail.trim());
  }

  const fullAddress = [data.addressLine1, data.addressLine2, data.addressPostcode].filter(Boolean).join(', ');

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: recipients,
      subject: `Gas Safety Record - ${fullAddress || 'Property'} (${serialNo})`,
      html: `<p>A new Landlord Gas Safety Record has been submitted for:</p><p><strong>${escapeHtml(fullAddress)}</strong></p><p>Serial No: ${escapeHtml(serialNo)}</p><p>See attached PDF.</p>`,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }]
    })
  });

  if (!emailRes.ok) {
    const body = await emailRes.text().catch(() => '');
    console.error('Gas check email failed:', emailRes.status, body);
    return res.status(502).json({ error: 'Could not send the email. Please try again or contact RENTL directly.' });
  }

  res.status(201).json({ ok: true });
}));

// ---------- Maintenance / Service Check List (fixed contractor form, no dashboard storage) ----------

// Generates a Service Check List PDF from the submission and emails it
// straight to RENTL, CC'ing the engineer. Same fire-it-and-tell-them-directly
// pattern as /api/gas-check/submit - nothing is saved to the database.
app.post('/api/service-record/submit', asyncRoute(async (req, res) => {
  const data = req.body || {};
  if (!data.addressLine1 || !data.engineerName || !data.customerSignature || !data.engineerSignature) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }
  if (!RESEND_API_KEY || !NOTIFY_EMAIL) {
    return res.status(500).json({ error: 'Email sending is not configured on this server.' });
  }

  // No database for this form, so there's no sequential counter to draw a
  // serial number from - instead generate a short, practically-unique code
  // from the current time plus a few random bytes (same pattern as GSR-...).
  const serialNo = `SVC-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  data.serialNo = serialNo;

  const pdfBuffer = await buildServiceRecordPdf(data);
  const addressSlug = (data.addressLine1 || 'property').replace(/[^a-z0-9]+/gi, '_').slice(0, 40);
  const filename = `Service_Record_${addressSlug}_${data.inspectionDate || ''}.pdf`;

  const recipients = [NOTIFY_EMAIL];
  if (data.engineerEmail && data.engineerEmail.trim()) {
    recipients.push(data.engineerEmail.trim());
  }

  const fullAddress = [data.addressLine1, data.addressLine2, data.addressPostcode].filter(Boolean).join(', ');

  const emailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: NOTIFY_FROM,
      to: recipients,
      subject: `Service Record - ${fullAddress || 'Property'} (${serialNo})`,
      html: `<p>A new Maintenance/Service Check List has been submitted for:</p><p><strong>${escapeHtml(fullAddress)}</strong></p><p>Serial No: ${escapeHtml(serialNo)}</p><p>See attached PDF.</p>`,
      attachments: [{ filename, content: pdfBuffer.toString('base64') }]
    })
  });

  if (!emailRes.ok) {
    const body = await emailRes.text().catch(() => '');
    console.error('Service record email failed:', emailRes.status, body);
    return res.status(502).json({ error: 'Could not send the email. Please try again or contact RENTL directly.' });
  }

  res.status(201).json({ ok: true });
}));

// ---------- Pages ----------

// Gas Safety Record contractor form page
app.get('/gas-check', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'gas-check.html'));
});

// Maintenance/Service Check List contractor form page
app.get('/service-record', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'service-record.html'));
});

// Public shareable form page. Fills in the page title and link-preview
// (Open Graph / Twitter card) tags with the actual form's name, so sharing
// the link in WhatsApp/iMessage/Slack/etc. shows a proper preview card with
// the RENTL logo and the specific property name - preview scanners don't run
// the page's JavaScript, so this has to happen server-side before sending.
app.get('/f/:id', asyncRoute(async (req, res) => {
  const db = await readDb();
  const form = db.forms.find(f => f.id === req.params.id);
  const title = form ? form.title : 'Application form';
  const desc = (form && form.description) ? form.description : 'Complete this application form online.';
  const imageUrl = `${req.protocol}://${req.get('host')}/logo.png`;

  let html = fs.readFileSync(path.join(__dirname, 'public', 'form.html'), 'utf-8');
  html = html
    .split('__OG_TITLE__').join(escapeHtml(title))
    .split('__OG_DESC__').join(escapeHtml(desc))
    .split('__OG_IMAGE__').join(imageUrl);

  res.set('Content-Type', 'text/html');
  res.send(html);
}));

// ---------- Startup ----------

async function start() {
  console.log(`Storage backend: ${useUpstash ? 'Upstash Redis (persistent)' : 'local JSON file (data/db.json)'}`);
  try {
    await ensureSeedTemplate();
  } catch (err) {
    // Don't let a slow/flaky database connection at boot crash the whole app and
    // trigger a restart loop - log it and start anyway. Individual requests will
    // retry the connection themselves (see asyncRoute's error handling below).
    console.error('Could not seed default template at startup (will retry on first request):', err.message);
  }
  app.listen(PORT, () => {
    console.log(`FormForge running at http://localhost:${PORT}`);
  });
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
