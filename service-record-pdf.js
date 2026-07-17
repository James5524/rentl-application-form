// Builds a Maintenance/Service Check List PDF from a service-record
// submission, using pdfkit (pure JS - same approach as gas-check-pdf.js, kept
// reliable on Render's free tier). Styled to match the CP12 Gas Safety Record
// PDF (black rounded title, yellow bold-label engineer box) but modelled on
// James's real "Maintenance/Service Check List" (Form Ref: REGP65) template -
// single appliance per visit, structured combustion readings, a 2-column
// Yes/No/N/A checklist for Appliance Checks and Safety Checks, a Findings
// section, and a Registered Engineer sign-off block.

const PDFDocument = require('pdfkit');
const path = require('path');

const PAGE_MARGIN = 26;
const LOGO_PATH = path.join(__dirname, 'assets', 'gas-safe-logo.jpeg');

const BLACK = '#000000';
const YELLOW = '#fff200';
const BORDER = '#000000';

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
}

// Yes/No/N/A values all render as a single letter in a small box, except N/A
// which renders in full (otherwise "N/A" and "No" would both just show "N").
function ynValue(value) {
  const v = String(value || '').trim();
  if (!v) return '';
  const upper = v.toUpperCase();
  if (upper === 'N/A' || upper === 'NA') return 'N/A';
  return upper.charAt(0);
}

function ensureSpace(doc, needed) {
  const bottom = doc.page.height - doc.page.margins.bottom;
  if (doc.y + needed > bottom) {
    doc.addPage();
    return true;
  }
  return false;
}

// Draws a bordered cell with text - see gas-check-pdf.js for the full
// rationale on why cell() always saves/restores doc.x/doc.y (pdfkit's
// doc.text() mutates them as a side effect, which breaks loops that draw
// several cells at the same y).
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

// Bold label immediately followed by a normal-weight value on the same line.
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

// Full-width black bar used for section headings.
function sectionBar(doc, text, h = 15) {
  ensureSpace(doc, h + 2);
  const x = doc.page.margins.left;
  const w = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  cell(doc, x, doc.y, w, h, text, { fill: BLACK, color: '#ffffff', bold: true, fontSize: 9.5, valign: 'middle' });
  doc.y += h;
}

// One row of a 2-column Yes/No/N/A checklist: [label, value] pairs, left and
// right. Either side can be omitted (pass null) to leave it blank, for an
// odd-numbered list.
function twoColCheckRow(doc, pageLeft, colW, y, h, left, right) {
  const valW = 24;
  if (left) {
    cell(doc, pageLeft, y, colW - valW, h, left[0], { fontSize: 6.8, valign: 'middle' });
    cell(doc, pageLeft + colW - valW, y, valW, h, ynValue(left[1]), { fontSize: 8, bold: true, align: 'center', valign: 'middle' });
  } else {
    cell(doc, pageLeft, y, colW, h, '', {});
  }
  if (right) {
    cell(doc, pageLeft + colW, y, colW - valW, h, right[0], { fontSize: 6.8, valign: 'middle' });
    cell(doc, pageLeft + colW * 2 - valW, y, valW, h, ynValue(right[1]), { fontSize: 8, bold: true, align: 'center', valign: 'middle' });
  } else {
    cell(doc, pageLeft + colW, y, colW, h, '', {});
  }
}

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

const SAFETY_CHECK_ITEMS = [
  ['ventilation', 'Ventilation'],
  ['flueTermination', 'Flue Termination'],
  ['smokePelletFlueFlow', 'Smoke pellet flue flow test'],
  ['smokeMatchSpillage', 'Smoke match spillage test'],
  ['safetyDevice', 'Safety device'],
  ['otherRegulations', 'Other (Regulations etc.)']
];

const FINDINGS_ITEMS = [
  ['safeToUse', 'Is the installation and appliance safe to use?'],
  ['warningNoticeRaised', 'If NO, has a warning notice been raised and warning labels/stickers attached?'],
  ['carriedOutToStandard', "Has the installation been carried out to the relevant standard/manufacturer's instructions?"]
];

async function buildServiceRecordPdf(data) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: PAGE_MARGIN, bufferPages: true });
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageLeft = doc.page.margins.left;
      const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const checks = data.checks || {};

      function lineHeight(text, width, fontSize) {
        doc.font('Helvetica').fontSize(fontSize);
        return doc.heightOfString(String(text || ''), { width });
      }
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
      } catch (e) { /* logo optional */ }

      doc.y = PAGE_MARGIN + 14;

      // ---------- Title box ----------
      const titleH = 34;
      const titleW = contentWidth - 62;
      const titleY = doc.y;
      const titleText = 'MAINTENANCE / SERVICE CHECK LIST';
      doc.roundedRect(pageLeft, titleY, titleW, titleH, 8).fill(BLACK);
      doc.font('Helvetica-Bold').fontSize(15);
      const titleTextH = doc.heightOfString(titleText, { width: titleW - 8 });
      const titlePadY = Math.max(1, (titleH - titleTextH) / 2);
      doc.fillColor('#ffffff')
        .text(titleText, pageLeft + 4, titleY + titlePadY, { width: titleW - 8, align: 'center' });
      doc.fillColor('#000000');
      doc.y = titleY + titleH + 12;

      // ---------- Disclaimer ----------
      const disclaimerText = "This is a maintenance/service record only. It does not constitute a Landlord Gas Safety Record (CP12) and must not be used as one.";
      const disclaimerH = lineHeight(disclaimerText, contentWidth, 6.5);
      doc.font('Helvetica-Oblique').fontSize(6.5).fillColor('#333')
        .text(disclaimerText, pageLeft, doc.y, { width: contentWidth, align: 'center' });
      doc.fillColor('#000');
      doc.y += disclaimerH + 2;

      // ---------- Serial number ----------
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#000')
        .text(`SERIAL NO: ${data.serialNo || ''}`, pageLeft, doc.y, { width: contentWidth, align: 'center' });
      doc.y += 12;

      // ---------- Company / Engineer box (left, yellow) + Inspection Address box (right) ----------
      const companyW = contentWidth * 0.30;
      const rightW = contentWidth - companyW;
      const topBlockY = doc.y;

      const companyFields = [
        ['Company: ', data.companyName || 'Not provided'],
        ['Gas Safe ID Card No: ', data.gasSafeId || 'Not provided'],
        ['Engineer Name: ', data.engineerName || 'Not provided'],
        ['Engineer Email: ', data.engineerEmail || 'Not provided'],
        ['Address: ', data.companyAddress || 'Not provided'],
        ['Tel No: ', data.companyPhone || 'Not provided']
      ];
      const companyInnerW = companyW - 10;
      const companyLineHeights = companyFields.map(([label, value]) => lineHeightBold(label + value, companyInnerW, 7.5) + 4);
      const companyLinesH = companyLineHeights.reduce((a, b) => a + b, 0) + 10;

      // Right box: single "Inspection Address" box (Name / address / tel /
      // rented / work description) - matches the real paper template rather
      // than CP12's split Inspection Address + Agent/Landlord Details.
      const rHeaderH = 14;
      const rRowH = 14;
      const nameText = data.contactName || 'Not provided';
      const nameTextH = lineHeight(nameText, rightW - 8, 7.5);
      const nameRowH = Math.max(rRowH, Math.ceil(nameTextH) + 5);
      const rentedRowH = 18;
      const rightSideH = rHeaderH + nameRowH + rRowH * 3 + rentedRowH;

      const topBlockH = Math.max(companyLinesH, rightSideH);
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

      const rx = pageLeft + companyW;
      let ry = topBlockY;
      cell(doc, rx, ry, rightW, rHeaderH, 'INSPECTION ADDRESS', { fill: '#fff', bold: true, fontSize: 8, align: 'center', valign: 'middle' });
      ry += rHeaderH;

      cellLabelValue(doc, rx, ry, rightW, nameRowH, 'Name: ', data.contactName || '', { fontSize: 7.5 });
      ry += nameRowH;

      cell(doc, rx, ry, rightW, rRowH, data.addressLine1 || 'Not provided', { fontSize: 7.5, valign: 'middle' });
      ry += rRowH;
      cell(doc, rx, ry, rightW, rRowH, data.addressLine2 || '', { fontSize: 7.5, valign: 'middle' });
      ry += rRowH;
      cell(doc, rx, ry, rightW, rRowH, data.addressPostcode || '', { fontSize: 7.5, valign: 'middle' });
      ry += rRowH;

      const rentedW = 130;
      cellLabelValue(doc, rx, ry, rentedW, rentedRowH, 'Rented accommodation: ', data.accommodationRented || '', { fontSize: 7.5 });
      cellLabelValue(doc, rx + rentedW, ry, rightW - rentedW, rentedRowH, 'Work Description: ', data.workDescription || '', { fontSize: 7.5 });
      ry += rentedRowH;

      doc.y = topBlockY + topBlockH + 3;

      // ---------- Appliance details + combustion readings ----------
      sectionBar(doc, 'APPLIANCE DETAILS & COMBUSTION READINGS');
      const halfCW = contentWidth / 2;
      const miniHeaderH = 13;
      cell(doc, pageLeft, doc.y, halfCW, miniHeaderH, 'APPLIANCE DETAILS', { fill: '#fff', bold: true, fontSize: 7.5, align: 'center', valign: 'middle' });
      cell(doc, pageLeft + halfCW, doc.y, halfCW, miniHeaderH, 'COMBUSTION READINGS', { fill: '#fff', bold: true, fontSize: 7.5, align: 'center', valign: 'middle' });
      doc.y += miniHeaderH;

      const applianceRowH = 15;
      const applianceRows = [
        ['Make: ', data.applianceMake || '', 'CO:CO2 Ratio: ', data.coco2Ratio || ''],
        ['Type: ', data.applianceType || '', 'CO2 %: ', data.co2Percent || ''],
        ['Model: ', data.applianceModel || '', 'CO ppm: ', data.coPpm || ''],
        ['Location: ', data.applianceLocation || '', 'Gas Rate (kW): ', data.gasRateKw || '']
      ];
      applianceRows.forEach(([l1, v1, l2, v2]) => {
        cellLabelValue(doc, pageLeft, doc.y, halfCW, applianceRowH, l1, v1, { fontSize: 7.5 });
        cellLabelValue(doc, pageLeft + halfCW, doc.y, halfCW, applianceRowH, l2, v2, { fontSize: 7.5 });
        doc.y += applianceRowH;
      });
      doc.y += 3;

      // ---------- Appliance checks (2-column Yes/No/N/A grid) ----------
      sectionBar(doc, 'APPLIANCE CHECKS');
      const checkColW = contentWidth / 2;
      const checkRowH = 15;
      for (let i = 0; i < APPLIANCE_CHECK_ITEMS.length; i += 2) {
        const [leftKey, leftLabel] = APPLIANCE_CHECK_ITEMS[i];
        const rightItem = APPLIANCE_CHECK_ITEMS[i + 1];
        ensureSpace(doc, checkRowH);
        twoColCheckRow(doc, pageLeft, checkColW, doc.y, checkRowH,
          [leftLabel, checks[leftKey]],
          rightItem ? [rightItem[1], checks[rightItem[0]]] : null
        );
        doc.y += checkRowH;
      }

      // ---------- Safety checks ----------
      // Note: these keys live directly on `data` (data.ventilation etc.), not
      // under data.checks like the appliance-checks grid above.
      sectionBar(doc, 'SAFETY CHECKS');
      for (let i = 0; i < SAFETY_CHECK_ITEMS.length; i += 2) {
        const [leftKey, leftLabel] = SAFETY_CHECK_ITEMS[i];
        const rightItem = SAFETY_CHECK_ITEMS[i + 1];
        ensureSpace(doc, checkRowH);
        twoColCheckRow(doc, pageLeft, checkColW, doc.y, checkRowH,
          [leftLabel, data[leftKey]],
          rightItem ? [rightItem[1], data[rightItem[0]]] : null
        );
        doc.y += checkRowH;
      }

      const safetyExtraRowH = 16;
      ensureSpace(doc, safetyExtraRowH);
      cellLabelValue(doc, pageLeft, doc.y, contentWidth, safetyExtraRowH, 'Working Pressure: ', data.workingPressure || '', { fontSize: 7.5 });
      doc.y += safetyExtraRowH;

      ensureSpace(doc, safetyExtraRowH);
      cellLabelValue(doc, pageLeft, doc.y, halfCW, safetyExtraRowH, 'Gas Tightness Test Performed: ', data.gasTightnessPerformed || '', { fontSize: 7.5 });
      cellLabelValue(doc, pageLeft + halfCW, doc.y, halfCW, safetyExtraRowH, 'Pass or Fail: ', data.gasTightnessResult || '', { fontSize: 7.5 });
      doc.y += safetyExtraRowH;

      // ---------- Findings ----------
      sectionBar(doc, 'FINDINGS');
      FINDINGS_ITEMS.forEach(([key, label]) => {
        const valW = 26;
        const textH = lineHeight(label, contentWidth - valW - 8, 6.8);
        const rowH = Math.max(16, Math.ceil(textH) + 6);
        ensureSpace(doc, rowH);
        cell(doc, pageLeft, doc.y, contentWidth - valW, rowH, label, { fontSize: 6.8, valign: 'middle' });
        cell(doc, pageLeft + contentWidth - valW, doc.y, valW, rowH, ynValue(data[key]), { fontSize: 8, bold: true, align: 'center', valign: 'middle' });
        doc.y += rowH;
      });

      // ---------- Necessary remedial work required ----------
      sectionBar(doc, 'NECESSARY REMEDIAL WORK REQUIRED');
      const remedialText = data.remedialWorkRequired || '';
      const remedialTextH = lineHeight(remedialText, contentWidth - 8, 7);
      const remedialBoxH = Math.max(24, Math.ceil(remedialTextH) + 8);
      ensureSpace(doc, remedialBoxH);
      cell(doc, pageLeft, doc.y, contentWidth, remedialBoxH, remedialText, { fontSize: 7, valign: 'top' });
      doc.y += remedialBoxH;
      doc.y += 3;

      // ---------- Sign-off: engineer (left), Next Service Due (right) ----------
      // Customer print name/signature were removed at James's request - the
      // engineer's sign-off is the only one recorded on this form.
      const sigRowH = 18;
      const footH = 18;
      const signBlockH = sigRowH * 3;
      ensureSpace(doc, signBlockH + 4 + footH);
      const signBlockY = doc.y;
      const signLeftW = contentWidth * 0.55;
      const signRightW = contentWidth - signLeftW;

      // Engineer block
      const engY = signBlockY;
      cell(doc, pageLeft, engY, signLeftW, sigRowH, 'Registered Engineer Signature:', { bold: true, fontSize: 8, valign: 'middle' });
      if (data.engineerSignature && data.engineerSignature.startsWith('data:image')) {
        try {
          const base64 = data.engineerSignature.split(',')[1];
          const buf = Buffer.from(base64, 'base64');
          doc.image(buf, pageLeft + 170, engY + 1, { width: 90, height: 16 });
        } catch (e) { /* ignore */ }
      }
      cellLabelValue(doc, pageLeft, engY + sigRowH, signLeftW, sigRowH, 'Print Name: ', data.engineerPrintName || '', { fontSize: 8 });
      cellLabelValue(doc, pageLeft, engY + sigRowH * 2, signLeftW, sigRowH, 'Date: ', formatDate(data.inspectionDate), { fontSize: 8 });

      // Next service due - centered as one group, both vertically and
      // horizontally within its box (same technique used on the CP12 form).
      cell(doc, pageLeft + signLeftW, signBlockY, signRightW, signBlockH, '', {});
      const nextLabel = 'NEXT SERVICE DUE:';
      const nextDate = formatDate(data.nextServiceDue);
      const nextInnerW = signRightW - 12;
      doc.font('Helvetica-Bold').fontSize(11);
      const nextLabelH = doc.heightOfString(nextLabel, { width: nextInnerW });
      const nextDateH = doc.heightOfString(nextDate, { width: nextInnerW });
      const nextGap = 6;
      const nextTotalH = nextLabelH + nextGap + nextDateH;
      const nextStartY = signBlockY + (signBlockH - nextTotalH) / 2;
      doc.fillColor('#000')
        .text(nextLabel, pageLeft + signLeftW, nextStartY, { width: signRightW, align: 'center' });
      doc.text(nextDate, pageLeft + signLeftW, nextStartY + nextLabelH + nextGap, { width: signRightW, align: 'center' });

      doc.y = signBlockY + signBlockH + 4;

      // ---------- Footer ----------
      cell(doc, pageLeft, doc.y, contentWidth, footH, 'THIS IS A MAINTENANCE/SERVICE RECORD ONLY - NOT A LANDLORD GAS SAFETY RECORD (CP12)', {
        fill: BLACK, color: '#ffffff', bold: true, align: 'center', fontSize: 8, valign: 'middle'
      });
      doc.y += footH;

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildServiceRecordPdf };
