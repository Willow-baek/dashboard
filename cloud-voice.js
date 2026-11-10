(function (root,factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DashboardCloudVoice = factory();
}(typeof self !== 'undefined' ? self : this,function () {
  'use strict';
  function chunks(text) {
    var result = [], remaining = String(text || '').trim();
    while (remaining) {
      var end = Math.min(800,remaining.length);
      if (remaining.length > end) {
        var stop = remaining.slice(0,end).lastIndexOf(' ');
        if (stop > 400) end = stop;
        // Keep UTF-16 surrogate pairs intact.
        if (/[\uD800-\uDBFF]/.test(remaining.charAt(end - 1))) end--;
      }
      result.push(remaining.slice(0,end)); remaining = remaining.slice(end).trim();
    }
    return result;
  }
  function create(options) {
    var generation = 0, queue = Promise.resolve(), playing = null, finish = null;
    var cache = new Map(), blocked = false;
    function cancel() {
      generation++; queue = Promise.resolve();
      if (playing) { try { playing.stop(); } catch (e) {} playing = null; }
      if (finish) { finish(); finish = null; }
    }
    function speak(text) {
      var ticket = generation;
      chunks(text).forEach(function (part) {
        queue = queue.then(async function () {
          if (ticket !== generation || blocked) return;
          var context = options.context();
          if (!context || context.state !== 'running') { options.status('blocked','소리를 켜려면 스피커 버튼을 한 번 눌러줘.'); return; }
          try {
            var content = cache.get(part);
            if (!content) {
              options.status('loading','Google 음성 준비 중…');
              var data = await options.request(part);
              if (!data.ok) {
                if (data.code === 'monthly_limit') blocked = true;
                options.status(data.code || 'error',data.error || 'Google 음성 연결을 확인해줘.'); return;
              }
              content = data.audioContent;
              if (cache.size >= 20) cache.delete(cache.keys().next().value);
              cache.set(part,content);
            }
            if (ticket !== generation) return;
            var bytes = options.decode(content);
            var buffer = await context.decodeAudioData(bytes);
            if (ticket !== generation) return;
            await new Promise(function (resolve) {
              finish = resolve; var source = context.createBufferSource(); playing = source; source.buffer = buffer;
              source.connect(context.destination);
              source.onended = function () { if (playing === source) playing = null; if (finish === resolve) finish = null; resolve(); };
              options.status('ready','Google 한국어 · Neural2'); source.start();
            });
          } catch (error) { if (ticket === generation) options.status('error','Google 음성을 재생하지 못했어. 다시 눌러줘.'); }
        });
      });
      return queue;
    }
    return {speak:speak,cancel:cancel};
  }
  return {create:create,chunks:chunks};
}));
