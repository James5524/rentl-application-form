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

  // Free hosting puts the app to sleep after inactivity - the first visitor after
  // that has to wait ~30-60s while it wakes up. Explain that instead of leaving
  // people staring at a bare "Loading..." wondering if the link is broken.
  const slowNotice = setTimeout(() => {
    card.innerHTML = `
      <p>Loading form&hellip;</p>
      <p style="color:var(--muted); font-size:14px;">This is taking longer than usual - if this link hasn't been used in a while, the form can take up to a minute to wake up. It'll load automatically, no need to refresh.</p>
    `;
  }, 4000);

  try {
    const res = await fetch(`/api/forms/${formId}/public`);
    clearTimeout(slowNotice);
    if (!res.ok) {
      card.innerHTML = '<p>This form does not exist or was removed.</p>';
      return;
    }
    const form = await res.json();
    renderForm(form, card);
  } catch (err) {
    clearTimeout(slowNotice);
    card.innerHTML = `
      <p>Couldn't load this form.</p>
      <p style="color:var(--muted); font-size:14px;">Please check your internet connection and reload the page. If this keeps happening, contact whoever sent you this link.</p>
    `;
  }
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

  fieldsToBlocks(form.fields, id => id).forEach(b => formEl.appendChild(b));

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

// Builds the DOM for a whole list of fields (top-level, or one repeater item's own
// itemFields) -- a heading block, a repeating group, or a normal question. `nameForId`
// turns a field's own id into its real submission-key name (identity at top level;
// `${repeaterId}__${n}__${fieldId}` inside a repeater item -- see buildRepeaterBlock).
//
// Also where an `address` field (23 Aug 2026, real address lookup -- see buildInput's
// own 'address' case) finds its own postcode field to auto-fill: whichever field
// immediately follows it with "postcode" in its own label, matched by label text since
// FormForge's field ids are random-generated, not a fixed naming convention like
// Keystone's own equivalent widget can rely on.
function fieldsToBlocks(fields, nameForId) {
  const blocks = [];
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i];
    if (field.type === 'heading') { blocks.push(buildHeadingBlock(field)); continue; }
    if (field.type === 'repeater') { blocks.push(buildRepeaterBlock(field)); continue; }
    let postcodeName = null;
    if (field.type === 'address') {
      const next = fields[i + 1];
      if (next && next.type !== 'heading' && next.type !== 'repeater' && /postcode/i.test(next.label || '')) postcodeName = nameForId(next.id);
    }
    blocks.push(buildQuestionBlock(field, nameForId(field.id), postcodeName));
  }
  return blocks;
}

function buildHeadingBlock(field) {
  const wrap = document.createElement('div');
  wrap.className = 'preview-field section-block';
  const h = document.createElement('h3');
  h.className = 'section-title';
  h.textContent = field.label;
  wrap.appendChild(h);
  if (field.body) {
    const p = document.createElement('p');
    p.className = 'section-body';
    p.textContent = field.body;
    wrap.appendChild(p);
  }
  return wrap;
}

// A normal question: label + input, where `name` is the field's submission key
// (a plain field id at the top level, or a compound "repeaterId__n__fieldId" inside a group).
// `postcodeName` (only ever set for an `address` field, see fieldsToBlocks above) is the
// sibling postcode field's own name, so buildInput's 'address' case can fill it too.
function buildQuestionBlock(field, name, postcodeName) {
  const wrap = document.createElement('div');
  wrap.className = 'preview-field';
  const label = document.createElement('label');
  label.className = 'field-label';
  label.innerHTML = `${escapeHtml(field.label)} ${field.required ? '<span class="req-star">*</span>' : ''}`;
  wrap.appendChild(label);
  wrap.appendChild(buildInput(field, name, postcodeName));
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

  // Shared duplicate-address warning (23 Aug 2026, James: allow the same address across
  // several adults on one application -- people genuinely do already live together -- but
  // "there should be a warning to say is this correct, as this may affect your application
  // if the information entered is incorrect"). One banner for the whole repeater rather than
  // per-field, since the thing being flagged is a relationship BETWEEN fields, not any one
  // field's own value.
  const dupWarning = document.createElement('div');
  dupWarning.className = 'address-dup-warning hidden';
  dupWarning.textContent = 'More than one applicant has entered the same address — is this correct? This may affect your application if the information entered is incorrect.';
  wrap.appendChild(dupWarning);

  const checkDuplicateAddresses = () => {
    const inputs = Array.from(itemsContainer.querySelectorAll('.address-search-input'));
    const seen = new Map();
    let dup = false;
    inputs.forEach(inp => {
      const v = inp.value.trim().toLowerCase();
      if (!v) return;
      if (seen.has(v)) dup = true;
      seen.set(v, true);
    });
    dupWarning.classList.toggle('hidden', !dup);
  };
  itemsContainer.addEventListener('input', e => { if (e.target.classList.contains('address-search-input')) checkDuplicateAddresses(); });
  itemsContainer.addEventListener('address-picked', checkDuplicateAddresses);

  const rebuild = (count) => {
    itemsContainer.innerHTML = '';
    for (let i = 1; i <= count; i++) {
      const block = document.createElement('div');
      block.className = 'repeater-block';
      const blockTitle = document.createElement('div');
      blockTitle.className = 'repeater-block-title';
      blockTitle.textContent = `${field.itemLabel || 'Person'} ${i}`;
      block.appendChild(blockTitle);

      fieldsToBlocks(field.itemFields || [], id => `${field.id}__${i}__${id}`).forEach(b => block.appendChild(b));
      itemsContainer.appendChild(block);
    }
    checkDuplicateAddresses();
  };

  select.addEventListener('change', () => rebuild(parseInt(select.value, 10) || 0));
  rebuild(0);

  return wrap;
}

