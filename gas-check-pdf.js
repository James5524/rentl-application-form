// Builds a Landlord Gas Safety Record (CP12-style) PDF from a gas-check
// submission, using pdfkit (pure JS, no LibreOffice/headless-browser needed -
// keeps this reliable on Render's free tier). Layout is reorganised into
// clean vertical sections rather than a cramped multi-column grid, but every
// field from the original certificate is included.

const PDFDocument = require('pdfkit');
const path = require('path');

const PAGE_MARGIN = 40;
const LOGO_PATH = path.join(__dirname, 'assets', 'gas-safe-logo.jpeg');

const RENTL_DETAILS = {
  name: 'RENTL BY JGLA LTD',
  address: '54 St James Street, Liverpool, L1 0AB',
  phone: '0151 272 1985'
};

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
  }
}

function sectionHeading(doc, text) {
  ensureSpace(doc, 40);
  doc.moveDown(0.6);
  doc.fontSize(13).fillColor('#3b4560').font('Helvetica-Bold').text(text);
  doc.moveTo(doc.page.margins.left, doc.y + 2)
    .lineTo(doc.page.margins.left + 60, doc.y + 2)
    .lineWidth(2.5)
    .strokeColor('#f0b2ac')
    .stroke();
  doc.moveDown(0.6);
  doc.fillColor('#1f2430').font('Helvetica');
}

function labelValueRow(doc, label, value, colWidth) {
  ensureSpace(doc, 16);
  const startY = doc.y;
  doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Bold')
    .text(label, doc.page.margins.left, startY, { width: colWidth, continued: false });
  doc.fontSize(10).fillColor('#1f2430').font('Helvetica')
    .text(value || 'Not provided', doc.page.margins.left + colWidth + 10, startY, {
      width: doc.page.width - doc.page.margins.left - doc.page.margins.right - colWidth - 10
    });
  doc.moveDown(0.25);
}

function paragraphBlock(doc, label, value) {
  ensureSpace(doc, 30);
  doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Bold').text(label);
  doc.fontSize(10).fillColor('#1f2430').font('Helvetica').text(value && value.trim() ? value : 'None');
  doc.moveDown(0.4);
}

const APPLIANCE_FIELD_LABELS = [
  ['location', 'Location of appliance'],
  ['type', 'Appliance type'],
  ['make', 'Appliance make'],
  ['model', 'Appliance model'],
  ['flueType', 'Type of flue/outlet'],
  ['pressure', 'Working pressure / heat input'],
  ['safetyDevices', 'Safety devices working?'],
  ['spillage', 'Spillage test'],
  ['smokePellet', 'Smoke pellet (flue flow) test'],
  ['termination', 'Adequate termination?'],
  ['visualCondition', 'Visual condition'],
  ['inspected', 'Has this appliance been inspected?'],
  ['landlordOwned', 'Is this appliance owned by the landlord?'],
  ['ventilation', 'Is there adequate ventilation?'],
  ['serviced', 'Has the appliance been serviced?'],
  ['combustionRatio', 'Combustion performance reading'],
  ['safeToUse', 'Is this appliance safe to use?'],
  ['coAlarms', 'CO & smoke alarms present and tested working?']
];

async function buildGasCheckPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      // ---------- Header ----------
      try {
        doc.image(LOGO_PATH, doc.page.width - PAGE_MARGIN - 50, PAGE_MARGIN - 10, { width: 50 });
      } catch (e) { /* logo optional - don't fail PDF generation if missing */ }

      doc.fontSize(20).fillColor('#3b4560').font('Helvetica-Bold')
        .text('Landlord Gas Safety Record', PAGE_MARGIN, PAGE_MARGIN, { width: 400 });
      doc.fontSize(11).fillColor('#6b7280').font('Helvetica')
        .text('(CP12) - Gas Safety (Installation and Use) Regulations 1998', { width: 400 });
      doc.moveDown(1);
      doc.fillColor('#1f2430');

      // ---------- Property / landlord details ----------
      sectionHeading(doc, 'Inspection address');
      labelValueRow(doc, 'ADDRESS', data.propertyAddress, 130);
      labelValueRow(doc, 'OCCUPIER', data.occupierName, 130);
      labelValueRow(doc, 'ACCOMMODATION RENTED?', data.accommodationRented, 130);

      sectionHeading(doc, 'Agent / landlord details');
      labelValueRow(doc, 'NAME', RENTL_DETAILS.name, 130);
      labelValueRow(doc, 'ADDRESS', RENTL_DETAILS.address, 130);
      labelValueRow(doc, 'TEL NO', RENTL_DETAILS.phone, 130);

      // ---------- Pipework ----------
      sectionHeading(doc, 'Gas installation pipework');
      labelValueRow(doc, 'EQUIPOTENTIAL BONDING SATISFACTORY?', data.equipotentialBonding, 220);
      labelValueRow(doc, 'VISUAL INSPECTION SATISFACTORY?', data.pipeworkVisual, 220);
      labelValueRow(doc, 'EMERGENCY CONTROL VALVE ACCESSIBLE?', data.ecvAccessible, 220);
      labelValueRow(doc, 'GAS TIGHTNESS TEST SATISFACTORY?', data.gasTightnessTest, 220);

      // ---------- Appliances ----------
      const appliances = Array.isArray(data.appliances) ? data.appliances : [];
      appliances.forEach((appliance, idx) => {
        sectionHeading(doc, `Appliance ${idx + 1}`);
        APPLIANCE_FIELD_LABELS.forEach(([key, label]) => {
          labelValueRow(doc, label.toUpperCase(), appliance[key], 220);
        });
        paragraphBlock(doc, 'DEFECT(S) DETECTED', appliance.defects);
        paragraphBlock(doc, 'REMEDIAL WORK UNDERTAKEN', appliance.remedialWork);
      });

      // ---------- Sign-off ----------
      sectionHeading(doc, 'Engineer & company details');
      labelValueRow(doc, 'ENGINEER NAME', data.engineerName, 150);
      labelValueRow(doc, 'GAS SAFE ID CARD NO', data.gasSafeId, 150);
      labelValueRow(doc, 'COMPANY NAME', data.companyName, 150);
      labelValueRow(doc, 'COMPANY ADDRESS', data.companyAddress, 150);
      labelValueRow(doc, 'COMPANY TEL NO', data.companyPhone, 150);
      labelValueRow(doc, 'DATE OF INSPECTION', formatDate(data.inspectionDate), 150);

      sectionHeading(doc, 'Registered engineer signature');
      if (data.signature && data.signature.startsWith('data:image')) {
        try {
          const base64 = data.signature.split(',')[1];
          const buf = Buffer.from(base64, 'base64');
          ensureSpace(doc, 90);
          const imgY = doc.y;
          doc.image(buf, doc.page.margins.left, imgY, { width: 220, height: 70 });
          doc.y = imgY + 80;
        } catch (e) {
          doc.fontSize(10).text('(signature image could not be rendered)');
        }
      }
      labelValueRow(doc, 'PRINT NAME', data.printName, 150);

      // ---------- Regulatory footer ----------
      ensureSpace(doc, 60);
      doc.moveDown(1);
      doc.fontSize(11).fillColor('#3b4560').font('Helvetica-Bold')
        .text(`NEXT INSPECTION DUE BEFORE: ${addMonths(data.inspectionDate, 12)}`);
      doc.fontSize(9).fillColor('#6b7280').font('Helvetica')
        .text('The next gas safety check must be completed within the next 12 months.');

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildGasCheckPdf };
