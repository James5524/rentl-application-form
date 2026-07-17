// Maintenance/Service Check List contractor form.
// A fixed, purpose-built form (not built through the generic form builder) -
// on submit, the server turns this into a PDF matching the Service Check
// List layout and emails it to RENTL, CC'ing the engineer. Nothing is stored
// in the dashboard. Mirrors gas-check.js's structure and conventions.

const YES_NO = ['Yes', 'No'];
const YES_NO_NA = ['Yes', 'No', 'N/A'];
const PASS_FAIL_NA = ['Pass', 'Fail', 'N/A'];
const WORK_DESCRIPTIONS = ['Routine Service', 'Call Out'];

// One entry per row in the Appliance Checks grid: [id, label]
const APPLIANCE_CHECK_ITEMS = [
  ['heatExchanger', 'Heat exchanger'],
  ['burnerInjectors', 'Burner / injectors'],
  ['flamePicture', 'Flame picture'],
  ['ignition', 'Ignition'],
  ['electrics', 'Electrics'],
  ['controls', 'Controls'],
  ['leaksGasWater', 'Leaks gas / water'],
  ['gasConnections', 'Gas connections'],
  ['seals', 'Seals'],
  ['pipework', 'Pipework'],
  ['fans', 'Fans'],
  ['fireplace', 'Fireplace'],
  ['closurePlate', 'Closure plate & PRS10 tape'],
  ['allowableLocation', 'Allowable location'],
  ['stability', 'Stability'],
  ['returnAirPlenum', 'Return air / Plenum']
];

// One entry per row in the Safety Checks grid: [id, label]
const SAFETY_CHECK_ITEMS = [
  ['ventilation', 'Ventilation'],
  ['flueTermination', 'Flue Termination'],
  ['smokePelletFlueFlow', 'Smoke pellet flue flow test'],
  ['smokeMatchSpillage', 'Smoke match spillage test'],
  ['safetyDevice', 'Safety device'],
  ['otherRegulations', 'Other (Regulations etc.)']
];

