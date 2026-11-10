// Standalone project owned by the family. Records confirmations, never charges a card.
const DASHBOARD_ID = '1Iu8teB0ds5lzNVZwb-V353WnEjzlSU4anMAcMZJ0LY4';
const PAYMENT_SHEET = '일정';
const LEDGER_SHEET = '결제기록';

function initializePayments() {
  const ss = SpreadsheetApp.openById(DASHBOARD_ID);
  const props = PropertiesService.getScriptProperties();
  props.setProperty('SPREADSHEET_ID', ss.getId());
  if (!props.getProperty('FAMILY_KEY')) props.setProperty('FAMILY_KEY', Utilities.getUuid() + Utilities.getUuid());
  let ledgerId = props.getProperty('LEDGER_ID');
  if (!ledgerId) {
    const ledgerFile = SpreadsheetApp.create('우리 집 대시보드 · 가족 결제기록');
    const ledger = ledgerFile.getSheets()[0];
    ledger.setName(LEDGER_SHEET);
    ledger.appendRow(['기록ID','일정ID','일정','결제일','묶음시작일','횟수','금액','결제방법','기록시각']);
    ledger.setFrozenRows(1);
    props.setProperty('LEDGER_ID',ledgerFile.getId());
  }
  console.log('가족 연결 코드: ' + props.getProperty('FAMILY_KEY'));
  console.log('연결 코드는 공개 저장소에 올리지 말고 가족 기기에만 입력하세요.');
}

function doGet() { return json_({ok:true,service:'dashboard-payments-v1'}); }

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    if (!props.getProperty('FAMILY_KEY') || body.key !== props.getProperty('FAMILY_KEY')) return json_({ok:false,error:'연결 코드를 확인해줘.'});
    if (body.action === 'tts') return json_(synthesizeDashboardVoice_(body,props));
    // A deployed web app uses the bound spreadsheet, never a caller-provided ID.
    const ss = SpreadsheetApp.openById(props.getProperty('SPREADSHEET_ID'));
    if (!ss || ss.getId() !== props.getProperty('SPREADSHEET_ID')) throw new Error('저장 연결을 확인해줘.');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const sheet = ss.getSheetByName(PAYMENT_SHEET);
      const rows = sheet.getDataRange().getValues();
      const tz = ss.getSpreadsheetTimeZone();
      const keyDate = value => value instanceof Date ? Utilities.formatDate(value,tz,'yyyy-MM-dd') : /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : '';
      const receipts = () => sheet.getDataRange().getValues().slice(1).filter(r => r[12] && r[14] && r[15]).map(r => ({id:String(r[12]),packageStart:keyDate(r[14]),paidOn:keyDate(r[15])}));
      if (body.action === 'list') return json_({ok:true,receipts:receipts()});
      if (body.action !== 'record' || !/^[A-Za-z0-9-]{16,100}$/.test(body.requestId || '')) throw new Error('결제 기록 요청을 다시 확인해줘.');
      const index = rows.findIndex((r,i) => i > 0 && String(r[12]) === body.id);
      if (index < 1) throw new Error('일정표에서 결제 대상을 찾지 못했어.');
      const row = rows[index], start = String(body.packageStart || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || isNaN(Date.parse(start + 'T00:00:00+09:00')) || Utilities.formatDate(new Date(start + 'T00:00:00+09:00'),tz,'yyyy-MM-dd') !== start) throw new Error('새 묶음 시작일을 확인해줘.');
      if (!Number.isInteger(Number(row[13])) || Number(row[13]) < 1) throw new Error('선결제 묶음 설정을 먼저 확인해줘.');
      const currentStart = keyDate(row[14]);
      if (currentStart && start < currentStart) throw new Error('더 최근 결제 기록이 있어. 새로고침해줘.');
      const ledger = props.getProperty('LEDGER_ID') && SpreadsheetApp.openById(props.getProperty('LEDGER_ID')).getSheetByName(LEDGER_SHEET);
      if (!ledger) throw new Error('먼저 결제기록 초기 설정을 실행해줘.');
      const prior = ledger.getDataRange().getValues().find((r,i) => i > 0 && (r[0] === body.requestId || String(r[1]) === body.id && keyDate(r[4]) === start));
      if (prior) {
        if (String(prior[1]) !== body.id || keyDate(prior[4]) !== start) throw new Error('이 요청번호는 다른 결제에 사용됐어. 다시 열어줘.');
        sheet.getRange(index + 1,15,1,2).setValues([[keyDate(prior[4]),keyDate(prior[3])]]);
        return json_({ok:true,alreadyRecorded:true,receipts:receipts()});
      }
      if (start === currentStart && row[15]) return json_({ok:true,alreadyRecorded:true,receipts:receipts()});
      const paidOn = Utilities.formatDate(new Date(),tz,'yyyy-MM-dd');
      if (start > Utilities.formatDate(new Date(Date.now() + 70 * 86400000),tz,'yyyy-MM-dd')) throw new Error('묶음 시작일이 너무 멀어. 일정을 확인해줘.');
      const amount = body.amount === '' || body.amount == null ? '' : Number(body.amount);
      if (amount !== '' && (!Number.isInteger(amount) || amount < 0 || amount > 10000000)) throw new Error('결제 금액을 확인해줘.');
      const method = ['카드','현금','계좌이체','미입력'].includes(body.method) ? body.method : '미입력';
      // Plain ISO strings retain the sheet's existing date formatting and parse in the dashboard.
      ledger.appendRow([body.requestId,String(row[12]),String(row[2]),paidOn,start,row[13],amount,method,new Date()]);
      sheet.getRange(index + 1,15,1,2).setValues([[start,paidOn]]);
      SpreadsheetApp.flush();
      return json_({ok:true,receipts:receipts()});
    } finally { lock.releaseLock(); }
  } catch (error) { return json_({ok:false,error:error.message || '저장하지 못했어. 다시 시도해줘.'}); }
}
function json_(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
