// Public form renderer + submitter.

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function getFormId() {
  const parts = location.pathname.split('/').filter(Boolean); // ['f', ':id']
  return parts[1];
}

async function init() {
  const card = document.getElementById('form-card');
  const formId = getFormId();

  const res = await fetch(`/api/forms/${formId}/public`);
  if (!res.ok) {
    card.innerHTML = '<p>This form does not exist or was removed.</p>';
    return;
  }
  const form = await res.json();
  renderForm(form, card);
}

function renderForm(form, card) {
  card.innerHTML = '';

  const title = document.createElement('h1');
  title.style.fontSize = '22px';
  title.textContent = form.title;
  card.appendChild(title);

  if (form.description) {
    const desc = document.createElement('p');
    desc.style.color = 'var(--muted)';
    desc.textContent = form.description;
    card.appendChild(desc);
  }

  const formEl = document.createElement('form');
  formEl.id = 'public-form';

  form.fields.forEach(field => {
    formEl.appendChild(buildFieldBlock(field));
  });

  const errorText = document.createElement('div');
  errorText.className = 'error-text hidden';
  errorText.id = 'error-text';
  formEl.appendChild(errorText);

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Submit';
  formEl.appendChild(submitBtn);

  formEl.addEventListener('submit', (e) => handleSubmit(e, form));

  card.appendChild(formEl);
}

// Builds the DOM for one top-level field: a heading block, a repeating group,
// or a normal question.
function buildFieldBlock(field) {
  if (field.type === 'heading') return buildHeadingBlock(field);
  if (field.type === 'repeater') return buildRepeaterBlock(field);
  return buildQuestionBlock(field, field.id);
}

function buildHeadingBlock(field) {
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

// A normal question: label + input, where `name` is the field's submission key
// (a plain field id at the top level, or a compound "repeaterId__n__fieldId" inside a group).
function buildQuestionBlock(field, name) {
  const wrap = document.createElement('div');
  wrap.className = 'preview-field';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.innerHTML = `${escapeHtml(field.label)} ${field.required ? '<span class="req-star">*</span>' : ''}`;
  wrap.appendChild(label);
  wrap.appendChild(buildInput(field, name));
  return wrap;
}

function buildRepeaterBlock(field) {
  const wrap = document.createElement('div');
  wrap.className = 'preview-field';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.innerHTML = `${escapeHtml(field.label)} ${field.required ? '<span class="req-star">*</span>' : ''}`;
  wrap.appendChild(label);

  const countName = `${field.id}__count`;
  const select = document.createElement('select');
  select.name = countName;
  if (field.required) select.required = true;
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = '-- Select --';
  select.appendChild(blank);

  const max = field.max || 4;
  const lowerBound = field.min != null ? field.min : (field.required ? 1 : 0);
  for (let n = lowerBound; n <= max; n++) {
    const o = document.createElement('option');
    o.value = String(n);
    o.textContent = String(n);
    select.appendChild(o);
  }
  wrap.appendChild(select);

  const itemsContainer = document.createElement('div');
  wrap.appendChild(itemsContainer);

  const rebuild = (count) => {
    itemsContainer.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const block = document.createElement('div');
      block.className = 'repeater-block';
      const blockTitle = document.createElement('div');
      blockTitle.className = 'repeater-block-title';
      blockTitle.textContent = `${field.itemLabel || 'Person'} ${i}`;
      block.appendChild(blockTitle);

      (field.itemFields || []).forEach(itemField => {
        if (itemField.type === 'heading') {
          block.appendChild(buildHeadingBlock(itemField));
        } else {
          block.appendChild(buildQuestionBlock(itemField, `${field.id}__${i}__${itemField.id}`));
        }
      });
      itemsContainer.appendChild(block);
    }
  };

  select.addEventListener('change', () => rebuild(parseInt(select.value, 10) || 0));
  rebuild(0);

  return wrap;
}

function buildInput(field, name) {
  const ph = field.placeholder || '';

  switch (field.type) {
    case 'textarea': {
      const el = document.createElement('textarea');
      el.name = name;
      el.placeholder = ph;
      if (field.required) el.required = true;
      return el;
    }
    case 'select': {
      const el = document.createElement('select');
      el.name = name;
      if (field.required) el.required = true;
      const blank = document.createElement('option');
      blank.value = '';
      blank.textContent = '-- Select --';
      el.appendChild(blank);
      (field.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        el.appendChild(o);
      });
      return el;
    }
    case 'radio': {
      const wrap = document.createElement('div');
      (field.options || []).forEach((opt, i) => {
        const line = document.createElement('label');
        line.className = 'radio-check-option';
        const input = document.createElement('input');
        input.type = 'radio';
        input.name = name;
        input.value = opt;
        if (field.required && i === 0) input.required = true;
        line.appendChild(input);
        line.appendChild(document.createTextNode(opt));
        wrap.appendChild(line);
      });
      return wrap;
    }
    case 'checkbox': {
      const wrap = document.createElement('div');
      (field.options || []).forEach(opt => {
        const line = document.createElement('label');
        line.className = 'radio-check-option';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = name;
        input.value = opt;
        line.appendChild(input);
        line.appendChild(document.createTextNode(opt));
        wrap.appendChild(line);
      });
      return wrap;
    }
    default: {
      const el = document.createElement('input');
      el.type = field.type === 'number' ? 'number' : (field.type === 'date' ? 'date' : (field.type === 'email' ? 'email' : 'text'));
      el.name = name;
      el.placeholder = ph;
      if (field.required) el.required = true;
      return el;
    }
  }
}

function getFieldValue(formEl, name, type) {
  if (type === 'checkbox') {
    const checked = formEl.querySelectorAll(`input[name="${name}"]:checked`);
    return Array.from(checked).map(c => c.value).join(', ');
  }
  if (type === 'radio') {
    const checked = formEl.querySelector(`input[name="${name}"]:checked`);
    return checked ? checked.value : '';
  }
  const input = formEl.querySelector(`[name="${name}"]`);
  return input ? input.value : '';
}

function collectData(form, formEl) {
  const data = {};
  form.fields.forEach(field => {
    if (field.type === 'heading') return;
    if (field.type === 'repeater') {
      const countInput = formEl.querySelector(`[name="${field.id}__count"]`);
      const count = parseInt(countInput?.value || '0', 10) || 0;
      const arr = [];
      for (let i = 1; i <= count; i++) {
        const item = {};
        (field.itemFields || []).forEach(itemField => {
          if (itemField.type === 'heading') return;
          item[itemField.id] = getFieldValue(formEl, `${field.id}__${i}__${itemField.id}`, itemField.type);
        });
        arr.push(item);
      }
      data[field.id] = arr;
    } else {
      data[field.id] = getFieldValue(formEl, field.id, field.type);
    }
  });
  return data;
}

async function handleSubmit(e, form) {
  e.preventDefault();
  const formEl = e.target;
  const errorText = document.getElementById('error-text');
  errorText.classList.add('hidden');

  const data = collectData(form, formEl);

  const res = await fetch(`/api/forms/${form.id}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data })
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    errorText.textContent = err.error || 'Something went wrong. Please check the form and try again.';
    errorText.classList.remove('hidden');
    return;
  }

  const card = document.getElementById('form-card');
  card.innerHTML = `
    <div class="thankyou">
      <h2>Thank you!</h2>
      <p style="color:var(--muted);">Your response has been recorded.</p>
    </div>
  `;
}

init();
