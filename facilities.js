(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Facilities = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  // Restore the weekday-specific hours from the original dashboard, not a live feed.
  var facilities = {
    gym: { name:'헬스장', hours:['09:00~18:00',null,'06:00~23:00','06:00~23:00','06:00~23:00','06:00~23:00','06:00~23:00'],
      phones:['010-4733-0067','010-9144-0615'],
      lines:[['화~토','오전 6:00 ~ 오후 11:00'],['일요일·공휴일','오전 9:00 ~ 오후 6:00'],['월요일','정기휴무']],
      notes:[['공휴일 안내','공휴일 시간은 별도 안내이며 현재 상태 계산에 자동 반영되지 않아요. 월요일과 공휴일이 겹치면 센터에 확인해 주세요.']] },
    roof: { name:'옥상', hours:['08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00','08:00~22:00'],
      lines:[['매일','오전 8:00 ~ 오후 10:00']] },
    library: { name:'도서관', hours:[null,null,'10:00~19:00','10:00~19:00','10:00~19:00','10:00~19:00','10:00~18:00'],
      phones:['02-324-0060'],
      lines:[['화~금','오전 10:00 ~ 오후 7:00'],['토요일','오전 10:00 ~ 오후 6:00'],['일·월요일·공휴일','휴관']],
      links:[['도서 신청하기','https://docs.google.com/forms/d/e/1FAIpQLScmYbHgZm9oEiP_AwbSXkB7e43Vbgoi_hUla6sYxPwltf2cvg/viewform?usp=send_form']],
      notes:[['공휴일 안내','공휴일은 휴관해요. 현재 상태는 요일 기준이며 공휴일을 자동 반영하지 않아요.']] },
    office: { name:'관리사무소', phones:['02-335-2203'],
      hours:[null,'09:00~18:00','09:00~18:00','09:00~18:00','09:00~18:00','09:00~18:00',null],
      lines:[['평일','오전 9:00 ~ 오후 6:00']], notes:[['담당 업무','관리비, 공용시설물, 옥상, 상가 등 관리'],['방문 전 확인','공휴일 운영은 관리사무소에 확인해 주세요.']] },
    rental: { name:'임대관리센터', phones:['02-335-1800'],
      hours:[null,'09:00~18:00','09:00~18:00','09:00~18:00','09:00~18:00','09:00~18:00',null],
      lines:[['평일','오전 9:00 ~ 오후 6:00']], notes:[['담당 업무','주거 부분 벽지·가전, 민간월세 문의, 생업자동차 등록, 2층 공용 세탁실 관련 문의'],['방문 전 확인','공휴일 운영은 임대관리센터에 확인해 주세요.']] },
    ventilation: { name:'화장실 환풍기 고장', phones:['1577-7713'], lines:[],
      notes:[['업체명','에어앤피플'],['운영시간','별도 안내 없음 · 전화로 확인해 주세요.']] },
    recycling: { name:'분리수거·대형폐기물', lines:[],
      notes:[['일반쓰레기','종량제봉투 사용 · 상시 배출 가능'],['음식물쓰레기','하얀색 1101호 카드 태그 후 배출 · 상시 가능'],['분리수거 가능 시간 ①','월요일 오전 8:00 ~ 화요일 오전 10:00'],['분리수거 가능 시간 ②','목요일 오전 8:00 ~ 금요일 오전 10:00'],['대형생활폐기물 1단계','마포구청 대형생활폐기물 인터넷 신청'],['대형생활폐기물 2단계','폐기 스티커 발급'],['대형생활폐기물 3단계','지하 1층 지정 장소에 폐기물 배출']] }
  };
  function text(value) { return value == null ? '' : String(value).trim(); }
  function info(id, settings, now) {
    var facility = facilities[id];
    if (!facility) return null;
    settings = settings || {}; now = now || new Date();
    var seoul = new Date(now.getTime() + 9 * 3600000), day = seoul.getUTCDay();
    var hours = facility.hours && facility.hours[day], minutes = seoul.getUTCHours() * 60 + seoul.getUTCMinutes();
    var status = id === 'library' ? '오늘 정기휴관' : '오늘 정기휴무';
    if (hours) {
      var clocks = hours.split('~').map(function (clock) { var parts = clock.split(':'); return +parts[0] * 60 + +parts[1]; });
      status = minutes < clocks[0] ? '오늘 운영 시작 전' : minutes >= clocks[1] ? '오늘 운영 종료' : '운영시간 중';
    }
    status += ' · 요일 기준';
    if (id === 'ventilation') status = '에어앤피플 · 고장 문의';
    if (id === 'recycling') {
      var weekMinutes = day * 1440 + minutes;
      var available = weekMinutes >= 1440 + 480 && weekMinutes < 2880 + 600 || weekMinutes >= 5760 + 480 && weekMinutes < 7200 + 600;
      status = available ? '지금 분리수거 배출 가능' : '지금은 분리수거 배출 시간 외';
    }
    var override = text(settings[id === 'gym' ? 'gym_facility_status' : id + '_status']);
    if (id === 'roof' && !override) override = '폐쇄';
    var customLibraryHours = id === 'library' && text(settings.library_hours) && text(settings.library_hours) !== '운영시간 확인 필요';
    if (customLibraryHours && !override) status = '별도 안내된 운영시간 확인';
    return { name:facility.name, status:override || status,
      hours:customLibraryHours ? [['운영시간',text(settings.library_hours)]] : facility.lines,
      phones:facility.phones || [], notes:facility.notes || [], links:facility.links || [],
      membership:id === 'gym' ? (!text(settings.gym_status) || /^(지운이 )?회원권 일시 중지$/.test(text(settings.gym_status)) ? '지운이 회원권 이용 가능 · 운동 재개' : text(settings.gym_status)) : '',
      basis:customLibraryHours ? '시트에 입력한 운영시간 안내' : id === 'roof' ? '기존 대시보드 안내. 현장 운영시간은 달라질 수 있어요.' : '가족이 제공한 안내 기준 · 한국 시간. 변경·공휴일 운영은 담당처에 확인해 주세요.' };
  }
  return { info:info, ids:['recycling','gym','roof','library','office','rental','ventilation'] };
}));
