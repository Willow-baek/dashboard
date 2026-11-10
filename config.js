window.DashboardConfig = {
  sheetId: '1Iu8teB0ds5lzNVZwb-V353WnEjzlSU4anMAcMZJ0LY4',
  settingsTab: '시트1',
  latitude: 37.5546,
  longitude: 126.9236,
  locationName: '서교동',
  returnCountdown: { start: '2026-11-10', date: '2027-11-12', message: '집사야 집 관리 잘해라!' },
  voice: { enabled: true }, // Private Google Cloud bridge verified; server enforces a 50k monthly cap.
  payments: {
    endpoint: 'https://script.google.com/macros/s/AKfycbyJzHz9ZfAPbCA9zoUDv56V8OtjD7WIL9DoQCNWAOaXY1nySah47pln_MUCvfEjmBz2/exec',
    instructions: {
      event3: {label:'와이랩 결제', detail:'수업 전에 직접 가서 결제하기.'},
      event4: {label:'코나 결제', detail:'상담 갈 때 카드 들고 가기.', amount:450000, method:'카드'}
    }
  },
  // The current legacy sheet stores Seongmo Dream as event1. Its future times need confirmation.
  legacyDefaults: { event1: { time_mode: '매회 확인' } }
};
