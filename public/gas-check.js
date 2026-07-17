// Landlord Gas Safety Record (CP12) contractor form.
// A fixed, purpose-built form (not built through the generic form builder) -
// on submit, the server turns this into a PDF matching the CP12 layout and
// emails it straight to the landlord. Nothing is stored in the dashboard.

const YES_NO = ['Yes', 'No'];
const YES_NO_NA = ['Yes', 'No', 'N/A'];
const PASS_FAIL_NA = ['Pass', 'Fail', 'N/A'];
const FLUE_TYPES = ['OF (Open Flue)', 'RS (Room Sealed)', 'FL (Flueless)'];

// One entry per question inside an appliance block: [id, label, kind, options?]
const APPLIANCE_FIELDS = [
  ['location', 'Location of appliance', 'text'],
  ['type', 'Appliance type', 'text'],
  ['make', 'Appliance make', 'text'],
  ['model', 'Appliance model', 'text'],
  ['flueType', 'Type of flue/outlet', 'select', FLUE_TYPES],
  ['pressure', 'Working pressure (mbar)', 'suffix', null, 'mbar'],
  ['safetyDevices', 'Are safety devices working?', 'select', YES_NO_NA],
  ['spillage', 'Spillage test', 'select', PASS_FAIL_NA],
  ['smokePellet', 'Smoke pellet (flue flow) test', 'select', PASS_FAIL_NA],
  ['termination', 'Adequate termination?', 'select', YES_NO_NA],
  ['visualCondition', 'Visual condition', 'select', PASS_FAIL_NA],
  ['inspected', 'Has this appliance been inspected?', 'select', YES_NO],
  ['landlordOwned', 'Is this appliance owned by the landlord?', 'select', YES_NO],
  ['ventilation', 'Is there adequate ventilation?', 'select', YES_NO],
  ['serviced', 'Has the appliance been serviced?', 'select', YES_NO],
  ['coco2Ratio', 'CO:CO2 ratio', 'text'],
  ['co2Percent', 'CO2 %', 'suffix', null, '%'],
  ['coPpm', 'CO ppm', 'suffix', null, 'ppm'],
  ['safeToUse', 'Is this appliance safe to use?', 'select', YES_NO],
  ['coAlarms', 'CO & smoke alarms present and tested working?', 'select', YES_NO],
  ['defects', 'Defect(s) detected (leave blank if none)', 'textarea'],
  ['remedialWork', 'Remedial work undertaken (leave blank if none)', 'textarea']
];

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  Object.entries(props).forEach(([k, v]) => {
    if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  children.forEach(c => node.appendChild(c));
  return node;
}

function fieldWrap(labelText, required, inputEl) {
  const wrap = el('div', { class: 'field' });
  const label = el('label');
  label.textContent = labelText + (required ? ' ' : '');
  if (required) {
    const star = el('span', { class: 'req-star', text: '*' });
    label.appendChild(star);
  }
  wrap.appendChild(label);
  wrap.appendChild(inputEl);
  return wrap;
}

function makeSelect(name, options, required) {
  const sel = el('select', { name });
  if (required) sel.required = true;
  sel.appendChild(el('option', { value: '' }, [document.createTextNode('-- Select --')]));
  options.forEach(o => {
    const opt = el('option', { value: o });
    opt.textContent = o;
    sel.appendChild(opt);
  });
  return sel;
}

function buildApplianceBlock(index) {
  const block = el('div', { class: 'appliance-block' });
  block.appendChild(el('div', { class: 'appliance-title', text: `Appliance ${index}` }));

  APPLIANCE_FIELDS.forEach(([id, label, kind, options, affix]) => {
    const name = `appliance_${index}_${id}`;
    let input;
    if (kind === 'select') {
      input = makeSelect(name, options, true);
      block.appendChild(fieldWrap(label, true, input));
    } else if (kind === 'textarea') {
      input = el('textarea', { name, rows: '2' });
      block.appendChild(fieldWrap(label, false, input));
    } else if (kind === 'suffix') {
      const group = el('div', { class: 'input-group' });
      input = el('input', { type: 'text', name, required: 'required', class: 'has-suffix' });
      group.appendChild(input);
      group.appendChild(el('span', { class: 'input-group-suffix', text: affix }));
      block.appendChild(fieldWrap(label, true, group));
    } else {
      input = el('input', { type: 'text', name });
      block.appendChild(fieldWrap(label, true, input));
    }
  });

  return block;
}

function buildForm() {
  const card = document.getElementById('form-card');
  card.innerHTML = '';

  const title = el('h1', { style: 'font-size:22px;margin:0 0 4px;', text: 'Landlord Gas Safety Record' });
  card.appendChild(title);
  card.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;margin:0 0 8px;', text: 'Please complete every section based on today\'s inspection. This will be emailed straight to RENTL once submitted.' }));

  const form = el('form', { id: 'gas-form' });

  // ---- Property details ----
  const propSection = el('div', { class: 'section-block' });
  propSection.appendChild(el('div', { class: 'section-title', text: 'Property details' }));

  propSection.appendChild(fieldWrap('Address line 1', true, el('input', { type: 'text', name: 'addressLine1', required: 'required' })));
  propSection.appendChild(fieldWrap('Town / City', true, el('input', { type: 'text', name: 'addressLine2', required: 'required' })));
  propSection.appendChild(fieldWrap('Postcode', true, el('input', { type: 'text', name: 'addressPostcode', required: 'required' })));

  const landlordGroup = el('div', { class: 'input-group' });
  const landlordInput = el('input', { type: 'text', name: 'landlordNamePrefix', required: 'required', class: 'has-suffix' });
  landlordGroup.appendChild(landlordInput);
  landlordGroup.appendChild(el('span', { class: 'input-group-suffix', text: 'C/O RENTL BY JGLA LTD' }));
  propSection.appendChild(fieldWrap('Landlord name', true, landlordGroup));

  propSection.appendChild(fieldWrap('Is the accommodation rented?', true, makeSelect('accommodationRented', YES_NO, true)));
  form.appendChild(propSection);

  // ---- Pipework checks ----
  const pipeSection = el('div', { class: 'section-block' });
  pipeSection.appendChild(el('div', { class: 'section-title', text: 'Gas installation pipework' }));
  pipeSection.appendChild(fieldWrap('Is equipotential bonding satisfactory?', true, makeSelect('equipotentialBonding', YES_NO_NA, true)));
  pipeSection.appendChild(fieldWrap('Visual inspection of pipework satisfactory?', true, makeSelect('pipeworkVisual', YES_NO_NA, true)));
  pipeSection.appendChild(fieldWrap('Emergency control valve accessible?', true, makeSelect('ecvAccessible', YES_NO_NA, true)));
  pipeSection.appendChild(fieldWrap('Gas tightness test satisfactory?', true, makeSelect('gasTightnessTest', YES_NO_NA, true)));
  form.appendChild(pipeSection);

  // ---- Appliances ----
  const applSection = el('div', { class: 'section-block' });
  applSection.appendChild(el('div', { class: 'section-title', text: 'Appliances' }));
  const countSelect = makeSelect('applianceCount', ['1', '2', '3', '4'], true);
  applSection.appendChild(fieldWrap('How many appliances are being tested?', true, countSelect));
  const applianceContainer = el('div', { id: 'appliance-container' });
  applSection.appendChild(applianceContainer);
  countSelect.addEventListener('change', () => {
    applianceContainer.innerHTML = '';
    const n = parseInt(countSelect.value, 10) || 0;
    for (let i = 1; i <= n; i++) applianceContainer.appendChild(buildApplianceBlock(i));
  });
  form.appendChild(applSection);

  // ---- Engineer / company details ----
  const engSection = el('div', { class: 'section-block' });
  engSection.appendChild(el('div', { class: 'section-title', text: 'Engineer & company details' }));
  engSection.appendChild(fieldWrap('Engineer name', true, el('input', { type: 'text', name: 'engineerName', required: 'required' })));
  engSection.appendChild(fieldWrap('Engineer email', true, el('input', { type: 'email', name: 'engineerEmail', required: 'required' })));
  engSection.appendChild(fieldWrap('Gas Safe ID card number', true, el('input', { type: 'text', name: 'gasSafeId', required: 'required' })));
  engSection.appendChild(fieldWrap('Company name', true, el('input', { type: 'text', name: 'companyName', required: 'required' })));
  engSection.appendChild(fieldWrap('Company address', true, el('input', { type: 'text', name: 'companyAddress', required: 'required' })));
  engSection.appendChild(fieldWrap('Company phone number', true, el('input', { type: 'text', name: 'companyPhone', required: 'required' })));
  form.appendChild(engSection);

  // ---- Sign-off ----
  const signSection = el('div', { class: 'section-block' });
  signSection.appendChild(el('div', { class: 'section-title', text: 'Sign-off' }));
  const today = new Date().toISOString().slice(0, 10);
  const dateInput = el('input', { type: 'date', name: 'inspectionDate', value: today, required: 'required' });
  signSection.appendChild(fieldWrap('Date of inspection', true, dateInput));

  // Defaults to 12 months after the inspection date, but the engineer can
  // change it - e.g. if the landlord wants an earlier re-check.
  const nextDueInput = el('input', { type: 'date', name: 'nextInspectionDate', required: 'required' });
  const setDefaultNextDue = () => {
    const base = dateInput.value ? new Date(dateInput.value) : new Date();
    base.setMonth(base.getMonth() + 12);
    nextDueInput.value = base.toISOString().slice(0, 10);
  };
  setDefaultNextDue();
  dateInput.addEventListener('change', setDefaultNextDue);
  signSection.appendChild(fieldWrap('Next inspection due', true, nextDueInput));

  
  const sigWrap = el('div', { class: 'field' });
  sigWrap.appendChild(el('label', { text: 'Signature ' }, [el('span', { class: 'req-star', text: '*' })]));
  const canvas = el('canvas', { id: 'sig-canvas', width: '640', height: '160' });
  sigWrap.appendChild(canvas);
  const sigHint = el('div', { class: 'sig-hint', text: 'Draw your signature above using mouse or finger.' });
  sigWrap.appendChild(sigHint);
  const clearBtn = el('button', { type: 'button', class: 'secondary small', style: 'margin-top:8px;' });
  clearBtn.textContent = 'Clear signature';
  sigWrap.appendChild(clearBtn);
  signSection.appendChild(sigWrap);
  form.appendChild(signSection);

  const errorText = el('div', { class: 'error-text hidden', id: 'error-text' });
  form.appendChild(errorText);

  const submitBtn = el('button', { type: 'submit' });
  submitBtn.textContent = 'Submit gas safety record';
  form.appendChild(submitBtn);

  card.appendChild(form);

  // Trigger initial appliance block(s)
  countSelect.value = '1';
  countSelect.dispatchEvent(new Event('change'));

  setupSignaturePad(canvas, clearBtn);
  form.addEventListener('submit', handleSubmit);
}

let sigHasDrawing = false;
let sigCtx = null;

function setupSignaturePad(canvas, clearBtn) {
  sigCtx = canvas.getContext('2d');
  sigCtx.lineWidth = 2;
  sigCtx.lineCap = 'round';
  sigCtx.strokeStyle = '#1f2430';
  sigHasDrawing = false;

  let drawing = false;

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const point = e.touches ? e.touches[0] : e;
    return {
      x: (point.clientX - rect.left) * scaleX,
      y: (point.clientY - rect.top) * scaleY
    };
  };

  const start = (e) => {
    e.preventDefault();
    drawing = true;
    sigHasDrawing = true;
    const p = getPos(e);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
  };
  const end = () => { drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  clearBtn.addEventListener('click', () => {
    sigCtx.clearRect(0, 0, canvas.width, canvas.height);
    sigHasDrawing = false;
  });
}

function collectAppliances(formEl) {
  const count = parseInt(formEl.querySelector('[name=applianceCount]').value, 10) || 0;
  const appliances = [];
  for (let i = 1; i <= count; i++) {
    const item = {};
    APPLIANCE_FIELDS.forEach(([id, , kind, , affix]) => {
      const input = formEl.querySelector(`[name=appliance_${i}_${id}]`);
      let val = input ? input.value : '';
      if (kind === 'suffix' && val.trim()) {
        val = affix === '%' ? `${val.trim()}%` : `${val.trim()} ${affix}`;
      }
      item[id] = val;
    });
    appliances.push(item);
  }
  return appliances;
}

async function handleSubmit(e) {
  e.preventDefault();
  const formEl = e.target;
  const errorText = document.getElementById('error-text');
  errorText.classList.add('hidden');

  if (!sigHasDrawing) {
    errorText.textContent = 'Please draw a signature before submitting.';
    errorText.classList.remove('hidden');
    window.scrollTo({ top: document.getElementById('sig-canvas').offsetTop - 100, behavior: 'smooth' });
    return;
  }

  const canvas = document.getElementById('sig-canvas');
  const signatureDataUrl = canvas.toDataURL('image/png');

  const data = {
    addressLine1: formEl.addressLine1.value,
    addressLine2: formEl.addressLine2.value,
    addressPostcode: formEl.addressPostcode.value,
    landlordName: `${(formEl.landlordNamePrefix.value || '').trim()} C/O RENTL BY JGLA LTD`,
    accommodationRented: formEl.accommodationRented.value,
    equipotentialBonding: formEl.equipotentialBonding.value,
    pipeworkVisual: formEl.pipeworkVisual.value,
    ecvAccessible: formEl.ecvAccessible.value,
    gasTightnessTest: formEl.gasTightnessTest.value,
    appliances: collectAppliances(formEl),
    engineerName: formEl.engineerName.value,
    engineerEmail: formEl.engineerEmail.value,
    gasSafeId: formEl.gasSafeId.value,
    companyName: formEl.companyName.value,
    companyAddress: formEl.companyAddress.value,
    companyPhone: formEl.companyPhone.value,
    inspectionDate: formEl.inspectionDate.value,
    nextInspectionDate: formEl.nextInspectionDate.value,
    printName: formEl.printName.value,
    signature: signatureDataUrl
  };

  const submitBtn = formEl.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/gas-check/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errorText.textContent = err.error || 'Something went wrong. Please check the form and try again.';
      errorText.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit gas safety record';
      return;
    }

    const card = document.getElementById('form-card');
    card.innerHTML = `
      <div class="thankyou">
        <h2>Thank you!</h2>
        <p style="color:var(--muted);">The gas safety record has been generated and emailed to RENTL.</p>
      </div>
    `;
  } catch (err) {
    errorText.textContent = "Couldn't submit - please check your internet connection and try again.";
    errorText.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit gas safety record';
  }
}

buildForm();