// One entry per row in Findings: [id, label, options]
const FINDINGS_ITEMS = [
  ['safeToUse', 'Is the installation and appliance safe to use?', YES_NO],
  ['warningNoticeRaised', 'If NO, has a warning notice been raised and warning labels/stickers attached?', YES_NO_NA],
  ['carriedOutToStandard', "Has the installation been carried out to the relevant standard/manufacturer's instructions?", YES_NO]
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

// One row of the 2-column check grid: a compact label + a small Yes/No/N/A
// select, side by side. Returns the wrapping element.
function checkRow(name, label, options) {
  const row = el('div', { class: 'check-row' });
  row.appendChild(el('label', { text: label }));
  row.appendChild(makeSelect(name, options, true));
  return row;
}

function buildForm() {
  const card = document.getElementById('form-card');
  card.innerHTML = '';

  const title = el('h1', { style: 'font-size:22px;margin:0 0 4px;', text: 'Maintenance / Service Check List' });
  card.appendChild(title);
  card.appendChild(el('p', { style: 'color:var(--muted);font-size:13px;margin:0 0 8px;', text: 'Please complete every section based on today\'s visit. This will be emailed straight to RENTL once submitted.' }));

  const form = el('form', { id: 'service-form' });

  // ---- Property / inspection details ----
  const propSection = el('div', { class: 'section-block' });
  propSection.appendChild(el('div', { class: 'section-title', text: 'Inspection address' }));

  propSection.appendChild(fieldWrap('Customer / contact name', true, el('input', { type: 'text', name: 'contactName', required: 'required' })));
  propSection.appendChild(fieldWrap('Address line 1', true, el('input', { type: 'text', name: 'addressLine1', required: 'required' })));
  propSection.appendChild(fieldWrap('Address line 2', false, el('input', { type: 'text', name: 'addressLine2' })));
  propSection.appendChild(fieldWrap('Postcode', true, el('input', { type: 'text', name: 'addressPostcode', required: 'required' })));

  const propRow = el('div', { class: 'row2' });
  propRow.appendChild(fieldWrap('Rented accommodation?', true, makeSelect('accommodationRented', YES_NO, true)));
  propRow.appendChild(fieldWrap('Work description', true, makeSelect('workDescription', WORK_DESCRIPTIONS, true)));
  propSection.appendChild(propRow);
  form.appendChild(propSection);

  // ---- Appliance details ----
  const applSection = el('div', { class: 'section-block' });
  applSection.appendChild(el('div', { class: 'section-title', text: 'Appliance details' }));
  const applRow1 = el('div', { class: 'row2' });
  applRow1.appendChild(fieldWrap('Make', true, el('input', { type: 'text', name: 'applianceMake', required: 'required' })));
  applRow1.appendChild(fieldWrap('Type', true, el('input', { type: 'text', name: 'applianceType', required: 'required' })));
  applSection.appendChild(applRow1);
  const applRow2 = el('div', { class: 'row2' });
  applRow2.appendChild(fieldWrap('Model', true, el('input', { type: 'text', name: 'applianceModel', required: 'required' })));
  applRow2.appendChild(fieldWrap('Location', true, el('input', { type: 'text', name: 'applianceLocation', required: 'required' })));
  applSection.appendChild(applRow2);
  form.appendChild(applSection);

  // ---- Combustion readings ----
  const combSection = el('div', { class: 'section-block' });
  combSection.appendChild(el('div', { class: 'section-title', text: 'Combustion readings' }));
  combSection.appendChild(fieldWrap('CO:CO2 ratio', true, el('input', { type: 'text', name: 'coco2Ratio', required: 'required' })));

  const combRow = el('div', { class: 'row2' });
  const co2Group = el('div', { class: 'input-group' });
  const co2Input = el('input', { type: 'text', name: 'co2Percent', required: 'required', class: 'has-suffix' });
  co2Group.appendChild(co2Input);
  co2Group.appendChild(el('span', { class: 'input-group-suffix', text: '%' }));
  combRow.appendChild(fieldWrap('CO2 %', true, co2Group));

  const coGroup = el('div', { class: 'input-group' });
  const coInput = el('input', { type: 'text', name: 'coPpm', required: 'required', class: 'has-suffix' });
  coGroup.appendChild(coInput);
  coGroup.appendChild(el('span', { class: 'input-group-suffix', text: 'ppm' }));
  combRow.appendChild(fieldWrap('CO ppm', true, coGroup));
  combSection.appendChild(combRow);

  const gasRateGroup = el('div', { class: 'input-group' });
  const gasRateInput = el('input', { type: 'text', name: 'gasRateKw', required: 'required', class: 'has-suffix' });
  gasRateGroup.appendChild(gasRateInput);
  gasRateGroup.appendChild(el('span', { class: 'input-group-suffix', text: 'kW' }));
  combSection.appendChild(fieldWrap('Gas rate', true, gasRateGroup));
  form.appendChild(combSection);

  // ---- Appliance checks ----
  const checksSection = el('div', { class: 'section-block' });
  checksSection.appendChild(el('div', { class: 'section-title', text: 'Appliance checks' }));
  const checksGrid = el('div', { class: 'check-grid' });
  APPLIANCE_CHECK_ITEMS.forEach(([id, label]) => {
    checksGrid.appendChild(checkRow(`check_${id}`, label, YES_NO_NA));
  });
  checksSection.appendChild(checksGrid);
  form.appendChild(checksSection);

  // ---- Safety checks ----
  const safetySection = el('div', { class: 'section-block' });
  safetySection.appendChild(el('div', { class: 'section-title', text: 'Safety checks' }));
  const safetyGrid = el('div', { class: 'check-grid' });
  SAFETY_CHECK_ITEMS.forEach(([id, label]) => {
    safetyGrid.appendChild(checkRow(`safety_${id}`, label, YES_NO_NA));
  });
  safetySection.appendChild(safetyGrid);

  const wpGroup = el('div', { class: 'input-group' });
  const wpInput = el('input', { type: 'text', name: 'workingPressure', required: 'required', class: 'has-suffix' });
  wpGroup.appendChild(wpInput);
  wpGroup.appendChild(el('span', { class: 'input-group-suffix', text: 'mbar' }));
  safetySection.appendChild(fieldWrap('Working pressure', true, wpGroup));

  const gasTightRow = el('div', { class: 'row2' });
  gasTightRow.appendChild(fieldWrap('Gas tightness test performed?', true, makeSelect('gasTightnessPerformed', YES_NO, true)));
  gasTightRow.appendChild(fieldWrap('Pass or fail', true, makeSelect('gasTightnessResult', PASS_FAIL_NA, true)));
  safetySection.appendChild(gasTightRow);
  form.appendChild(safetySection);

  // ---- Findings ----
  const findingsSection = el('div', { class: 'section-block' });
  findingsSection.appendChild(el('div', { class: 'section-title', text: 'Findings' }));
  FINDINGS_ITEMS.forEach(([id, label, options]) => {
    findingsSection.appendChild(fieldWrap(label, true, makeSelect(`findings_${id}`, options, true)));
  });
  form.appendChild(findingsSection);

  // ---- Remedial work ----
  const remedialSection = el('div', { class: 'section-block' });
  remedialSection.appendChild(el('div', { class: 'section-title', text: 'Necessary remedial work required' }));
  remedialSection.appendChild(fieldWrap('Leave blank if none', false, el('textarea', { name: 'remedialWorkRequired', rows: '3' })));
  form.appendChild(remedialSection);

  // ---- Engineer & company details ----
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
  signSection.appendChild(fieldWrap('Date of service', true, dateInput));

  // Defaults to 12 months after the service date, but the engineer can
  // change it - e.g. if a shorter service interval applies.
  const nextDueInput = el('input', { type: 'date', name: 'nextServiceDue', required: 'required' });
  const setDefaultNextDue = () => {
    const base = dateInput.value ? new Date(dateInput.value) : new Date();
    base.setMonth(base.getMonth() + 12);
    nextDueInput.value = base.toISOString().slice(0, 10);
  };
  setDefaultNextDue();
  dateInput.addEventListener('change', setDefaultNextDue);
  signSection.appendChild(fieldWrap('Next service due', true, nextDueInput));

  signSection.appendChild(fieldWrap('Customer print name', true, el('input', { type: 'text', name: 'customerPrintName', required: 'required' })));

  const custSigWrap = el('div', { class: 'field' });
  custSigWrap.appendChild(el('label', { text: 'Customer signature ' }, [el('span', { class: 'req-star', text: '*' })]));
  const custCanvas = el('canvas', { id: 'customer-sig-canvas', width: '640', height: '140' });
  custSigWrap.appendChild(custCanvas);
  custSigWrap.appendChild(el('div', { class: 'sig-hint', text: 'Customer draws their signature above using mouse or finger.' }));
  const custClearBtn = el('button', { type: 'button', class: 'secondary small', style: 'margin-top:8px;' });
  custClearBtn.textContent = 'Clear signature';
  custSigWrap.appendChild(custClearBtn);
  signSection.appendChild(custSigWrap);

  const engSigWrap = el('div', { class: 'field' });
  engSigWrap.appendChild(el('label', { text: 'Engineer signature ' }, [el('span', { class: 'req-star', text: '*' })]));
  const engCanvas = el('canvas', { id: 'engineer-sig-canvas', width: '640', height: '140' });
  engSigWrap.appendChild(engCanvas);
  engSigWrap.appendChild(el('div', { class: 'sig-hint', text: 'Engineer draws their signature above using mouse or finger.' }));
  const engClearBtn = el('button', { type: 'button', class: 'secondary small', style: 'margin-top:8px;' });
  engClearBtn.textContent = 'Clear signature';
  engSigWrap.appendChild(engClearBtn);
  signSection.appendChild(engSigWrap);

  form.appendChild(signSection);

  const errorText = el('div', { class: 'error-text hidden', id: 'error-text' });
  form.appendChild(errorText);

  const submitBtn = el('button', { type: 'submit' });
  submitBtn.textContent = 'Submit service record';
  form.appendChild(submitBtn);

  card.appendChild(form);

  const customerSig = setupSignaturePad(custCanvas, custClearBtn);
  const engineerSig = setupSignaturePad(engCanvas, engClearBtn);

  form.addEventListener('submit', (e) => handleSubmit(e, customerSig, engineerSig));
}

// Returns an object exposing hasDrawing() / dataUrl() for this pad. Each pad
// keeps its own closure-scoped state, so the form can have two independent
// signature pads (customer + engineer) without them clobbering each other.
function setupSignaturePad(canvas, clearBtn) {
  const ctx = canvas.getContext('2d');
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#1f2430';
  let hasDrawing = false;
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
    hasDrawing = true;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };
  const move = (e) => {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
  };
  const end = () => { drawing = false; };

  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);
  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);

  clearBtn.addEventListener('click', () => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasDrawing = false;
  });

  return {
    hasDrawing: () => hasDrawing,
    dataUrl: () => canvas.toDataURL('image/png')
  };
}

