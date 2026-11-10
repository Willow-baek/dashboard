(function () {
  'use strict';
  var movers = [], paused = false;
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  function reset() { movers.forEach(function (m) { m.dispose(); }); movers = []; }
  function attach(lane,convoy) {
    var animation = null, timer = null, stopped = false, hovered = false, position = 0;
    function shouldRest() { return stopped || paused || reduced.matches || document.hidden || hovered || lane.contains(document.activeElement) || !document.getElementById('detail-overlay').hidden; }
    function rest() { clearTimeout(timer); timer = null; if (animation) animation.pause(); convoy.classList.remove('is-pushing'); }
    function move() {
      if (shouldRest()) return rest();
      var bound = Math.min(96,Math.max(0,lane.clientWidth - convoy.offsetWidth - 4));
      if (!bound) return rest();
      if (animation && animation.playState === 'paused') { convoy.classList.add('is-pushing'); animation.play(); return; }
      position = Math.min(position,bound);
      var target = position < bound / 2 ? bound * (.65 + Math.random() * .35) : bound * Math.random() * .35;
      var seconds = Math.max(2.4,Math.abs(target - position) / (7 + Math.random() * 8));
      convoy.classList.toggle('push-left',target < position); convoy.classList.add('is-pushing');
      animation = convoy.animate([{transform:'translateX(' + position + 'px)'},{transform:'translateX(' + target + 'px)'}],{duration:seconds * 1000,easing:'linear',fill:'forwards'});
      animation.onfinish = function () {
        position = target; convoy.style.transform = 'translateX(' + position + 'px)'; animation.cancel(); animation = null;
        convoy.classList.remove('is-pushing'); timer = setTimeout(move,1000 + Math.random() * 1800);
      };
    }
    function enter() { hovered = true; rest(); }
    function leave() { hovered = false; move(); }
    function resized() {
      if (animation) { animation.cancel(); animation = null; }
      position = 0; convoy.style.transform = ''; rest(); move();
    }
    lane.addEventListener('pointerenter',enter); lane.addEventListener('pointerleave',leave);
    lane.addEventListener('focusin',rest); lane.addEventListener('focusout',function () { setTimeout(move,0); });
    var observer = window.ResizeObserver ? new ResizeObserver(resized) : null;
    if (observer) observer.observe(lane);
    var mover = {update:move,dispose:function () { stopped = true; rest(); if (animation) animation.cancel(); if (observer) observer.disconnect(); }};
    movers.push(mover); move();
  }
  function update() { movers.forEach(function (m) { m.update(); }); }
  document.addEventListener('visibilitychange',update);
  reduced.addEventListener('change',update);
  // Opening a dialog pauses the scene; closing it resumes the same movement.
  document.addEventListener('DOMContentLoaded',function () { new MutationObserver(update).observe(document.getElementById('detail-overlay'),{attributes:true,attributeFilter:['hidden']}); });
  window.DashboardPaymentPet = {reset:reset,attach:attach,toggle:function () { paused = !paused; update(); return paused; },paused:function () { return paused; }};
}());
