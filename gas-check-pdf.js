// Builds a Landlord Gas Safety Record (CP12-style) PDF from a gas-check
// submission, using pdfkit (pure JS, no LibreOffice/headless-browser needed -
// keeps this reliable on Render's free tier). Layout is drawn to match the
// real Gas Safe Register "Landlord/Homeowner Gas Safety Record" certificate
// James supplied as a reference: black section bars, yellow highlight boxes,
// a bordered grid of appliance columns, and checkbox-style Yes/No boxes.

const PDFDocument = require('pdfkit');
const path = require('path');

const PAGE_MARGIN = 28;
const LOGO_PATH = path.join(__dirname, 'assets', 'gas-safe-logo.jpeg');

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

function addMonths(dateStr, months) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
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
// (this caused a "staircase" layout bug during testing).
function cell(doc, x, y, w, h, text, opts = {}) {
  const savedX = doc.x, savedY = doc.y;
  const {
    fontSize = 7.5,
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
    doc.rect(x, y, w, h).lineWidth(0.6).strokeColor(BORDER).stroke();
  }
  if (text !== undefined && text !== null && text !== '') {
    const font = italic ? 'Helvetica-Oblique' : (bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.font(font).fontSize(fontSize).fillColor(color);
    const padX = 4;
    let padY = 3;
    if (valign === 'middle') {
      const textH = doc.heightOfString(String(text), { width: w - padX * 2 });
      padY = Math.max(2, (h - textH) / 2);
    }
    doc.text(String(text), x + padX, y + padY, { width: w - padX * 2, align });
  }
  doc.fillColor('#000000');
  doc.x = savedX;
  doc.y = savedY;
}

// A small Yes/No checkbox pair, e.g. "Is accommodation rented?  YES [x]  NO [ ]"
function yesNoCheckbox(doc, x, y, value) {
  const savedX = doc.x, savedY = doc.y;
  const isYes = String(value || '').trim().toLowerCase() === 'yes';
  const isNo = String(value || '').trim().toLowerCase() === 'no';
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('YES', x, y + 2);
  const yesBoxX = x + 26;
  doc.rect(yesBoxX, y, 12, 12).lineWidth(0.6).strokeColor(BORDER).stroke();
  if (isYes) doc.font('Helvetica-Bold').fontSize(10).text('X', yesBoxX + 2.5, y + 1);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#000').text('NO', yesBoxX + 22, y + 2);
  const noBoxX = yesBoxX + 44;
  doc.rect(noBoxX, y, 12, 12).lineWidth(0.6).strokeColor(BORDER).stroke();
  if (isNo) doc.font('Helvetica-Bold').fontSize(10).text('X', noBoxX + 2.5, y + 1);
  doc.x = savedX;
  doc.y = savedY;
}

// Full-width black bar used for section headings ("GAS INSTALLATION PIPEWORK" etc.)
function sectionBar(doc, text) {
  ensureSpace(doc, 22);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const h = 18;
  cell(doc, x, doc.y, w, h, text, { fill: BLACK, color: '#ffffff', bold: true, fontSize: 10, valign: 'middle' });
  doc.y += h;
}

const APPLIANCE_ROWS = [
  { key: 'location', label: 'Location of appliance' },
  { key: 'type', label: 'Appliance type' },
  { key: 'make', label: 'Appliance make' },
  { key: 'model', label: 'Appliance model' },
  { key: 'flueType', label: 'Type of flue/outlet (OF/RS/FL)' },
  { key: 'pressure', label: 'Working pressure in mbar or heat input kW/Btu/h' },
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
  { key: 'coAlarms', label: 'CO & Smoke alarms present and tested working? (Y/N)', barRow: true }
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
      const applianceCount = Math.max(1, Math.min(4, appliances.length || 1));

      // ---------- Top strip: verification line + logo ----------
      doc.font('Helvetica').fontSize(8).fillColor('#000')
        .text('To confirm the validity of the Registered Gas Engineer please contact Gas Safe on 0800 408 5577 or www.gassaferegister.co.uk',
          pageLeft, PAGE_MARGIN, { width: contentWidth - 70, align: 'center' });

      try {
        doc.image(LOGO_PATH, pageLeft + contentWidth - 55, PAGE_MARGIN - 4, { width: 55 });
      } catch (e) { /* logo optional */ }

      doc.y = PAGE_MARGIN + 16;

      // ---------- Title box ----------
      const titleH = 42;
      cell(doc, pageLeft, doc.y, contentWidth - 65, titleH, 'LANDLORD / HOMEOWNER GAS SAFETY RECORD', {
        bold: true, fontSize: 17, align: 'center', valign: 'middle', border: true
      });
      doc.y += titleH + 6;

      // ---------- Disclaimer ----------
      doc.font('Helvetica-Oblique').fontSize(7).fillColor('#333')
        .text('This form allows for the recording of results of checks as defined by the Gas Safety (Installation and Use) Regulations. Information recorded on this form does not confirm that the installation was installed by a Gas Safe registered business or that the installation complies with relevant Building Regulations. Chimney/flue/outlets were visually checked for adequate evacuation of combustion products. A detailed internal inspection has not been undertaken.',
          pageLeft, doc.y, { width: contentWidth, align: 'center' });
      doc.fillColor('#000');
      doc.y += 26;

      // ---------- Company / Engineer box (left, yellow) + Inspection/Agent box (right) ----------
      // Row heights here are measured from the actual text (doc.heightOfString)
      // rather than fixed, since company/property addresses vary in length and
      // a fixed height would either overflow or waste space.
      const companyW = contentWidth * 0.32;
      const rightW = contentWidth - companyW;
      const topBlockY = doc.y;

      function lineHeight(text, width, fontSize) {
        doc.font('Helvetica').fontSize(fontSize);
        return doc.heightOfString(String(text || ''), { width });
      }

      // --- measure company box first ---
      const companyLines = [
        [`Company: ${data.companyName || 'Not provided'}`],
        [`Gas Safe ID Card No: ${data.gasSafeId || 'Not provided'}`],
        [`Engineer Name: ${data.engineerName || 'Not provided'}`],
        [`Address: ${data.companyAddress || 'Not provided'}`],
        [`Tel No: ${data.companyPhone || 'Not provided'}`]
      ];
      const companyInnerW = companyW - 10;
      const companyLineHeights = companyLines.map(([t]) => lineHeight(t, companyInnerW, 8) + 5);
      const companyH = companyLineHeights.reduce((a, b) => a + b, 0) + 10;

      doc.rect(pageLeft, topBlockY, companyW, companyH).fill(YELLOW);
      doc.rect(pageLeft, topBlockY, companyW, companyH).lineWidth(0.6).strokeColor(BORDER).stroke();
      let cy = topBlockY + 5;
      companyLines.forEach(([text], i) => {
        doc.font('Helvetica-Bold').fontSize(8).fillColor('#000')
          .text(text, pageLeft + 5, cy, { width: companyInnerW });
        cy += companyLineHeights[i];
      });
      doc.fillColor('#000');

      // --- right box: Inspection address / Agent-landlord details ---
      const rx = pageLeft + companyW;
      const halfW = rightW / 2;
      let ry = topBlockY;
      const headerH = 15;
      cell(doc, rx, ry, halfW, headerH, 'INSPECTION ADDRESS', { fill: '#fff', bold: true, fontSize: 8.5, align: 'center', valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, headerH, 'AGENT/LANDLORD DETAILS (if different)', { fill: '#fff', bold: true, fontSize: 8.5, align: 'center', valign: 'middle' });
      ry += headerH;

      const rowH = 15;
      cell(doc, rx, ry, halfW, rowH, 'Name: Not provided', { bold: true, fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `Name/Company: ${RENTL_DETAILS.name}`, { bold: true, fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      // Address rows: measure the taller of the two sides so both columns
      // share a common row height and neither one overflows its box.
      const addrInnerW = halfW - 8;
      const leftAddrText = `Address: ${data.propertyAddress || 'Not provided'}`;
      const rightAddrText = `Address: ${RENTL_DETAILS.addressLines[0]}`;
      const addrRowH = Math.max(
        lineHeight(leftAddrText, addrInnerW, 7.5),
        lineHeight(rightAddrText, addrInnerW, 7.5)
      ) + 8;
      cell(doc, rx, ry, halfW, addrRowH, leftAddrText, { bold: true, fontSize: 7.5, valign: 'top' });
      cell(doc, rx + halfW, ry, halfW, addrRowH, rightAddrText, { bold: true, fontSize: 7.5, valign: 'top' });
      ry += addrRowH;

      cell(doc, rx, ry, halfW, rowH, '', {});
      cell(doc, rx + halfW, ry, halfW, rowH, RENTL_DETAILS.addressLines[1], { fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      cell(doc, rx, ry, halfW, rowH, '', {});
      cell(doc, rx + halfW, ry, halfW, rowH, RENTL_DETAILS.addressLines[2], { fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      cell(doc, rx, ry, halfW, rowH, 'Tel No: Not provided', { bold: true, fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `Tel No: ${RENTL_DETAILS.phone}`, { bold: true, fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      const rentedRowH = 18;
      cell(doc, rx, ry, halfW, rentedRowH, '', {});
      yesNoCheckbox(doc, rx + 5, ry + 3, data.accommodationRented);
      cell(doc, rx + halfW, ry, halfW, rentedRowH, `No. of Appliances tested: ${appliances.length || applianceCount}`, { bold: true, fontSize: 7.5, valign: 'middle' });
      ry += rentedRowH;

      const topBlockBottom = Math.max(topBlockY + companyH, ry);
      doc.y = topBlockBottom + 4;

      // ---------- Gas installation pipework ----------
      sectionBar(doc, 'GAS INSTALLATION PIPEWORK');
      const pipeH = 24;
      const pipeColW = contentWidth / 4;
      const pipeItems = [
        ['Is Equipotential Bonding satisfactory? (Y/N)', data.equipotentialBonding],
        ['Visual Inspection satisfactory? (Y/N)', data.pipeworkVisual],
        ['Emergency Control Valve Accessible? (Y/N)', data.ecvAccessible],
        ['Gas Tightness Test satisfactory? (Y/N)', data.gasTightnessTest]
      ];
      pipeItems.forEach(([label, value], i) => {
        const x = pageLeft + pipeColW * i;
        cell(doc, x, doc.y, pipeColW - 22, pipeH, label, { fontSize: 7, valign: 'middle' });
        cell(doc, x + pipeColW - 22, doc.y, 22, pipeH, (value || '').charAt(0).toUpperCase(), { fontSize: 9, bold: true, align: 'center', valign: 'middle' });
      });
      doc.y += pipeH;

      // ---------- Appliance specifics ----------
      sectionBar(doc, 'APPLIANCE SPECIFICS');
      const labelColW = 150;
      const applW = (contentWidth - labelColW) / applianceCount;

      // header row: "Appliance 1 / 2 / 3 / 4"
      const headH = 16;
      ensureSpace(doc, headH);
      cell(doc, pageLeft, doc.y, labelColW, headH, '', { fill: '#fff' });
      for (let i = 0; i < applianceCount; i++) {
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, headH, `Appliance ${i + 1}`, {
          fill: YELLOW, bold: true, align: 'center', fontSize: 8.5, valign: 'middle'
        });
      }
      doc.y += headH;

      APPLIANCE_ROWS.forEach(row => {
        if (row.divider) {
          const dH = 6;
          ensureSpace(doc, dH);
          cell(doc, pageLeft, doc.y, contentWidth, dH, '', { fill: BLACK });
          doc.y += dH;
          return;
        }
        const rH = 20;
        ensureSpace(doc, rH);
        const fill = row.barRow ? BLACK : null;
        const labelColor = row.barRow ? '#ffffff' : '#000000';
        cell(doc, pageLeft, doc.y, labelColW, rH, row.label, {
          fontSize: 7, bold: row.barRow, valign: 'middle', fill, color: labelColor
        });
        for (let i = 0; i < applianceCount; i++) {
          const val = (appliances[i] || {})[row.key] || '';
          cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, rH, val, {
            fontSize: 7.5, align: 'center', valign: 'middle', fill: row.barRow ? '#fff9c4' : null
          });
        }
        doc.y += rH;
      });

      // ---------- Defects / remedial work ----------
      sectionBar(doc, 'DEFECT(S) DETECTED');
      const engRowH = 15;
      ensureSpace(doc, engRowH);
      cell(doc, pageLeft, doc.y, labelColW, engRowH, '', { fill: YELLOW });
      for (let i = 0; i < applianceCount; i++) {
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, engRowH, `Engineer: ${data.engineerName || ''}`, {
          fill: YELLOW, fontSize: 6.5, bold: true, valign: 'middle'
        });
      }
      doc.y += engRowH;
      const defectH = 30;
      ensureSpace(doc, defectH);
      cell(doc, pageLeft, doc.y, labelColW, defectH, '', {});
      for (let i = 0; i < applianceCount; i++) {
        const txt = (appliances[i] || {}).defects || 'None';
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, defectH, txt, { fontSize: 6.5, valign: 'top' });
      }
      doc.y += defectH;

      sectionBar(doc, 'REMEDIAL WORK UNDERTAKEN');
      ensureSpace(doc, engRowH);
      cell(doc, pageLeft, doc.y, labelColW, engRowH, '', { fill: YELLOW });
      for (let i = 0; i < applianceCount; i++) {
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, engRowH, `Engineer: ${data.engineerName || ''}`, {
          fill: YELLOW, fontSize: 6.5, bold: true, valign: 'middle'
        });
      }
      doc.y += engRowH;
      ensureSpace(doc, defectH);
      cell(doc, pageLeft, doc.y, labelColW, defectH, '', {});
      for (let i = 0; i < applianceCount; i++) {
        const txt = (appliances[i] || {}).remedialWork || 'None';
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, defectH, txt, { fontSize: 6.5, valign: 'top' });
      }
      doc.y += defectH;

      // ---------- Sign-off ----------
      ensureSpace(doc, 90);
      const signBlockY = doc.y;
      const signLeftW = contentWidth * 0.55;
      const signRightW = contentWidth - signLeftW;

      const sigRowH = 28;
      cell(doc, pageLeft, signBlockY, signLeftW, sigRowH, 'Registered Engineer Signature:', { bold: true, fontSize: 8, valign: 'middle' });
      if (data.signature && data.signature.startsWith('data:image')) {
        try {
          const base64 = data.signature.split(',')[1];
          const buf = Buffer.from(base64, 'base64');
          doc.image(buf, pageLeft + 175, signBlockY + 2, { width: 100, height: 24 });
        } catch (e) { /* ignore */ }
      }
      cell(doc, pageLeft + signLeftW, signBlockY, signRightW, sigRowH * 3, 'NEXT INSPECTION DUE BEFORE:', {
        bold: true, fontSize: 12, align: 'center', valign: 'middle'
      });
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#000')
        .text(addMonths(data.inspectionDate, 12), pageLeft + signLeftW, signBlockY + sigRowH * 3 - 20, {
          width: signRightW, align: 'center'
        });

      cell(doc, pageLeft, signBlockY + sigRowH, signLeftW, sigRowH, `Print Name: ${data.printName || ''}`, { bold: true, fontSize: 8, valign: 'middle' });
      cell(doc, pageLeft, signBlockY + sigRowH * 2, signLeftW, sigRowH, `Date: ${formatDate(data.inspectionDate)}`, { bold: true, fontSize: 8, valign: 'middle' });

      doc.y = signBlockY + sigRowH * 3 + 4;

      // ---------- Footer ----------
      const footH = 18;
      ensureSpace(doc, footH);
      cell(doc, pageLeft, doc.y, contentWidth, footH, 'THE NEXT GAS SAFETY CHECK MUST BE COMPLETED WITHIN THE NEXT 12 MONTHS', {
        fill: BLACK, color: '#ffffff', bold: true, align: 'center', fontSize: 9, valign: 'middle'
      });
      doc.y += footH;

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildGasCheckPdf };
