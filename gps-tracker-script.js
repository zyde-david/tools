// ============================================================
// GPS Location Tracker — Google Apps Script Backend
// Deploy as: Web App → Execute as: Me → Who has access: Anyone
// ============================================================

// ---------- CONFIG ----------
const SPREADSHEET_ID = ''; // ← paste your Google Sheet ID here
const PHOTO_FOLDER_NAME = 'GPS_Tracker_Photos';

// ---------- SHEET COLUMNS (header row) ----------
const HEADERS = [
  'id', 'moo', 'houseNo', 'owner', 'lat', 'lng',
  'accuracy', 'status', 'updatedBy', 'timestamp', 'notes', 'photoUrl'
];

// ============================================================
// doGet — serve HTML or handle ?action= queries
// ============================================================
function doGet(e) {
  const action = e?.parameter?.action;

  if (action === 'getMasterData') {
    return ContentService
      .createTextOutput(JSON.stringify(getMasterData()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  // Default: return status JSON (HTML is hosted externally on GitHub Pages)
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok', message: 'GPS Tracker API is running' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// doPost — saveRecord (called from HTML via google.script.run)
// ============================================================
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const result = saveRecord(payload);
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================================
// getMasterData — read all rows from Sheet
// ============================================================
function getMasterData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('houses') || ss.getSheets()[0];
  const data = sheet.getDataRange().getValues();

  if (data.length < 2) return []; // header only or empty

  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const results = [];

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (row.every(c => c === '' || c === null || c === undefined)) continue; // skip blank rows

    const obj = {};
    headers.forEach((h, idx) => { obj[h] = row[idx] !== undefined ? String(row[idx]) : ''; });

    // Ensure required fields exist
    results.push({
      id: obj.id || `${obj.moo || ''}-${obj.houseno || ''}`,
      moo: obj.moo || '',
      houseNo: obj.houseno || obj['house no'] || '',
      owner: obj.owner || '',
      lat: obj.lat || '',
      lng: obj.lng || '',
      status: obj.status || (obj.lat ? 'COMPLETED' : 'PENDING'),
      updatedBy: obj.updatedby || obj['updated by'] || '',
      timestamp: obj.timestamp || '',
      notes: obj.notes || '',
      photoUrl: obj.photourl || obj['photo url'] || ''
    });
  }

  return results;
}

// ============================================================
// saveRecord — upsert by moo+houseNo
// ============================================================
function saveRecord(payload) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('houses') || ss.getSheets()[0];

  // Ensure headers exist
  const existingHeaders = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
  if (existingHeaders.length === 0 || existingHeaders[0] === '') {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
  }

  // Handle photo upload to Drive
  let photoUrl = '';
  if (payload.photoBase64) {
    try {
      photoUrl = savePhotoToDrive(payload.photoBase64, payload.moo, payload.houseNo);
    } catch (photoErr) {
      Logger.log('Photo upload failed: ' + photoErr.message);
    }
  }

  // Find existing row by moo+houseNo
  const data = sheet.getDataRange().getValues();
  const headers = data[0].map(h => String(h).trim().toLowerCase());
  const mooCol = headers.indexOf('moo');
  const houseCol = headers.indexOf('houseno');
  const statusCol = headers.indexOf('status');
  const latCol = headers.indexOf('lat');
  const lngCol = headers.indexOf('lng');
  const updatedByCol = headers.indexOf('updatedby');
  const timestampCol = headers.indexOf('timestamp');
  const notesCol = headers.indexOf('notes');
  const photoCol = headers.indexOf('photourl');

  let targetRow = -1;
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][mooCol]).trim() === String(payload.moo).trim() &&
        String(data[i][houseCol]).trim() === String(payload.houseNo).trim()) {
      targetRow = i + 1; // 1-indexed
      break;
    }
  }

  const timestamp = payload.timestamp || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

  if (targetRow > 0) {
    // UPDATE existing row
    const row = sheet.getRange(targetRow, 1, 1, headers.length).getValues()[0];
    if (latCol >= 0) row[latCol] = payload.lat || '';
    if (lngCol >= 0) row[lngCol] = payload.lng || '';
    if (statusCol >= 0) row[statusCol] = 'COMPLETED';
    if (updatedByCol >= 0) row[updatedByCol] = payload.name || '';
    if (timestampCol >= 0) row[timestampCol] = timestamp;
    if (notesCol >= 0) row[notesCol] = payload.notes || '';
    if (photoCol >= 0 && photoUrl) row[photoCol] = photoUrl;
    sheet.getRange(targetRow, 1, 1, headers.length).setValues([row]);
  } else {
    // INSERT new row
    const newRow = new Array(headers.length).fill('');
    const id = `${payload.moo || ''}-${payload.houseNo || ''}`;
    const map = {
      'id': id, 'moo': payload.moo, 'houseno': payload.houseNo,
      'owner': 'เพิ่มใหม่โดย อสม.', 'lat': payload.lat, 'lng': payload.lng,
      'accuracy': payload.accuracy, 'status': 'COMPLETED',
      'updatedby': payload.name, 'timestamp': timestamp,
      'notes': payload.notes || '', 'photourl': photoUrl
    };
    headers.forEach((h, idx) => { if (map[h] !== undefined) newRow[idx] = map[h]; });
    sheet.appendRow(newRow);
  }

  // Auto-resize columns for readability
  sheet.autoResizeColumns(1, headers.length);

  return {
    success: true,
    message: targetRow > 0 ? 'อัปเดตพิกัดสำเร็จ' : 'บันทึกพิกัดใหม่สำเร็จ',
    photoUrl: photoUrl || null
  };
}

// ============================================================
// savePhotoToDrive — upload base64 image to Drive folder
// ============================================================
function savePhotoToDrive(base64Data, moo, houseNo) {
  // Strip data URL prefix
  const base64 = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const blob = Utilities.newBlob(Utilities.base64Decode(base64), 'image/jpeg', `house_${moo}_${houseNo}_${Date.now()}.jpg`);

  // Get or create folder
  let folder;
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  if (folders.hasNext()) {
    folder = folders.next();
  } else {
    folder = DriveApp.createFolder(PHOTO_FOLDER_NAME);
  }

  const file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return `https://drive.google.com/uc?id=${file.getId()}`;
}

// ============================================================
// getStats — optional helper for admin dashboard
// ============================================================
function getStats() {
  const data = getMasterData();
  const total = data.length;
  const completed = data.filter(r => r.status === 'COMPLETED' || r.lat).length;
  return {
    total,
    completed,
    pending: total - completed,
    percent: total > 0 ? Math.round((completed / total) * 100) : 0
  };
}
