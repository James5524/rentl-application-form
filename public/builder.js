// FormForge builder — vanilla JS, no framework.

const els = {
  viewList: document.getElementById('view-list'),
  viewBuilder: document.getElementById('view-builder'),
  viewSubmissions: document.getElementById('view-submissions'),
  formsGrid: document.getElementById('forms-grid'),
  emptyState: document.getElementById('empty-state'),
  btnNewForm: document.getElementById('btn-new-form'),
  btnBackList: document.getElementById('btn-back-list'),
  btnSaveForm: document.getElementById('btn-save-form'),
  btnViewSubmissions: document.getElementById('btn-view-submissions'),
  formTitle: document.getElementById('form-title'),
  formDescription: document.getElementById('form-description'),
  fieldsList: document.getElementById('fields-list'),
  formPreview: document.getElementById('form-preview'),
  shareBox: document.getElementById('share-box'),
  shareLink: document.getElementById('share-link'),
  btnCopyLink: document.getElementById('btn-copy-link'),
  btnOpenLink: document.getElementById('btn-open-link'),
  btnBackBuilder: document.getElementById('btn-back-builder'),
  submissionsTitle: document.getElementById('submissions-title'),
  submissionsTableWrap: document.getElementById('submissions-table-wrap'),
  btnExportCsv: document.getElementById('btn-export-csv'),
  toast: document.getElementById('toast')
};

let currentForm = null; // { id, title, description, fields: [...] }
let dragFieldId = null;
let dragArrayRef = null;

const FIELD_TYPE_LABELS = {
  text: 'Text',
  textarea: 'Paragraph',
  email: 'Email',
  number: 'Number',
  date: 'Date',
  select: 'Dropdown',
  radio: 'Multiple choice',
  checkbox: 'Checkboxes'
};

const OPTION_TYPES = ['select', 'radio', 'checkbox'];

function genLocalId() {
  return 'f' + Math.random().toString(36).slice(2, 10);
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  setTimeout(() => els.toast.classList.remove('show'), 2200);
}

