// Only this authenticated route may use the private Google Cloud API key.
// Conservative reservation: failed/uncertain requests still count toward the cap.
function synthesizeDashboardVoice_(body, props) {
  const LIMIT = 50000;
  const text = typeof body.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > 800) return {ok:false,code:'invalid_text',error:'음성 문장 길이를 확인해줘.'};
  if (props.getProperty('TTS_ENABLED') !== 'true' || !props.getProperty('TTS_API_KEY')) return {ok:false,code:'not_ready',error:'Google 음성 연결을 준비 중이야.'};
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let used, month;
  try {
    month = Utilities.formatDate(new Date(),'America/Los_Angeles','yyyy-MM');
    const counter = 'TTS_CHARS_' + month;
    used = Number(props.getProperty(counter) || 0);
    if (!Number.isFinite(used) || used < 0) return {ok:false,code:'usage_error',error:'음성 사용량 기록 확인이 필요해. 요청을 중단했어.'};
    if (used + text.length > LIMIT) return {ok:false,code:'monthly_limit',used:used,limit:LIMIT,error:'이번 달 음성 한도에 도달해서 Google 음성을 중단했어. 누나에게 한도 변경을 요청해줘.'};
    used += text.length;
    props.setProperty(counter,String(used));
  } finally { lock.releaseLock(); }
  const response = UrlFetchApp.fetch('https://texttospeech.googleapis.com/v1/text:synthesize',{
    method:'post',contentType:'application/json',muteHttpExceptions:true,
    headers:{'X-Goog-Api-Key':props.getProperty('TTS_API_KEY')},
    payload:JSON.stringify({input:{text:text},voice:{languageCode:'ko-KR',name:'ko-KR-Neural2-A'},audioConfig:{audioEncoding:'MP3',speakingRate:1}})
  });
  // Never return provider errors, which can contain project or credential details.
  if (response.getResponseCode() !== 200) return {ok:false,code:'provider_error',error:'Google 음성을 가져오지 못했어. 연결 상태를 확인해줘.'};
  const data = JSON.parse(response.getContentText());
  if (!data.audioContent) return {ok:false,code:'provider_error',error:'Google 음성 응답을 확인해줘.'};
  return {ok:true,audioContent:data.audioContent,used:used,limit:LIMIT,month:month,voice:'ko-KR-Neural2-A'};
}

function verifyDashboardVoice() {
  const result = synthesizeDashboardVoice_({text:'음성 연결 테스트야. 오늘도 좋은 하루 보내.'},PropertiesService.getScriptProperties());
  console.log(JSON.stringify({ok:result.ok,voice:result.voice,used:result.used,error:result.error}));
}
