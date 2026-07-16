// Builds a Landlord Gas Safety Record (CP12-style) PDF from a gas-check
// submission, using pdfkit (pure JS, no LibreOffice/headless-browser needed -
// keeps this reliable on Render's free tier). Layout is drawn to match the
// real Gas Safe Register "Landlord/Homeowner Gas Safety Record" certificate
// James supplied as a reference, compressed to fit a single A4 page.

const PDFDocument = require('pdfkit');
const path = require('path');

const PAGE_MARGIN = 22;
const LOGO_PATH = path.join(__dirname, 'assets', 'gas-safe-logo.jpeg');
const APPLIANCE_SLOTS = 4; // always show 4 columns, regardless of how many were filled in

const BLACK = '#000000';
const YELLOW = '#fff200';
const BORDER = '#000000';

const RENTL_DETAILS = {
  name: 'RENTL BY JGLA LTD',
  addressLines: ['54 St James Street', 'Liverpool', 'L1 0AB'],
  phone: '0151 272 1985'
};

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

// Draws a bordered cell with text. x/y/w/h define the box; fill optionally
// paints the background (used for the black section bars and yellow highlights).
// IMPORTANT: pdfkit's doc.text() silently moves doc.x/doc.y as a side effect
// (so calls can be "continued"). Every caller here draws several cells at the
// same y using an explicit coordinate, so cell() always saves and restores
// doc.x/doc.y - otherwise each subsequent cell in a row drifts downward
// (this caused a "staircase" layout bug during earlier testing).
function cell(doc, x, y, w, h, text, opts = {}) {
  const savedX = doc.x, savedY = doc.y;
  const {
    fontSize = 7,
    bold = false,
    italic = false,
    align = 'left',
    color = '#000000',
    fill = null,
    border = true,
    valign = 'top'
  } = opts;

  if (fill) {
    doc.rect(x, y, w, h).fill(fill);
  }
  if (border) {
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
  }
  if (text !== undefined && text !== null && text !== '') {
    const font = italic ? 'Helvetica-Oblique' : (bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.font(font).fontSize(fontSize).fillColor(color);
    const padX = 3;
    let padY = 2;
    if (valign === 'middle') {
      const textH = doc.heightOfString(String(text), { width: w - padX * 2 });
      padY = Math.max(1, (h - textH) / 2);
    }
    doc.text(String(text), x + padX, y + padY, { width: w - padX * 2, align });
  }
  doc.fillColor('#000000');
  doc.x = savedX;
  doc.y = savedY;
}

// "{label}   YES [ ] NO [ ]" all in one row, with box positions computed from
// the measured label width so it always lines up regardless of font tweaks.
function labeledYesNo(doc, x, y, w, h, label, value, fontSize) {
  const savedX = doc.x, savedY = doc.y;
  const isYes = String(value || '').trim().toLowerCase() === 'yes';
  const isNo = String(value || '').trim().toLowerCase() === 'no';

  doc.font('Helvetica-Bold').fontSize(fontSize).fillColor('#000');
  const labelY = y + Math.max(1, (h - fontSize) / 2);
  doc.text(label, x + 3, labelY, { lineBreak: false });
  const labelW = doc.widthOfString(label);

  let bx = x + 3 + labelW + 8;
  const boxSize = 9;
  doc.fontSize(fontSize - 0.5).text('YES', bx, labelY, { lineBreak: false });
  bx += doc.widthOfString('YES') + 4;
  doc.rect(bx, y + (h - boxSize) / 2, boxSize, boxSize).lineWidth(0.5).strokeColor(BORDER).stroke();
  if (isYes) doc.fontSize(boxSize).text('X', bx + 1.5, y + (h - boxSize) / 2 - 1.5);
  bx += boxSize + 6;
  doc.fontSize(fontSize - 0.5).text('NO', bx, labelY, { lineBreak: false });
  bx += doc.widthOfString('NO') + 4;
  doc.rect(bx, y + (h - boxSize) / 2, boxSize, boxSize).lineWidth(0.5).strokeColor(BORDER).stroke();
  if (isNo) doc.fontSize(boxSize).text('X', bx + 1.5, y + (h - boxSize) / 2 - 1.5);

  doc.x = savedX;
  doc.y = savedY;
}

// Full-width black bar used for section headings ("GAS INSTALLATION PIPEWORK" etc.)
function sectionBar(doc, text, h = 14) {
  ensureSpace(doc, h + 2);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  cell(doc, x, doc.y, w, h, text, { fill: BLACK, color: '#ffffff', bold: true, fontSize: 8.5, valign: 'middle' });
  doc.y += h;
}

const APPLIANCE_ROWS = [
  { key: 'location', label: 'Location of appliance' },
  { key: 'type', label: 'Appliance type' },
  { key: 'make', label: 'Appliance make' },
  { key: 'model', label: 'Appliance model' },
  { key: 'flueType', label: 'Type of flue/outlet (OF/RS/FL)' },
  { key: 'pressure', label: 'Working pressure (mbar) or heat input (kW/Btu-h)' },
  { key: 'safetyDevices', label: 'Are safety devices working? (Yes/No/NA)' },
  { divider: true },
  { key: 'spillage', label: 'Spillage (Pass/Fail/NA)' },
  { key: 'smokePellet', label: 'Smoke Pellet (Flue Flow) (Pass/Fail/NA)' },
  { key: 'termination', label: 'Adequate termination (Yes/No/NA)' },
  { key: 'visualCondition', label: 'Visual condition (Pass/Fail/NA)' },
  { divider: true },
  { key: 'inspected', label: 'Has this appliance been inspected (Yes/No)' },
  { key: 'landlordOwned', label: 'Is this appliance owned by the Landlord (Yes/No)' },
  { key: 'ventilation', label: 'Is there adequate ventilation? (Yes/No)' },
  { key: 'serviced', label: 'Has the appliance been serviced? (Yes/No)' },
  { key: 'coco2Ratio', label: 'CO:CO2 ratio' },
  { key: 'co2Percent', label: 'CO2 %' },
  { key: 'coPpm', label: 'CO ppm' },
  { key: 'safeToUse', label: 'Is this appliance safe to use? (Y/N)', barRow: true },
  { key: 'coAlarms', label: 'CO & Smoke alarms tested working? (Y/N)', barRow: true }
];

async function buildGasCheckPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageLeft = doc.page.margins.left;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const appliances = Array.isArray(data.appliances) ? data.appliances : [];

      function lineHeight(text, width, fontSize) {
        doc.font('Helvetica').fontSize(fontSize);
        return doc.heightOfString(String(text || ''), { width });
      }

      // ---------- Top strip: serial no + verification line + logo ----------
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
        .text(`SERIAL NO: ${data.serialNo || ''}`, pageLeft, PAGE_MARGIN, { width: contentWidth - 58 });

      doc.font('Helvetica').fontSize(6.5).fillColor('#000')
        .text('To confirm the validity of the Registered Gas Engineer please contact Gas Safe on 0800 408 5577 or www.gassaferegister.co.uk',
          pageLeft, PAGE_MARGIN + 10, { width: contentWidth - 58, align: 'center' });

      try {
        doc.image(LOGO_PATH, pageLeft + contentWidth - 50, PAGE_MARGIN - 3, { width: 50 });
      } catch (e) { /* logo optional - don't fail PDF generation if the asset is missing */ }

      doc.y = PAGE_MARGIN + 22;

      // ---------- Title box ----------
      const titleH = 28;
      cell(doc, pageLeft, doc.y, contentWidth - 58, titleH, 'LANDLORD / HOMEOWNER GAS SAFETY RECORD', {
        bold: true, fontSize: 13.5, align: 'center', valign: 'middle', border: true
      });
      doc.y += titleH + 3;

      // ---------- Disclaimer ----------
      const disclaimerText = 'This form allows for the recording of results of checks as defined by the Gas Safety (Installation and Use) Regulations. Information recorded on this form does not confirm that the installation was installed by a Gas Safe registered business or that the installation complies with relevant Building Regulations.';
      const disclaimerH = lineHeight(disclaimerText, contentWidth, 6);
      doc.font('Helvetica-Oblique').fontSize(6).fillColor('#333')
        .text(disclaimerText, pageLeft, doc.y, { width: contentWidth, align: 'center' });
      doc.fillColor('#000');
      doc.y += disclaimerH + 4;

      // ---------- Company / Engineer box (left, yellow) + Inspection/Agent box (right) ----------
      const companyW = contentWidth * 0.30;
      const rightW = contentWidth - companyW;
      const topBlockY = doc.y;

      const companyLines = [
        `Company: ${data.companyName || 'Not provided'}`,
        `Gas Safe ID Card No: ${data.gasSafeId || 'Not provided'}`,
        `Engineer Name: ${data.engineerName || 'Not provided'}`,
        `Engineer Email: ${data.engineerEmail || 'Not provided'}`,
        `Address: ${data.companyAddress || 'Not provided'}`,
        `Tel No: ${data.companyPhone || 'Not provided'}`
      ];
      const companyInnerW = companyW - 8;
      const companyLineHeights = companyLines.map(t => lineHeight(t, companyInnerW, 6.5) + 2.5);
      const companyH = companyLineHeights.reduce((a, b) => a + b, 0) + 8;

      doc.rect(pageLeft, topBlockY, companyW, companyH).fill(YELLOW);
      doc.rect(pageLeft, topBlockY, companyW, companyH).lineWidth(0.5).strokeColor(BORDER).stroke();
      let cy = topBlockY + 4;
      companyLines.forEach((text, i) => {
        doc.font('Helvetica-Bold').fontSize(6.5).fillColor('#000')
          .text(text, pageLeft + 4, cy, { width: companyInnerW });
        cy += companyLineHeights[i];
      });
      doc.fillColor('#000');

      // --- right box: Inspection address / Agent-landlord details ---
      const rx = pageLeft + companyW;
      const halfW = rightW / 2;
      let ry = topBlockY;
      const headerH = 12;
      cell(doc, rx, ry, halfW, headerH, 'INSPECTION ADDRESS', { fill: '#fff', bold: true, fontSize: 7.5, align: 'center', valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, headerH, 'AGENT/LANDLORD DETAILS (if different)', { fill: '#fff', bold: true, fontSize: 7.5, align: 'center', valign: 'middle' });
      ry += headerH;

      const rowH = 12;
      // Address line 1 (both sides, not bold)
      cell(doc, rx, ry, halfW, rowH, data.addressLine1 || 'Not provided', { fontSize: 7, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `Name/Company: ${RENTL_DETAILS.name}`, { fontSize: 7, valign: 'middle' });
      ry += rowH;

      // Address line 2 / town-city
      cell(doc, rx, ry, halfW, rowH, data.addressLine2 || '', { fontSize: 7, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, RENTL_DETAILS.addressLines[0], { fontSize: 7, valign: 'middle' });
      ry += rowH;

      // Postcode
      cell(doc, rx, ry, halfW, rowH, data.addressPostcode || '', { fontSize: 7, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `${RENTL_DETAILS.addressLines[1]}, ${RENTL_DETAILS.addressLines[2]}`, { fontSize: 7, valign: 'middle' });
      ry += rowH;

      cell(doc, rx, ry, halfW, rowH, 'Tel No: Not provided', { fontSize: 7, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `Tel No: ${RENTL_DETAILS.phone}`, { fontSize: 7, valign: 'middle' });
      ry += rowH;

      const rentedRowH = 14;
      cell(doc, rx, ry, halfW, rentedRowH, '', {});
      labeledYesNo(doc, rx, ry, halfW, rentedRowH, 'Is accommodation rented?', data.accommodationRented, 7);
      cell(doc, rx + halfW, ry, halfW, rentedRowH, `No. of Appliances tested: ${appliances.length || 1}`, { bold: true, fontSize: 7, valign: 'middle' });
      ry += rentedRowH;

      const topBlockBottom = Math.max(topBlockY + companyH, ry);
      doc.y = topBlockBottom + 3;

      // ---------- Gas installation pipework ----------
      sectionBar(doc, 'GAS INSTALLATION PIPEWORK');
      const pipeH = 20;
      const pipeColW = contentWidth / 4;
      const pipeItems = [
        ['Equipotential Bonding satisfactory? (Y/N)', data.equipotentialBonding],
        ['Visual Inspection satisfactory? (Y/N)', data.pipeworkVisual],
        ['Emergency Control Valve Accessible? (Y/N)', data.ecvAccessible],
        ['Gas Tightness Test satisfactory? (Y/N)', data.gasTightnessTest]
      ];
      pipeItems.forEach(([label, value], i) => {
        const x = pageLeft + pipeColW * i;
        cell(doc, x, doc.y, pipeColW - 18, pipeH, label, { fontSize: 6, valign: 'middle' });
        cell(doc, x + pipeColW - 18, doc.y, 18, pipeH, (value || '').charAt(0).toUpperCase(), { fontSize: 8, bold: true, align: 'center', valign: 'middle' });
      });
      doc.y += pipeH;

      // ---------- Appliance specifics ----------
      sectionBar(doc, 'APPLIANCE SPECIFICS');
      const labelColW = 140;
      const applW = (contentWidth - labelColW) / APPLIANCE_SLOTS;

      const headH = 12;
      ensureSpace(doc, headH);
      cell(doc, pageLeft, doc.y, labelColW, headH, '', { fill: '#fff' });
      for (let i = 0; i < APPLIANCE_SLOTS; i++) {
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, headH, `Appliance ${i + 1}`, {
          fill: YELLOW, bold: true, align: 'center', fontSize: 7, valign: 'middle'
        });
      }
      doc.y += headH;

      APPLIANCE_ROWS.forEach(row => {
        if (row.divider) {
          const dH = 4;
          ensureSpace(doc, dH);
          cell(doc, pageLeft, doc.y, contentWidth, dH, '', { fill: BLACK });
          doc.y += dH;
          return;
        }
        const rH = 13;
        ensureSpace(doc, rH);
        const fill = row.barRow ? BLACK : null;
        const labelColor = row.barRow ? '#ffffff' : '#000000';
        cell(doc, pageLeft, doc.y, labelColW, rH, row.label, {
          fontSize: 6, bold: row.barRow, valign: 'middle', fill, color: labelColor
        });
        for (let i = 0; i < APPLIANCE_SLOTS; i++) {
          const val = (appliances[i] || {})[row.key] || '';
          cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, rH, val, {
            fontSize: 6.5, align: 'center', valign: 'middle', fill: row.barRow ? '#fff9c4' : null
          });
        }
        doc.y += rH;
      });

      // ---------- Defects / remedial work ----------
      sectionBar(doc, 'DEFECT(S) DETECTED');
      const defectH = 22;
      ensureSpace(doc, defectH);
      cell(doc, pageLeft, doc.y, labelColW, defectH, '', {});
      for (let i = 0; i < APPLIANCE_SLOTS; i++) {
        const txt = (appliances[i] || {}).defects || (appliances[i] ? 'None' : '');
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, defectH, txt, { fontSize: 6, valign: 'top' });
      }
      doc.y += defectH;

      sectionBar(doc, 'REMEDIAL WORK UNDERTAKEN');
      ensureSpace(doc, defectH);
      cell(doc, pageLeft, doc.y, labelColW, defectH, '', {});
      for (let i = 0; i < APPLIANCE_SLOTS; i++) {
        const txt = (appliances[i] || {}).remedialWork || (appliances[i] ? 'None' : '');
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, defectH, txt, { fontSize: 6, valign: 'top' });
      }
      doc.y += defectH;

      // ---------- Sign-off ----------
      ensureSpace(doc, 66);
      const signBlockY = doc.y;
      const signLeftW = contentWidth * 0.55;
      const signRightW = contentWidth - signLeftW;

      const sigRowH = 20;
      cell(doc, pageLeft, signBlockY, signLeftW, sigRowH, 'Registered Engineer Signature:', { bold: true, fontSize: 7.5, valign: 'middle' });
      if (data.signature && data.signature.startsWith('data:image')) {
        try {
          const base64 = data.signature.split(',')[1];
          const buf = Buffer.from(base64, 'base64');
          doc.image(buf, pageLeft + 160, signBlockY + 2, { width: 90, height: 17 });
        } catch (e) { /* ignore */ }
      }
      cell(doc, pageLeft + signLeftW, signBlockY, signRightW, sigRowH * 3, 'NEXT INSPECTION DUE BEFORE:', {
        bold: true, fontSize: 10, align: 'center', valign: 'middle'
      });
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#000')
        .text(formatDate(data.nextInspectionDate), pageLeft + signLeftW, signBlockY + sigRowH * 3 - 16, {
          width: signRightW, align: 'center'
        });

      cell(doc, pageLeft, signBlockY + sigRowH, signLeftW, sigRowH, `Print Name: ${data.printName || ''}`, { fontSize: 7.5, valign: 'middle' });
      cell(doc, pageLeft, signBlockY + sigRowH * 2, signLeftW, sigRowH, `Date: ${formatDate(data.inspectionDate)}`, { fontSize: 7.5, valign: 'middle' });

      doc.y = signBlockY + sigRowH * 3 + 3;

      // ---------- Footer ----------
      const footH = 15;
      ensureSpace(doc, footH);
      cell(doc, pageLeft, doc.y, contentWidth, footH, 'THE NEXT GAS SAFETY CHECK MUST BE COMPLETED ON OR BEFORE THE NEXT INSPECTION DATE SPECIFIED ABOVE', {
        fill: BLACK, color: '#ffffff', bold: true, align: 'center', fontSize: 7.5, valign: 'middle'
      });
      doc.y += footH;

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildGasCheckPdf };
