const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../facilities.js');
const at = (stamp) => new Date(stamp + '+09:00');
test('gym hours distinguish weekly closure, opening boundaries and Sunday hours', () => {
  assert.match(F.info('gym',{},at('2026-10-19T12:00:00')).status,/정기휴무/);
  assert.match(F.info('gym',{},at('2026-10-14T05:59:00')).status,/시작 전/);
  assert.match(F.info('gym',{},at('2026-10-14T06:00:00')).status,/운영시간 중/);
  assert.match(F.info('gym',{},at('2026-10-14T23:00:00')).status,/운영 종료/);
  assert.match(F.info('gym',{},at('2026-10-18T18:00:00')).status,/운영 종료/);
  assert.match(F.info('gym',{},at('2026-10-18T08:59:00')).status,/시작 전/);
  assert.match(F.info('gym',{},at('2026-10-18T09:00:00')).status,/운영시간 중/);
});
test('recycling windows include overnight hours and exclude the exact closing time in Seoul', () => {
  assert.equal(F.ids[0],'recycling');
  const notes=F.info('recycling').notes;
  assert.match(notes[0][1],/종량제봉투.*상시 배출 가능/);
  assert.match(notes[1][1],/하얀색 1101호 카드.*상시 가능/);
  const allowed = stamp => F.info('recycling',{},at(stamp)).status.includes('배출 가능');
  assert.equal(allowed('2026-11-16T07:59:00'),false);
  assert.equal(allowed('2026-11-16T08:00:00'),true);
  assert.equal(allowed('2026-11-17T00:30:00'),true);
  assert.equal(allowed('2026-11-17T09:59:00'),true);
  assert.equal(allowed('2026-11-17T10:00:00'),false);
  assert.equal(allowed('2026-11-19T07:59:00'),false);
  assert.equal(allowed('2026-11-19T08:00:00'),true);
  assert.equal(allowed('2026-11-20T09:59:00'),true);
  assert.equal(allowed('2026-11-20T10:00:00'),false);
  assert.equal(allowed('2026-11-22T12:00:00'),false);
  assert.match(F.info('recycling',{},new Date('2026-11-16T23:30:00+11:00')).status,/배출 가능/);
});
test('service contacts, duties, library request and bulky waste instructions are preserved', () => {
  assert.deepEqual(F.info('office',{},at('2026-11-17T12:00:00')).phones,['02-335-2203']);
  const rental = F.info('rental',{},at('2026-11-17T12:00:00'));
  assert.deepEqual(rental.phones,['02-335-1800']);
  assert.match(rental.notes[0][1],/생업자동차.*2층 공용 세탁실/);
  assert.deepEqual(F.info('ventilation').phones,['1577-7713']);
  assert.match(F.info('library').links[0][1],/^https:\/\/docs.google.com\/forms\//);
  assert.match(F.info('library').notes[0][1],/공휴일.*휴관/);
  assert.match(F.info('recycling').notes.at(-1)[1],/지하 1층/);
});
test('offices use weekday hours and clearly distinguish out-of-hours from live availability', () => {
  assert.match(F.info('office',{},at('2026-11-17T08:59:00')).status,/시작 전/);
  assert.match(F.info('office',{},at('2026-11-17T09:00:00')).status,/운영시간 중.*요일 기준/);
  assert.match(F.info('rental',{},at('2026-11-17T18:00:00')).status,/종료/);
  assert.match(F.info('office',{},at('2026-11-21T12:00:00')).status,/휴무/);
});
test('personal membership suspension does not imply a closed gym', () => {
  const info=F.info('gym',{gym_status:'지운이 회원권 일시 중지'},at('2026-10-14T12:00:00'));
  assert.match(info.status,/운영시간 중/);
  assert.equal(info.membership,'지운이 회원권 이용 가능 · 운동 재개');
  assert.equal(F.info('gym',{gym_facility_status:'임시 휴무'},at('2026-10-14T12:00:00')).status,'임시 휴무');
});
test('roof closure takes precedence without removing its previous hours', () => {
  const info=F.info('roof',{roof_status:'폐쇄'},at('2026-10-14T12:00:00'));
  assert.equal(info.status,'폐쇄'); assert.match(info.hours[0][1],/오전 8:00/);
});
test('library hours use Seoul weekdays, including Sunday/Monday and shorter Saturday', () => {
  assert.match(F.info('library',{},at('2026-10-18T12:00:00')).status,/정기휴관/);
  assert.match(F.info('library',{},at('2026-10-19T12:00:00')).status,/정기휴관/);
  assert.match(F.info('library',{},at('2026-10-17T18:00:00')).status,/운영 종료/);
  assert.match(F.info('library',{},new Date('2026-10-14T00:59:00Z')).status,/시작 전/);
  assert.match(F.info('library',{},new Date('2026-10-14T01:00:00Z')).status,/운영시간 중/);
});
test('custom library hours are shown without claiming an unparsed schedule is open', () => {
  const info=F.info('library',{library_hours:'오늘 11:00~17:00'},at('2026-10-14T12:00:00'));
  assert.equal(info.hours[0][1],'오늘 11:00~17:00');
  assert.match(info.status,/확인/);
});
