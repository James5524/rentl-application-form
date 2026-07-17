// Builds a Landlord Gas Safety Record (CP12-style) PDF from a gas-check
// submission, using pdfkit (pure JS, no LibreOffice/headless-browser needed -
// keeps this reliable on Render's free tier). Layout is drawn to match the
// real Gas Safe Register "Landlord/Homeowner Gas Safety Record" certificate
// James supplied as a reference, sized to fill a single A4 page.

const PDFDocument = require('pdfkit');
const path = require('path');

const PAGE_MARGIN = 26;
const LOGO_PATH = path.join(__dirname, 'assets', 'gas-safe-logo.jpeg');
const APPLIANCE_SLOTS = 4; // always show 4 columns, regardless of how many were filled in

const BLACK = '#000000';
const YELLOW = '#fff200'; // single shared yellow for every highlighted box
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
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
  }
  if (text !== undefined && text !== null && text !== '') {
    const font = italic ? 'Helvetica-Oblique' : (bold ? 'Helvetica-Bold' : 'Helvetica');
    doc.font(font).fontSize(fontSize).fillColor(color);
    const padX = 4;
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

// Like cell(), but draws a bold label immediately followed by a
// normal-weight value on the same line (e.g. "Print Name: " in bold, then
// whatever the engineer typed in regular weight) - used wherever a label
// needs to read bold and the entered value should not.
function cellLabelValue(doc, x, y, w, h, label, value, opts = {}) {
  const savedX = doc.x, savedY = doc.y;
  const { fontSize = 7.5, border = true } = opts;
  if (border) {
    doc.rect(x, y, w, h).lineWidth(0.5).strokeColor(BORDER).stroke();
  }
  const padX = 4;
  doc.font('Helvetica-Bold').fontSize(fontSize);
  const combinedH = doc.heightOfString(label + value, { width: w - padX * 2 });
  const padY = Math.max(1, (h - combinedH) / 2);
  doc.fillColor('#000')
    .text(label, x + padX, y + padY, { continued: true, width: w - padX * 2 });
  doc.font('Helvetica').text(value);
  doc.fillColor('#000000');
  doc.x = savedX;
  doc.y = savedY;
}

// Full-width black bar used for section headings ("GAS INSTALLATION PIPEWORK" etc.)
function sectionBar(doc, text, h = 15) {
  ensureSpace(doc, h + 2);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  cell(doc, x, doc.y, w, h, text, { fill: BLACK, color: '#ffffff', bold: true, fontSize: 9.5, valign: 'middle' });
  doc.y += h;
}

// Yellow "Appliance 1 / 2 / 3 / 4" header row, reused above both the main
// specifics grid and the defects/remedial-work text boxes.
function applianceHeaderRow(doc, labelColW, applW, h) {
  ensureSpace(doc, h);
  cell(doc, doc.page.margins.left, doc.y, labelColW, h, '', { fill: '#fff' });
  for (let i = 0; i < APPLIANCE_SLOTS; i++) {
    cell(doc, doc.page.margins.left + labelColW + applW * i, doc.y, applW, h, `Appliance ${i + 1}`, {
      fill: YELLOW, bold: true, align: 'center', fontSize: 8, valign: 'middle'
    });
  }
  doc.y += h;
}

const APPLIANCE_ROWS = [
  { key: 'location', label: 'Location of appliance' },
  { key: 'type', label: 'Appliance type' },
  { key: 'make', label: 'Appliance make' },
  { key: 'model', label: 'Appliance model' },
  { key: 'flueType', label: 'Type of flue/outlet (OF/RS/FL)' },
  { key: 'pressure', label: 'Working pressure (mbar)' },
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
      // Same as lineHeight() but measures with the bold font - needed for any
      // text that's actually rendered bold, since bold characters are wider
      // and can wrap onto more lines than the regular font would suggest
      // (this mismatch was the cause of the engineer box text overlapping).
      function lineHeightBold(text, width, fontSize) {
        doc.font('Helvetica-Bold').fontSize(fontSize);
        return doc.heightOfString(String(text || ''), { width });
      }

      // ---------- Top strip: verification line + logo ----------
      doc.font('Helvetica').fontSize(7).fillColor('#000')
        .text('To confirm the validity of the Registered Gas Engineer please contact Gas Safe on 0800 408 5577 or www.gassaferegister.co.uk',
          pageLeft, doc.y, { width: contentWidth - 62, align: 'center' });

      try {
        doc.image(LOGO_PATH, pageLeft + contentWidth - 56, PAGE_MARGIN - 4, { width: 56 });
      } catch (e) { /* logo optional - don't fail PDF generation if the asset is missing */ }

      doc.y = PAGE_MARGIN + 14;

      // ---------- Title box ----------
      const titleH = 34;
      const titleW = contentWidth - 62;
      const titleY = doc.y;
      const titleText = 'LANDLORD / HOMEOWNER GAS SAFETY RECORD';
      doc.roundedRect(pageLeft, titleY, titleW, titleH, 8).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(15);
      const titleTextH = doc.heightOfString(titleText, { width: titleW - 8 });
      const titlePadY = Math.max(1, (titleH - titleTextH) / 2);
      doc.fillColor('#ffffff')
        .text(titleText, pageLeft + 4, titleY + titlePadY, { width: titleW - 8, align: 'center' });
      doc.fillColor('#000000');
      // Extra clearance below the title so the disclaimer text doesn't run
      // under the logo (logo is drawn top-right and its bottom edge sits
      // lower than the title box because of its aspect ratio).
      doc.y = titleY + titleH + 12;

      // ---------- Disclaimer ----------
      const disclaimerText = 'This form allows for the recording of results of checks as defined by the Gas Safety (Installation and Use) Regulations. Information recorded on this form does not confirm that the installation was installed by a Gas Safe registered business or that the installation complies with relevant Building Regulations.';
      const disclaimerH = lineHeight(disclaimerText, contentWidth, 6.5);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#333')
        .text(disclaimerText, pageLeft, doc.y, { width: contentWidth, align: 'center' });
      doc.fillColor('#000');
      doc.y += disclaimerH + 2;

      // ---------- Serial number - centered, directly below the disclaimer ----------
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000')
        .text(`SERIAL NO: ${data.serialNo || ''}`, pageLeft, doc.y, { width: contentWidth, align: 'center' });
      doc.y += 12;

      // ---------- Company / Engineer box (left, yellow) + Inspection/Agent box (right) ----------
      const companyW = contentWidth * 0.30;
      const rightW = contentWidth - companyW;
      const topBlockY = doc.y;

      // Each line is [bold label, regular value] so the label reads bold and
      // whatever the engineer typed reads in normal weight.
      const companyFields = [
        ['Company: ', data.companyName || 'Not provided'],
        ['Gas Safe ID Card No: ', data.gasSafeId || 'Not provided'],
        ['Engineer Name: ', data.engineerName || 'Not provided'],
        ['Engineer Email: ', data.engineerEmail || 'Not provided'],
        ['Address: ', data.companyAddress || 'Not provided'],
        ['Tel No: ', data.companyPhone || 'Not provided']
      ];
      const companyInnerW = companyW - 10;
      // Measure with the bold font (an upper bound - the actual line is part
      // bold/part regular, which is never wider) so the box is never too short.
      const companyLineHeights = companyFields.map(([label, value]) => lineHeightBold(label + value, companyInnerW, 7.5) + 4);
      const companyLinesH = companyLineHeights.reduce((a, b) => a + b, 0) + 10;

      // --- right box sizing: Inspection address / Agent-landlord details ---
      const halfW = rightW / 2;
      const headerH = 14;
      const rowH = 14;
      // Address line 1 (both sides, not bold). The landlord name text can be
      // long enough to wrap onto two lines (e.g. "{name} C/O RENTL BY JGLA
      // LTD") - measure it and grow just this row so the second line doesn't
      // spill past the cell border.
      const landlordText = data.landlordName || RENTL_DETAILS.name;
      const landlordTextH = lineHeight(landlordText, halfW - 8, 7.5);
      const row1H = Math.max(rowH, Math.ceil(landlordTextH) + 5);
      const rentedRowHBase = 16;
      const rightSideH = headerH + row1H + rowH * 3 + rentedRowHBase;

      // The yellow engineer box and the address/landlord boxes must end at
      // the same y so their bottom borders line up. Whichever side is
      // naturally shorter gets stretched to match the taller one - the
      // yellow box grows via blank fill, the right side grows via its last
      // row (Is accommodation rented / No. of appliances).
      const topBlockH = Math.max(companyLinesH, rightSideH);
      const rentedRowH = rentedRowHBase + (topBlockH - rightSideH);
      const companyH = topBlockH;

      doc.rect(pageLeft, topBlockY, companyW, companyH).fill(YELLOW);
      doc.rect(pageLeft, topBlockY, companyW, companyH).lineWidth(0.5).strokeColor(BORDER).stroke();
      let cy = topBlockY + 5;
      companyFields.forEach(([label, value], i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#000')
          .text(label, pageLeft + 5, cy, { continued: true, width: companyInnerW });
        doc.font('Helvetica').text(value);
        cy += companyLineHeights[i];
      });
      doc.fillColor('#000');

      // --- right box: Inspection address / Agent-landlord details ---
      const rx = pageLeft + companyW;
      let ry = topBlockY;
      cell(doc, rx, ry, halfW, headerH, 'INSPECTION ADDRESS', { fill: '#fff', bold: true, fontSize: 8, align: 'center', valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, headerH, 'AGENT/LANDLORD DETAILS', { fill: '#fff', bold: true, fontSize: 8, align: 'center', valign: 'middle' });
      ry += headerH;

      cell(doc, rx, ry, halfW, row1H, data.addressLine1 || 'Not provided', { fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, row1H, landlordText, { fontSize: 7.5, valign: 'middle' });
      ry += row1H;

      // Address line 2 / town-city
      cell(doc, rx, ry, halfW, rowH, data.addressLine2 || '', { fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, RENTL_DETAILS.addressLines[0], { fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      // Postcode
      cell(doc, rx, ry, halfW, rowH, data.addressPostcode || '', { fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `${RENTL_DETAILS.addressLines[1]}, ${RENTL_DETAILS.addressLines[2]}`, { fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      cell(doc, rx, ry, halfW, rowH, 'Tel No: N/A', { fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW, ry, halfW, rowH, `Tel No: ${RENTL_DETAILS.phone}`, { fontSize: 7.5, valign: 'middle' });
      ry += rowH;

      const rentedValW = 22;
      cell(doc, rx, ry, halfW - rentedValW, rentedRowH, 'Is accommodation rented? (Y/N)', { fontSize: 7.5, valign: 'middle' });
      cell(doc, rx + halfW - rentedValW, ry, rentedValW, rentedRowH, (data.accommodationRented || '').charAt(0).toUpperCase(), {
        fontSize: 9, bold: true, align: 'center', valign: 'middle'
      });
      cell(doc, rx + halfW, ry, halfW, rentedRowH, `No. of Appliances tested: ${appliances.length || 1}`, { bold: true, fontSize: 7.5, valign: 'middle' });
      ry += rentedRowH;

      const topBlockBottom = topBlockY + topBlockH;
      doc.y = topBlockBottom + 3;

      // The top block's height is data-dependent (a long company address or
      // engineer email can wrap onto extra lines and push topBlockBottom
      // down). Everything below it has a fixed height EXCEPT the appliance
      // specifics grid, which has the most rows and can absorb a few points
      // per row without becoming unreadable. So: work out exactly how much
      // vertical space is left for that grid and size its rows to fit -
      // this guarantees the certificate always lands on one A4 page instead
      // of quietly overflowing whenever the top block grows taller than the
      // heights that were tuned for the original test data.
      const pipeH = 20;
      const sectionBarH = 15;
      const applHeaderH = 14;
      const dividerH = 4;
      const sigRowH = 20;
      const footH = 18;
      const labelColW = 150;
      const applW = (contentWidth - labelColW) / APPLIANCE_SLOTS;

      // Defect/remedial-work text is free-form and can run to 2-3 lines -
      // measure the longest entry in each section and size those boxes to
      // fit, instead of a fixed height that can clip long entries.
      function boxHeightFor(field) {
        let maxH = 0;
        for (let i = 0; i < APPLIANCE_SLOTS; i++) {
          const appl = appliances[i];
          const txt = appl ? (appl[field] || '') : '';
          if (!txt) continue;
          maxH = Math.max(maxH, lineHeight(txt, applW - 8, 6.5));
        }
        return Math.max(20, Math.ceil(maxH) + 4);
      }
      const defectBoxH = boxHeightFor('defects');
      const remedialBoxH = boxHeightFor('remedialWork');

      const gridRowCount = APPLIANCE_ROWS.filter(r => !r.divider).length;
      const dividerCount = APPLIANCE_ROWS.filter(r => r.divider).length;
      const fixedBelowGrid =
        (sectionBarH + pipeH) + // pipework
        (sectionBarH + applHeaderH + dividerCount * dividerH) + // appliance section chrome (rows added separately)
        (sectionBarH + applHeaderH + defectBoxH) + // defects
        (sectionBarH + applHeaderH + remedialBoxH) + // remedial
        (sigRowH * 3 + 4 + footH); // sign-off + footer
      const bottomLimit = doc.page.height - doc.page.margins.bottom;
      const availableForGrid = bottomLimit - doc.y - fixedBelowGrid;
      const rH = Math.max(12, Math.min(16, Math.floor(availableForGrid / gridRowCount)));

      // ---------- Gas installation pipework ----------
      sectionBar(doc, 'GAS INSTALLATION PIPEWORK', sectionBarH);
      const pipeColW = contentWidth / 4;
      const pipeItems = [
        ['Equipotential Bonding satisfactory? (Y/N)', data.equipotentialBonding],
        ['Visual Inspection satisfactory? (Y/N)', data.pipeworkVisual],
        ['Emergency Control Valve Accessible? (Y/N)', data.ecvAccessible],
        ['Gas Tightness Test satisfactory? (Y/N)', data.gasTightnessTest]
      ];
      pipeItems.forEach(([label, value], i) => {
        const x = pageLeft + pipeColW * i;
        cell(doc, x, doc.y, pipeColW - 20, pipeH, label, { fontSize: 6.5, valign: 'middle' });
        cell(doc, x + pipeColW - 20, doc.y, 20, pipeH, (value || '').charAt(0).toUpperCase(), { fontSize: 9, bold: true, align: 'center', valign: 'middle' });
      });
      doc.y += pipeH;

      // ---------- Appliance specifics ----------
      sectionBar(doc, 'APPLIANCE SPECIFICS', sectionBarH);
      applianceHeaderRow(doc, labelColW, applW, applHeaderH);

      APPLIANCE_ROWS.forEach(row => {
        if (row.divider) {
          ensureSpace(doc, dividerH);
          cell(doc, pageLeft, doc.y, contentWidth, dividerH, '', { fill: BLACK });
          doc.y += dividerH;
          return;
        }
        ensureSpace(doc, rH);
        const fill = row.barRow ? BLACK : null;
        const labelColor = row.barRow ? '#ffffff' : '#000000';
        cell(doc, pageLeft, doc.y, labelColW, rH, row.label, {
          fontSize: 6.5, bold: row.barRow, valign: 'middle', fill, color: labelColor
        });
        for (let i = 0; i < APPLIANCE_SLOTS; i++) {
          const val = (appliances[i] || {})[row.key] || '';
          cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, rH, val, {
            fontSize: 7, align: 'center', valign: 'middle', fill: row.barRow ? YELLOW : null
          });
        }
        doc.y += rH;
      });

      // ---------- Defects / remedial work ----------
      sectionBar(doc, 'DEFECT(S) DETECTED', sectionBarH);
      applianceHeaderRow(doc, labelColW, applW, applHeaderH);
      ensureSpace(doc, defectBoxH);
      cell(doc, pageLeft, doc.y, labelColW, defectBoxH, '', {});
      for (let i = 0; i < APPLIANCE_SLOTS; i++) {
        const txt = (appliances[i] || {}).defects || '';
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, defectBoxH, txt, { fontSize: 6.5, valign: 'top' });
      }
      doc.y += defectBoxH;

      sectionBar(doc, 'REMEDIAL WORK UNDERTAKEN', sectionBarH);
      applianceHeaderRow(doc, labelColW, applW, applHeaderH);
      ensureSpace(doc, remedialBoxH);
      cell(doc, pageLeft, doc.y, labelColW, remedialBoxH, '', {});
      for (let i = 0; i < APPLIANCE_SLOTS; i++) {
        const txt = (appliances[i] || {}).remedialWork || '';
        cell(doc, pageLeft + labelColW + applW * i, doc.y, applW, remedialBoxH, txt, { fontSize: 6.5, valign: 'top' });
      }
      doc.y += remedialBoxH;

      // ---------- Sign-off ----------
      // Check space for the whole block (3 sign-off rows + gap + footer) at
      // once, since it must not be split across a page break.
      ensureSpace(doc, sigRowH * 3 + 4 + footH);
      const signBlockY = doc.y;
      const signLeftW = contentWidth * 0.55;
      const signRightW = contentWidth - signLeftW;

      cell(doc, pageLeft, signBlockY, signLeftW, sigRowH, 'Registered Engineer Signature:', { bold: true, fontSize: 8, valign: 'middle' });
      if (data.signature && data.signature.startsWith('data:image')) {
        try {
          const base64 = data.signature.split(',')[1];
          const buf = Buffer.from(base64, 'base64');
          doc.image(buf, pageLeft + 170, signBlockY + 2, { width: 95, height: 16 });
        } catch (e) { /* ignore */ }
      }
      // Draw the border/box first, then center the label + date as one
      // group both vertically and horizontally within it (rather than
      // centering the label alone and placing the date at a fixed offset).
      const inspBoxH = sigRowH * 3;
      cell(doc, pageLeft + signLeftW, signBlockY, signRightW, inspBoxH, '', {});
      const inspLabel = 'NEXT INSPECTION DUE BEFORE:';
      const inspDate = formatDate(data.nextInspectionDate);
      const inspInnerW = signRightW - 12;
      doc.font('Helvetica-Bold').fontSize(11);
      const inspLabelH = doc.heightOfString(inspLabel, { width: inspInnerW });
      const inspDateH = doc.heightOfString(inspDate, { width: inspInnerW });
      const inspGap = 6;
      const inspTotalH = inspLabelH + inspGap + inspDateH;
      const inspStartY = signBlockY + (inspBoxH - inspTotalH) / 2;
      doc.fillColor('#000')
        .text(inspLabel, pageLeft + signLeftW, inspStartY, { width: signRightW, align: 'center' });
      doc.text(inspDate, pageLeft + signLeftW, inspStartY + inspLabelH + inspGap, { width: signRightW, align: 'center' });

      cellLabelValue(doc, pageLeft, signBlockY + sigRowH, signLeftW, sigRowH, 'Print Name: ', data.printName || '', { fontSize: 8 });
      cellLabelValue(doc, pageLeft, signBlockY + sigRowH * 2, signLeftW, sigRowH, 'Date: ', formatDate(data.inspectionDate), { fontSize: 8 });

      doc.y = signBlockY + sigRowH * 3 + 4;

      // ---------- Footer ----------
      cell(doc, pageLeft, doc.y, contentWidth, footH, 'THE NEXT GAS SAFETY CHECK MUST BE COMPLETED ON OR BEFORE THE NEXT INSPECTION DATE SPECIFIED ABOVE', {
        fill: BLACK, color: '#ffffff', bold: true, align: 'center', fontSize: 8, valign: 'middle'
      });
      doc.y += footH;

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildGasCheckPdf };
