(function () {
  'use strict';
  function select(candidates, current) {
    return candidates.filter(function (item) { return item.visible && item.start >= current; }).sort(function (first, second) { return first.deadline - second.deadline; })[0] || null;
  }
  function behavior(elapsed, space, urgent) {
    if (urgent) return 'push';
    var phase = elapsed % 48000;
    return phase < 12000 ? 'punch' : phase < 32000 || space < 32 ? 'rest' : 'walk';
  }
  if (typeof module === 'object' && module.exports) { module.exports = { select:select, behavior:behavior }; return; }
  var overlay = document.getElementById('detail-overlay');
  var pet = document.createElement('span'), sprite = document.createElement('span');
  pet.className = 'house-cat'; sprite.className = 'house-cat-sprite'; pet.appendChild(sprite);
  pet.setAttribute('aria-hidden','true');
  var home = null, mode = '', elapsed = 0, lastTick = Date.now(), running = false, offscreen = false, mover = null, convoy = null;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  var observer = window.IntersectionObserver ? new IntersectionObserver(function (entries) { offscreen = !entries[0].isIntersecting; refresh(); }) : null;
  function detach() {
    if (mover) mover.dispose();
    mover = null;
    if (home) {
      var title = home.querySelector('.row-title'), text = home.querySelector('.row-title-text');
      if (text && convoy) title.appendChild(text);
      home.classList.remove('house-cat-home','cat-paused','cat-punch','cat-rest','cat-walk','cat-push');
    }
    if (convoy) convoy.remove();
    convoy = null; pet.remove();
    if (observer) observer.disconnect();
    mode = ''; home = null;
  }
  function setMode(next, title, text, distance, left) {
    pet.style.setProperty('--cat-walk-distance',distance + 'px');
    pet.style.setProperty('--cat-walk-left',left + 'px');
    pet.style.setProperty('--cat-walk-seconds',Math.max(6,distance / 10) + 's');
    if (mode === next) return;
    if (mover) mover.dispose();
    mover = null;
    if (convoy) { title.appendChild(text); convoy.remove(); convoy = null; }
    home.classList.remove('cat-punch','cat-rest','cat-walk','cat-push');
    home.classList.add('cat-' + next); mode = next;
    pet.className = 'house-cat';
    if (next === 'push') {
      pet.remove();
      convoy = document.createElement('span'); convoy.className = 'payment-convoy urgent-cat-convoy';
      var pushingCat = document.createElement('img');
      pushingCat.src = 'assets/payment-cat.png'; pushingCat.alt = ''; pushingCat.className = 'payment-cat'; pushingCat.width = 52; pushingCat.height = 52;
      convoy.appendChild(pushingCat); convoy.appendChild(text); title.appendChild(convoy);
      if (window.DashboardPaymentPet) mover = window.DashboardPaymentPet.attach(title,convoy);
    } else {
      title.appendChild(pet);
      var delay = next === 'punch' ? -(elapsed % 4800) / 1000 + 's' : '0s';
      sprite.style.animationDelay = delay; text.style.animationDelay = delay;
    }
  }
  function refresh() {
    var current = Date.now(), delta = Math.min(1000,Math.max(0,current - lastTick)); lastTick = current;
    var paymentPet = window.DashboardPaymentPet;
    var paused = document.hidden || !overlay.hidden || reduced.matches || offscreen || paymentPet && paymentPet.paused() || home && (home.matches(':hover') || home.contains(document.activeElement));
    if (running && !paused) elapsed += delta;
    var candidates = Array.prototype.map.call(document.querySelectorAll('#dashboard .event-row[data-cat-urgency]'),function (row) {
      return { row:row, start:Number(row.getAttribute('data-cat-start')), deadline:Number(row.getAttribute('data-cat-urgency')), timed:row.getAttribute('data-cat-timed') === 'true', visible:!!row.getClientRects().length };
    });
    var candidate = document.getElementById('payment-section').hidden ? select(candidates,current) : null;
    var target = candidate && candidate.row;
    if (home !== target) {
      detach(); home = target;
      offscreen = false;
      if (home) { home.classList.add('house-cat-home'); if (observer) observer.observe(home); }
    }
    running = !!home && !paused;
    if (!home) return;
    var title = home.querySelector('.row-title'), text = home.querySelector('.row-title-text');
    var titleRect = title.getBoundingClientRect(), textRect = text.getBoundingClientRect();
    var size = window.innerWidth <= 620 ? 44 : 58;
    var left = Math.max(0,textRect.right - titleRect.left + 6);
    var distance = Math.min(180,Math.max(0,titleRect.width - left - size - 4));
    var urgent = candidate.timed && candidate.deadline - current <= 15 * 60000;
    setMode(behavior(elapsed,distance,urgent),title,text,distance,left);
    home.classList.toggle('cat-paused',!!paused);
  }
  document.addEventListener('visibilitychange',refresh);
  reduced.addEventListener('change',refresh);
  new MutationObserver(refresh).observe(overlay,{attributes:true,attributeFilter:['hidden']});
  window.DashboardHouseCat = {refresh:refresh};
  setInterval(refresh,250);
  refresh();
}());