function buildInput(field, name, postcodeName) {
  const ph = field.placeholder || '';

  switch (field.type) {
    // Real address lookup (23 Aug 2026, James: "so they cannot enter a wrong address") --
    // goes through this app's own /api/address/* proxy (server.js), never calls the real
    // provider from the browser. A pick is required, not just offered: typing without ever
    // choosing a real suggestion leaves the field unconfirmed, and handleSubmit() below
    // blocks the whole form until every required address field has a genuine pick behind
    // it -- see initAddressSearch()'s `dataset.confirmed` flag.
    case 'address': {
      const container = document.createElement('div');
      container.className = 'address-search-wrap';
      const el = document.createElement('input');
      el.type = 'text';
      el.name = name;
      el.placeholder = ph || 'Start typing your address…';
      el.autocomplete = 'off';
      el.className = 'address-search-input';
      if (field.required) el.required = true;
      const results = document.createElement('div');
      results.className = 'address-results hidden';
      container.appendChild(el);
      container.appendChild(results);
      initAddressSearch(el, results, postcodeName);
      return container;
    }
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

// Wires up one address search box: type-ahead against /api/address/autocomplete, pick a
// real suggestion to fill the box (and the sibling postcode field, when postcodeName is
// given) via /api/address/get. `input.dataset.confirmed` is the one thing that matters for
// submission -- only ever set to '1' by an actual pick, cleared the moment the text changes
// afterward, so a half-typed or hand-edited address can never quietly pass as confirmed.
function initAddressSearch(input, results, postcodeName) {
  let timer = null;
  const hide = () => { results.classList.add('hidden'); results.innerHTML = ''; };
  input.addEventListener('input', () => {
    input.dataset.confirmed = '';
    clearTimeout(timer);
    const term = input.value.trim();
    if (term.length < 3) { hide(); return; }
    timer = setTimeout(() => {
      fetch(`/api/address/autocomplete?term=${encodeURIComponent(term)}`)
        .then(r => r.json())
        .then(data => {
          // Lookup not set up on this deployment, OR the upstream call itself failed (rate
          // limit, outage, anything -- see homedata.js's `error` flag, added 26 Aug 2026 after
          // exactly this silently blocked every real applicant) -- either way, fall back to a
          // plain text field rather than trap the applicant behind an impossible-to-satisfy
          // requirement they have no way to know is a backend problem, not theirs.
          if (data && (data.configured === false || data.error)) { input.dataset.lookupUnavailable = '1'; hide(); return; }
          const suggestions = (data && data.suggestions) || [];
          if (!suggestions.length) { hide(); return; }
          results.innerHTML = '';
          suggestions.forEach(s => {
            const opt = document.createElement('div');
            opt.className = 'address-opt';
            opt.textContent = s.address;
            opt.dataset.id = s.id;
            results.appendChild(opt);
          });
          results.classList.remove('hidden');
        })
        // A network-level failure (offline, DNS, CORS, anything that never even reaches the
        // .then above) used to just hide the dropdown and leave the field un-confirmable --
        // same silent-block bug as the server-side one above, fixed the same way.
        .catch(() => { input.dataset.lookupUnavailable = '1'; hide(); });
    }, 250);
  });
  results.addEventListener('mousedown', e => {
    const opt = e.target.closest('.address-opt');
    if (!opt) return;
    fetch(`/api/address/get?id=${encodeURIComponent(opt.dataset.id)}`)
      .then(r => r.json())
      .then(a => {
        input.value = (a && a.full) || opt.textContent;
        input.dataset.confirmed = '1';
        if (postcodeName && a && a.postcode) {
          const pc = document.querySelector(`[name="${postcodeName}"]`);
          if (pc) pc.value = a.postcode;
        }
        hide();
        input.dispatchEvent(new Event('address-picked', { bubbles: true }));
      })
      .catch(() => {});
  });
  document.addEventListener('click', e => { if (e.target !== input) hide(); });
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

  // Any address field with text in it must carry a real, confirmed pick behind that text --
  // not just typed characters that happen to look like an address (James: "so they cannot
  // enter a wrong address"). Applies whether the field is required or not -- an optional
  // address field left BLANK is fine either way, but one with something typed and never
  // actually chosen from the real suggestions is exactly the case this exists to catch.
  const unconfirmed = Array.from(formEl.querySelectorAll('.address-search-input'))
    .find(inp => inp.value.trim() && inp.dataset.confirmed !== '1' && inp.dataset.lookupUnavailable !== '1');
  if (unconfirmed) {
    errorText.textContent = 'Please choose your address from the suggestions as you type it, for every address field on this form.';
    errorText.classList.remove('hidden');
    unconfirmed.scrollIntoView({ behavior: 'smooth', block: 'center' });
    unconfirmed.focus();
    return;
  }

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
