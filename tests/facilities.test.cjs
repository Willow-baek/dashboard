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
});
test('personal membership suspension does not imply a closed gym', () => {
  const info=F.info('gym',{gym_status:'지운이 회원권 일시 중지'},at('2026-10-14T12:00:00'));
  assert.match(info.status,/운영시간 중/);
  assert.equal(info.membership,'지운이 회원권 일시 중지');
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
