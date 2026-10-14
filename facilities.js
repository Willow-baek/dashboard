(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Facilities = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Restore the weekday-specific hours from the original dashboard, not a live feed.
  var facilities = {
    gym: { name:'헬스장', hours:['10:00~18:00',null,'06:00~23:00','06:00~23:00','06:00~23:00','06:00~23:00','06:00~23:00'],
      lines:[['화~토','오전 6:00 ~ 오후 11:00'],['일요일','오전 10:00 ~ 오후 6:00'],['월요일','정기휴무']] },
    roof: { name:'옥상', hours:['08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00'],
      lines:[['매일','오전 8:00 ~ 오후 10:00']] },
    library: { name:'도서관', hours:[null,null,'10:00~19:00','10:00~19:00','10:00~19:00','10:00~19:00','10:00~18:00'],
      lines:[['화~금','오전 10:00 ~ 오후 7:00'],['토요일','오전 10:00 ~ 오후 6:00'],['일·월요일','정기휴관']] }
  };
  function text(value) { return value == null ? '' : String(value).trim(); }
  function info(id, settings, now) {
    var facility = facilities[id];
    if (!facility) return null;
    settings = settings || {}; now = now || new Date();
    var seoul = new Date(now.getTime() + 9 * 3600000), day = seoul.getUTCDay();
    var hours = facility.hours[day], minutes = seoul.getUTCHours() * 60 + seoul.getUTCMinutes();
    var status = id === 'library' ? '오늘 정기휴관' : '오늘 정기휴무';
    if (hours) {
      var clocks = hours.split('~').map(function (clock) { var parts = clock.split(':'); return +parts[0] * 60 + +parts[1]; });
      status = minutes < clocks[0] ? '오늘 운영 시작 전' : minutes >= clocks[1] ? '오늘 운영 종료' : '운영시간 중';
    }
    status += ' · 기존 시간표 기준';
    var override = text(settings[id === 'gym' ? 'gym_facility_status' : id + '_status']);
    if (id === 'roof' && !override) override = '폐쇄';
    var customLibraryHours = id === 'library' && text(settings.library_hours) && text(settings.library_hours) !== '운영시간 확인 필요';
    if (customLibraryHours && !override) status = '별도 안내된 운영시간 확인';
    return { name:facility.name, status:override || status,
      hours:customLibraryHours ? [['운영시간',text(settings.library_hours)]] : facility.lines,
      membership:id === 'gym' ? text(settings.gym_status) || '지운이 회원권 일시 중지' : '',
      basis:customLibraryHours ? '시트에 입력한 운영시간 안내' : '기존 대시보드 시간표. 현장 운영시간은 달라질 수 있어요.' };
  }
  return { info:info };
}));