function showView(name) {
  els.viewList.classList.toggle('hidden', name !== 'list');
  els.viewBuilder.classList.toggle('hidden', name !== 'builder');
  els.viewSubmissions.classList.toggle('hidden', name !== 'submissions');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---------- Forms list ----------

async function loadFormsList() {
  const res = await fetch('/api/forms');
  const forms = await res.json();
  renderFormsList(forms);
}

function renderFormsList(forms) {
  els.formsGrid.innerHTML = '';
  els.emptyState.classList.toggle('hidden', forms.length > 0);
  forms.forEach(f => {
    const card = document.createElement('div');
    card.className = 'form-card';
    card.innerHTML = `
      <h3>${escapeHtml(f.title)}</h3>
      <p class="meta">${f.fieldCount} field(s) &middot; ${f.submissionCount} response(s)</p>
      <div class="actions">
        <button class="secondary small" data-action="edit">Edit</button>
        <button class="secondary small" data-action="duplicate">Duplicate</button>
        <button class="secondary small" data-action="submissions">Responses</button>
        <button class="secondary small" data-action="share">Share link</button>
        <button class="danger small" data-action="delete">Delete</button>
      </div>
    `;
    card.querySelector('[data-action=edit]').onclick = () => openForm(f.id);
    card.querySelector('[data-action=duplicate]').onclick = () => duplicateForm(f);
    card.querySelector('[data-action=submissions]').onclick = () => openSubmissions(f.id);
    card.querySelector('[data-action=share]').onclick = () => {
      const url = `${location.origin}/f/${f.id}`;
      navigator.clipboard?.writeText(url).catch(() => {});
      showToast('Link copied: ' + url);
    };
    card.querySelector('[data-action=delete]').onclick = async () => {
      if (!confirm(`Delete "${f.title}"? This also deletes its responses.`)) return;
      await fetch(`/api/forms/${f.id}`, { method: 'DELETE' });
      loadFormsList();
    };
    els.formsGrid.appendChild(card);
  });
}

// ---------- Builder ----------

function newForm() {
  currentForm = { id: null, title: '', description: '', fields: [] };
  els.shareBox.classList.add('hidden');
  renderBuilder();
  showView('builder');
}

async function duplicateForm(formSummary) {
  const suggested = `${formSummary.title} (copy)`;
  const title = prompt('Title for the new form (e.g. the property address):', suggested);
  if (title === null) return; // cancelled
  const res = await fetch(`/api/forms/${formSummary.id}/duplicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: title.trim() || suggested })
  });
  if (!res.ok) return showToast('Could not duplicate form');
  const newForm = await res.json();
  showToast('Form duplicated');
  openForm(newForm.id);
}

async function openForm(id) {
  const res = await fetch(`/api/forms/${id}`);
  if (!res.ok) return showToast('Could not load form');
  currentForm = await res.json();
  renderBuilder();
  if (currentForm.id) {
    els.shareBox.classList.remove('hidden');
    els.shareLink.textContent = `${location.origin}/f/${currentForm.id}`;
  }
  showView('builder');
}

function renderBuilder() {
  els.formTitle.value = currentForm.title || '';
  els.formDescription.value = currentForm.description || '';
  renderFieldsList();
  renderPreview();
}

// ---------- Adding fields (top-level or inside a repeater) ----------

function makeBasicField(type) {
  return {
    id: genLocalId(),
    type,
    label: FIELD_TYPE_LABELS[type] + ' question',
    placeholder: '',
    required: false,
    options: OPTION_TYPES.includes(type) ? ['Option 1', 'Option 2'] : undefined
  };
}

function makeHeadingField() {
  return { id: genLocalId(), type: 'heading', label: 'Section heading', body: '' };
}

function makeRepeaterField() {
  return {
    id: genLocalId(),
    type: 'repeater',
    label: 'How many people is this for?',
    required: true,
    min: 1,
    max: 4,
    itemLabel: 'Person',
    itemFields: []
  };
}

function addField(type) {
  currentForm.fields.push(makeBasicField(type));
  renderFieldsList();
  renderPreview();
}

function addHeading() {
  currentForm.fields.push(makeHeadingField());
  renderFieldsList();
  renderPreview();
}

function addRepeater() {
  currentForm.fields.push(makeRepeaterField());
  renderFieldsList();
  renderPreview();
}

function removeFromArray(arr, fieldId) {
  const idx = arr.findIndex(f => f.id === fieldId);
  if (idx !== -1) arr.splice(idx, 1);
}

// ---------- Rendering the field editor list ----------

function renderFieldsList() {
  els.fieldsList.innerHTML = '';
  renderFieldRowsInto(els.fieldsList, currentForm.fields, { top: true });
}

// Renders each field in `arr` into `container`, wiring up edit/remove/drag/reorder.
// `arr` is the actual array reference (currentForm.fields, or a repeater's itemFields)
// so edits mutate the right place. Calling code re-renders after any change.
function renderFieldRowsInto(container, arr, opts) {
  arr.forEach(field => {
    let row;
    if (field.type === 'heading') {
      row = buildHeadingRow(field, arr);
    } else if (field.type === 'repeater') {
      row = buildRepeaterRow(field, arr);
    } else {
      row = buildBasicFieldRow(field, arr);
    }
    attachDragHandlers(row, field, arr);
    container.appendChild(row);
  });
}

function attachDragHandlers(row, field, arr) {
  row.draggable = true;
  row.addEventListener('dragstart', (e) => {
    dragFieldId = field.id;
    dragArrayRef = arr;
    row.classList.add('dragging');
    e.stopPropagation();
  });
  row.addEventListener('dragend', () => row.classList.remove('dragging'));
  row.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  row.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!dragFieldId || dragArrayRef !== arr || dragFieldId === field.id) return;
    const fromIdx = arr.findIndex(f => f.id === dragFieldId);
    const toIdx = arr.findIndex(f => f.id === field.id);
    if (fromIdx === -1 || toIdx === -1) return;
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    renderFieldsList();
    renderPreview();
  });
}

function buildBasicFieldRow(field, arr) {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.dataset.id = field.id;
  const needsOptions = OPTION_TYPES.includes(field.type);

  row.innerHTML = `
    <div class="drag-handle">&#8942;&#8942;</div>
    <div class="field-body">
      <div class="row2">
        <input type="text" class="label-input" value="${escapeHtml(field.label)}" placeholder="Question label">
        <select class="type-select">
          ${Object.entries(FIELD_TYPE_LABELS).map(([val, label]) =>
            `<option value="${val}" ${val === field.type ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      ${needsOptions ? `<textarea class="options-input" placeholder="One option per line">${escapeHtml((field.options || []).join('\n'))}</textarea>` : ''}
      <div class="row2" style="align-items:center;">
        <input type="text" class="placeholder-input" value="${escapeHtml(field.placeholder || '')}" placeholder="Placeholder / hint text (optional)">
        <label class="req-toggle"><input type="checkbox" class="required-input" ${field.required ? 'checked' : ''}> Required</label>
        <button class="remove-field" title="Remove field">Remove</button>
      </div>
    </div>
  `;

  row.querySelector('.label-input').oninput = (e) => { field.label = e.target.value; renderPreview(); };
  row.querySelector('.placeholder-input').oninput = (e) => { field.placeholder = e.target.value; renderPreview(); };
  row.querySelector('.required-input').onchange = (e) => { field.required = e.target.checked; renderPreview(); };
  row.querySelector('.type-select').onchange = (e) => {
    field.type = e.target.value;
    if (OPTION_TYPES.includes(field.type) && !field.options) field.options = ['Option 1', 'Option 2'];
    renderFieldsList();
    renderPreview();
  };
  row.querySelector('.remove-field').onclick = () => { removeFromArray(arr, field.id); renderFieldsList(); renderPreview(); };
  const optionsInput = row.querySelector('.options-input');
  if (optionsInput) {
    optionsInput.oninput = (e) => {
      field.options = e.target.value.split('\n').map(s => s.trim()).filter(Boolean);
      renderPreview();
    };
  }

  return row;
}

function buildHeadingRow(field, arr) {
  const row = document.createElement('div');
  row.className = 'field-row';
  row.dataset.id = field.id;

  row.innerHTML = `
    <div class="drag-handle">&#8942;&#8942;</div>
    <div class="field-body">
      <div class="row2">
        <input type="text" class="heading-label-input" value="${escapeHtml(field.label)}" placeholder="Section heading text">
        <button class="remove-field" title="Remove heading">Remove</button>
      </div>
      <textarea class="heading-body-input" placeholder="Optional description or instructions shown under the heading">${escapeHtml(field.body || '')}</textarea>
    </div>
  `;

  row.querySelector('.heading-label-input').oninput = (e) => { field.label = e.target.value; renderPreview(); };
  row.querySelector('.heading-body-input').oninput = (e) => { field.body = e.target.value; renderPreview(); };
  row.querySelector('.remove-field').onclick = () => { removeFromArray(arr, field.id); renderFieldsList(); renderPreview(); };

  return row;
}

function buildRepeaterRow(field, arr) {
  const row = document.createElement('div');
  row.className = 'field-row repeater-card';
  row.dataset.id = field.id;

  row.innerHTML = `
    <div class="drag-handle">&#8942;&#8942;</div>
    <div class="field-body">
      <div class="repeater-tag">Repeating group</div>
      <div class="row2">
        <input type="text" class="rep-label-input" value="${escapeHtml(field.label)}" placeholder="Count question, e.g. How many adults is this for?">
        <button class="remove-field" title="Remove group">Remove</button>
      </div>
      <div class="row2" style="align-items:center;">
        <label class="field-label" style="margin:0;">Label each block
          <input type="text" class="rep-itemlabel-input" value="${escapeHtml(field.itemLabel || 'Person')}" placeholder="e.g. Adult">
        </label>
        <label class="field-label" style="margin:0;">Min
          <input type="number" class="rep-min-input" min="0" value="${field.min ?? 1}">
        </label>
        <label class="field-label" style="margin:0;">Max
          <input type="number" class="rep-max-input" min="1" value="${field.max ?? 4}">
        </label>
        <label class="req-toggle"><input type="checkbox" class="rep-required-input" ${field.required ? 'checked' : ''}> Required</label>
      </div>
      <div class="repeater-items"></div>
      <div class="add-field-row">
        <button class="secondary small" data-rep-add="text">+ Text</button>
        <button class="secondary small" data-rep-add="textarea">+ Paragraph</button>
        <button class="secondary small" data-rep-add="email">+ Email</button>
        <button class="secondary small" data-rep-add="number">+ Number</button>
        <button class="secondary small" data-rep-add="date">+ Date</button>
        <button class="secondary small" data-rep-add="select">+ Dropdown</button>
        <button class="secondary small" data-rep-add="radio">+ Multiple choice</button>
        <button class="secondary small" data-rep-add="checkbox">+ Checkboxes</button>
        <button class="secondary small" data-rep-add="heading">+ Heading</button>
      </div>
    </div>
  `;

  row.querySelector('.rep-label-input').oninput = (e) => { field.label = e.target.value; renderPreview(); };
  row.querySelector('.rep-itemlabel-input').oninput = (e) => { field.itemLabel = e.target.value || 'Person'; renderPreview(); };
  row.querySelector('.rep-min-input').oninput = (e) => { field.min = Math.max(0, parseInt(e.target.value, 10) || 0); renderPreview(); };
  row.querySelector('.rep-max-input').oninput = (e) => { field.max = Math.max(1, parseInt(e.target.value, 10) || 1); renderPreview(); };
  row.querySelector('.rep-required-input').onchange = (e) => { field.required = e.target.checked; renderPreview(); };
  row.querySelector('.remove-field').onclick = () => { removeFromArray(arr, field.id); renderFieldsList(); renderPreview(); };

  const itemsContainer = row.querySelector('.repeater-items');
  renderFieldRowsInto(itemsContainer, field.itemFields, { top: false });

  row.querySelectorAll('[data-rep-add]').forEach(btn => {
    btn.onclick = () => {
      const type = btn.dataset.repAdd;
      field.itemFields.push(type === 'heading' ? makeHeadingField() : makeBasicField(type));
      renderFieldsList();
      renderPreview();
    };
  });

  return row;
}

// ---------- Live preview ----------

function renderPreview() {
  els.formPreview.innerHTML = '';
  const title = document.createElement('h2');
  title.textContent = currentForm.title || 'Untitled form';
  title.style.marginTop = '0';
  els.formPreview.appendChild(title);

  if (currentForm.description) {
    const desc = document.createElement('p');
    desc.style.color = 'var(--muted)';
    desc.textContent = currentForm.description;
    els.formPreview.appendChild(desc);
  }

  currentForm.fields.forEach(field => {
    els.formPreview.appendChild(renderPreviewField(field));
  });

  if (currentForm.fields.length === 0) {
    const hint = document.createElement('p');
    hint.className = 'preview-hint';
    hint.textContent = 'Add fields on the left to see them appear here.';
    els.formPreview.appendChild(hint);
  } else {
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Submit';
    submitBtn.disabled = true;
    submitBtn.title = 'This is just a preview';
    els.formPreview.appendChild(submitBtn);
  }
}

function renderPreviewField(field) {
  if (field.type === 'heading') {
    const wrap = document.createElement('div');
    wrap.className = 'preview-field';
    const h = document.createElement('h3');
    h.style.marginBottom = '4px';
    h.textContent = field.label;
    wrap.appendChild(h);
    if (field.body) {
      const p = document.createElement('p');
      p.style.color = 'var(--muted)';
      p.style.marginTop = '0';
      p.textContent = field.body;
      wrap.appendChild(p);
    }
    return wrap;
  }

  if (field.type === 'repeater') {
    const wrap = document.createElement('div');
    wrap.className = 'preview-field';
    const label = document.createElement('label');
    label.className = 'field-label';
    label.innerHTML = `${escapeHtml(field.label)} ${field.required ? '<span class="req-star">*</span>' : ''}`;
    wrap.appendChild(label);
    const countInput = document.createElement('input');
    countInput.type = 'number';
    countInput.disabled = true;
    countInput.placeholder = `${field.min ?? 1}–${field.max ?? 4}`;
    wrap.appendChild(countInput);

    const block = document.createElement('div');
    block.className = 'repeater-preview-block';
    const blockTitle = document.createElement('div');
    blockTitle.className = 'repeater-preview-title';
    blockTitle.textContent = `${field.itemLabel || 'Person'} 1`;
    block.appendChild(blockTitle);
    (field.itemFields || []).forEach(itemField => {
      block.appendChild(renderPreviewField(itemField));
    });
    wrap.appendChild(block);

    const note = document.createElement('p');
    note.className = 'preview-hint';
    note.textContent = `This block repeats once per person, based on the answer above (up to ${field.max ?? 4}).`;
    wrap.appendChild(note);

    return wrap;
  }

  const wrap = document.createElement('div');
  wrap.className = 'preview-field';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.innerHTML = `${escapeHtml(field.label)} ${field.required ? '<span class="req-star">*</span>' : ''}`;
  wrap.appendChild(label);
  wrap.appendChild(renderPreviewInput(field));
  return wrap;
}

function renderPreviewInput(field) {
  const ph = field.placeholder || '';
  switch (field.type) {
    case 'textarea': {
      const el = document.createElement('textarea');
      el.placeholder = ph;
      el.disabled = true;
      return el;
    }
    case 'select': {
      const el = document.createElement('select');
      el.disabled = true;
      (field.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.textContent = opt;
        el.appendChild(o);
      });
      return el;
    }
    case 'radio':
    case 'checkbox': {
      const wrap = document.createElement('div');
      (field.options || []).forEach(opt => {
        const line = document.createElement('label');
        line.style.display = 'flex';
        line.style.alignItems = 'center';
        line.style.gap = '6px';
        line.style.marginBottom = '4px';
        line.style.fontWeight = 'normal';
        const input = document.createElement('input');
        input.type = field.type === 'radio' ? 'radio' : 'checkbox';
        input.disabled = true;
        line.appendChild(input);
        line.appendChild(document.createTextNode(opt));
        wrap.appendChild(line);
      });
      return wrap;
    }
    default: {
      const el = document.createElement('input');
      el.type = field.type === 'number' ? 'number' : (field.type === 'date' ? 'date' : (field.type === 'email' ? 'email' : 'text'));
      el.placeholder = ph;
      el.disabled = true;
      return el;
    }
  }
}

// ---------- Save ----------

async function saveForm() {
  currentForm.title = els.formTitle.value.trim() || 'Untitled form';
  currentForm.description = els.formDescription.value.trim();

  const payload = {
    title: currentForm.title,
    description: currentForm.description,
    fields: currentForm.fields
  };

  let res;
  if (currentForm.id) {
    res = await fetch(`/api/forms/${currentForm.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } else {
    res = await fetch('/api/forms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    showToast(err.error || 'Failed to save form');
    return;
  }

  currentForm = await res.json();
  els.shareBox.classList.remove('hidden');
  els.shareLink.textContent = `${location.origin}/f/${currentForm.id}`;
  showToast('Form saved');
}

// ---------- Submissions ----------

// Mirrors the flattening logic in server.js so the responses table matches the CSV export.
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

async function openSubmissions(formId) {
  const res = await fetch(`/api/forms/${formId}/submissions`);
  if (!res.ok) return showToast('Could not load submissions');
  const { form, submissions } = await res.json();
  currentForm = form;
  els.submissionsTitle.textContent = `Responses — ${form.title}`;
  els.btnExportCsv.href = `/api/forms/${form.id}/submissions/export`;
  renderSubmissionsTable(form, submissions);
  showView('submissions');
}

function renderSubmissionsTable(form, submissions) {
  if (submissions.length === 0) {
    els.submissionsTableWrap.innerHTML = '<p style="color:var(--muted);">No responses yet. Share the form link to start collecting responses.</p>';
    return;
  }
  const columns = getColumns(form.fields);
  const table = document.createElement('table');
  table.className = 'submissions';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr><th>Submitted</th>${columns.map(c => `<th>${escapeHtml(c.label)}</th>`).join('')}<th></th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  submissions.forEach(s => {
    const rowValues = getRowValues(form.fields, s.data);
    const tr = document.createElement('tr');
    const date = new Date(s.submittedAt).toLocaleString();
    tr.innerHTML = `<td>${date}</td>${columns.map(c => `<td>${escapeHtml(rowValues[c.key])}</td>`).join('')}<td><button class="secondary small" data-del="${s.id}">Delete</button></td>`;
    tbody.appendChild(tr);
    tr.querySelector('[data-del]').onclick = async () => {
      await fetch(`/api/forms/${form.id}/submissions/${s.id}`, { method: 'DELETE' });
      openSubmissions(form.id);
    };
  });
  table.appendChild(tbody);
  els.submissionsTableWrap.innerHTML = '';
  els.submissionsTableWrap.appendChild(table);
}

// ---------- Event wiring ----------

els.btnNewForm.onclick = newForm;
els.btnBackList.onclick = () => { loadFormsList(); showView('list'); };
els.btnSaveForm.onclick = saveForm;
els.btnViewSubmissions.onclick = () => {
  if (!currentForm.id) { showToast('Save the form first'); return; }
  openSubmissions(currentForm.id);
};
els.btnBackBuilder.onclick = () => { openForm(currentForm.id); };
els.btnCopyLink.onclick = () => {
  navigator.clipboard?.writeText(els.shareLink.textContent).catch(() => {});
  showToast('Link copied');
};
els.btnOpenLink.onclick = () => window.open(els.shareLink.textContent, '_blank');

document.querySelectorAll('[data-add]').forEach(btn => {
  btn.onclick = () => addField(btn.dataset.add);
});
document.getElementById('btn-add-heading').onclick = addHeading;
document.getElementById('btn-add-repeater').onclick = addRepeater;

els.formTitle.oninput = () => { currentForm.title = els.formTitle.value; renderPreview(); };
els.formDescription.oninput = () => { currentForm.description = els.formDescription.value; renderPreview(); };

// ---------- Init ----------
loadFormsList();