async function handleSubmit(e, customerSig, engineerSig) {
  e.preventDefault();
  const formEl = e.target;
  const errorText = document.getElementById('error-text');
  errorText.classList.add('hidden');

  if (!customerSig.hasDrawing()) {
    errorText.textContent = 'Please have the customer draw a signature before submitting.';
    errorText.classList.remove('hidden');
    window.scrollTo({ top: document.getElementById('customer-sig-canvas').offsetTop - 100, behavior: 'smooth' });
    return;
  }
  if (!engineerSig.hasDrawing()) {
    errorText.textContent = 'Please draw the engineer signature before submitting.';
    errorText.classList.remove('hidden');
    window.scrollTo({ top: document.getElementById('engineer-sig-canvas').offsetTop - 100, behavior: 'smooth' });
    return;
  }

  const checks = {};
  APPLIANCE_CHECK_ITEMS.forEach(([id]) => {
    checks[id] = formEl.querySelector(`[name=check_${id}]`).value;
  });

  const data = {
    contactName: formEl.contactName.value,
    addressLine1: formEl.addressLine1.value,
    addressLine2: formEl.addressLine2.value,
    addressPostcode: formEl.addressPostcode.value,
    accommodationRented: formEl.accommodationRented.value,
    workDescription: formEl.workDescription.value,

    applianceMake: formEl.applianceMake.value,
    applianceType: formEl.applianceType.value,
    applianceModel: formEl.applianceModel.value,
    applianceLocation: formEl.applianceLocation.value,

    coco2Ratio: formEl.coco2Ratio.value,
    co2Percent: formEl.co2Percent.value.trim() ? `${formEl.co2Percent.value.trim()}%` : '',
    coPpm: formEl.coPpm.value.trim() ? `${formEl.coPpm.value.trim()} ppm` : '',
    gasRateKw: formEl.gasRateKw.value.trim() ? `${formEl.gasRateKw.value.trim()} kW` : '',

    checks,

    ventilation: formEl.safety_ventilation.value,
    flueTermination: formEl.safety_flueTermination.value,
    smokePelletFlueFlow: formEl.safety_smokePelletFlueFlow.value,
    smokeMatchSpillage: formEl.safety_smokeMatchSpillage.value,
    safetyDevice: formEl.safety_safetyDevice.value,
    otherRegulations: formEl.safety_otherRegulations.value,
    workingPressure: formEl.workingPressure.value.trim() ? `${formEl.workingPressure.value.trim()} mbar` : '',
    gasTightnessPerformed: formEl.gasTightnessPerformed.value,
    gasTightnessResult: formEl.gasTightnessResult.value,

    safeToUse: formEl.findings_safeToUse.value,
    warningNoticeRaised: formEl.findings_warningNoticeRaised.value,
    carriedOutToStandard: formEl.findings_carriedOutToStandard.value,

    remedialWorkRequired: formEl.remedialWorkRequired.value,

    engineerName: formEl.engineerName.value,
    engineerEmail: formEl.engineerEmail.value,
    gasSafeId: formEl.gasSafeId.value,
    companyName: formEl.companyName.value,
    companyAddress: formEl.companyAddress.value,
    companyPhone: formEl.companyPhone.value,

    inspectionDate: formEl.inspectionDate.value,
    nextServiceDue: formEl.nextServiceDue.value,

    customerPrintName: formEl.customerPrintName.value,
    customerDate: formEl.inspectionDate.value,
    customerSignature: customerSig.dataUrl(),

    engineerPrintName: formEl.engineerName.value,
    engineerSignature: engineerSig.dataUrl()
  };

  const submitBtn = formEl.querySelector('button[type=submit]');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Submitting…';

  try {
    const res = await fetch('/api/service-record/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      errorText.textContent = err.error || 'Something went wrong. Please check the form and try again.';
      errorText.classList.remove('hidden');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit service record';
      return;
    }

    const card = document.getElementById('form-card');
    card.innerHTML = `
      <div class="thankyou">
        <h2>Thank you!</h2>
        <p style="color:var(--muted);">The service record has been generated and emailed to RENTL.</p>
      </div>
    `;
  } catch (err) {
    errorText.textContent = "Couldn't submit - please check your internet connection and try again.";
    errorText.classList.remove('hidden');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Submit service record';
  }
}

buildForm();
