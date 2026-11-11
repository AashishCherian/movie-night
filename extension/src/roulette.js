/* =====================================================================================
 * Movie Night Decision Engine — ROULETTE WHEEL (Canvas 2D)
 * The wheel face is drawn once per item change; spinning only rotates the canvas via a
 * CSS transform driven by requestAnimationFrame, so the animation stays at 60fps.
 *   var w = new MN_Roulette(wrapEl, { onTick, onStop });
 *   w.setItems([{ id, label, sub }]);
 *   w.spinTo(index, { durationMs, turns, beforeLand: fn }) -> Promise
 * Pointer sits at 12 o'clock. Rotation is clockwise.
 * ===================================================================================== */
(function (global) {
  'use strict';
  var TAU = Math.PI * 2;
  var PALETTE = [
    ['#8B5CF6', '#5B21B6'], ['#EC4899', '#9D174D'], ['#E11D48', '#881337'],
    ['#7C3AED', '#3B0764'], ['#DB2777', '#701A75'], ['#F59E0B', '#92400E']
  ];

  function Roulette(wrap, opts) {
    this.wrap = wrap; this.opts = opts || {};
    this.items = []; this.rotation = 0; this.spinning = false;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'wheel-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    wrap.appendChild(this.canvas);
    var self = this;
    if (global.ResizeObserver) {
      this._ro = new ResizeObserver(function () { self.draw(); });
      this._ro.observe(wrap);
    } else {
      global.addEventListener('resize', function () { self.draw(); });
    }
  }

  Roulette.prototype.setItems = function (items) { this.items = items.slice(); this.draw(); };
  Roulette.prototype.replaceItem = function (i, item) { this.items[i] = item; this.draw(); };
  Roulette.prototype.destroy = function () { if (this._ro) { this._ro.disconnect(); } this.spinning = false; cancelAnimationFrame(this._raf); };

  Roulette.prototype.draw = function () {
    var size = this.wrap.clientWidth;
    if (!size) { return; }
    var dpr = Math.min(global.devicePixelRatio || 1, 2.5);
    var c = this.canvas;
    c.width = Math.round(size * dpr); c.height = Math.round(size * dpr);
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var R = size / 2, n = Math.max(1, this.items.length), seg = TAU / n;
    ctx.clearRect(0, 0, size, size);
    ctx.save(); ctx.translate(R, R);

    for (var i = 0; i < n; i++) {
      var a0 = i * seg - Math.PI / 2, a1 = a0 + seg;
      var pal = PALETTE[i % PALETTE.length];
      if (n % PALETTE.length === 1 && i === n - 1) { pal = PALETTE[2]; }  // avoid same-colour neighbours on wrap
      var g = ctx.createRadialGradient(0, 0, R * .15, 0, 0, R);
      g.addColorStop(0, pal[1]); g.addColorStop(.65, pal[0]); g.addColorStop(1, pal[1]);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R - 2, a0, a1); ctx.closePath();
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(253,230,138,.85)'; ctx.lineWidth = Math.max(1.5, size / 260); ctx.stroke();

      // label along the radius
      var it = this.items[i] || { label: '' };
      ctx.save();
      ctx.rotate(a0 + seg / 2);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      var maxW = R * .62;
      var fs = Math.max(9, Math.min(size / 26, (seg * R * .55)));
      ctx.font = '800 ' + fs + 'px "Space Grotesk", "Poppins", system-ui, sans-serif';
      var label = fit(ctx, String(it.label || '').toUpperCase(), maxW);
      ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 4;
      ctx.fillStyle = '#fff';
      ctx.fillText(label, R * .9, it.sub ? -fs * .28 : 0);
      if (it.sub && seg * R > fs * 2.4) {
        ctx.font = '600 ' + (fs * .58) + 'px "Inter", system-ui, sans-serif';
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.fillText(fit(ctx, String(it.sub).toUpperCase(), maxW), R * .9, fs * .62);
      }
      ctx.restore();
    }

    // marquee bulbs on the rim
    var bulbs = Math.max(16, Math.min(40, n * 3));
    for (var b = 0; b < bulbs; b++) {
      var ang = b * TAU / bulbs - Math.PI / 2, br = R - size / 70;
      ctx.beginPath();
      ctx.arc(Math.cos(ang) * br, Math.sin(ang) * br, Math.max(2, size / 150), 0, TAU);
      ctx.fillStyle = b % 2 ? '#FDE68A' : '#FFFFFF';
      ctx.shadowColor = '#FBBF24'; ctx.shadowBlur = 8; ctx.fill();
    }
    ctx.shadowBlur = 0;
    // inner ring
    ctx.beginPath(); ctx.arc(0, 0, R * .17, 0, TAU); ctx.fillStyle = 'rgba(16,7,25,.9)'; ctx.fill();
    ctx.restore();
    this._apply();
  };

  function fit(ctx, text, maxW) {
    if (ctx.measureText(text).width <= maxW) { return text; }
    var t = text;
    while (t.length > 1 && ctx.measureText(t + '…').width > maxW) { t = t.slice(0, -1); }
    return t.trim() + '…';
  }

  Roulette.prototype._apply = function () { this.canvas.style.transform = 'rotate(' + this.rotation + 'rad)'; };

  Roulette.prototype.indexAtPointer = function (rot) {
    var n = this.items.length || 1, seg = TAU / n;
    var a = ((-(rot === undefined ? this.rotation : rot)) % TAU + TAU) % TAU;
    return Math.floor(a / seg) % n;
  };

  /* Ease: quick wind-up, then long exponential-ish deceleration (easeOutQuart blended). */
  function easeSpin(t) {
    var q = 1 - Math.pow(1 - t, 4);
    var e = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    return q * .55 + e * .45;
  }

  Roulette.prototype.spinTo = function (index, o) {
    o = o || {};
    var self = this;
    if (this.spinning) { return Promise.reject(new Error('already spinning')); }
    var n = this.items.length || 1, seg = TAU / n;
    var reduce = global.MN_FX && global.MN_FX.reduceMotion;
    var duration = reduce ? 900 : (o.durationMs || 5600);
    var turns = reduce ? 1 : (o.turns || 7);
    var jitter = (Math.random() - .5) * seg * .6;
    var targetAngle = index * seg + seg / 2 + jitter;          // wheel-space angle that must sit at 12 o'clock
    var start = this.rotation;
    var base = -targetAngle - start;
    var delta = ((base % TAU) + TAU) % TAU;
    var end = start + turns * TAU + delta;
    var windup = reduce ? 0 : 260, windAmt = seg * .35;
    var lastIdx = this.indexAtPointer();
    var t0 = performance.now();
    var landedHook = false;
    this.spinning = true;
    this.wrap.classList.add('spinning');

    return new Promise(function (resolve) {
      function frame(now) {
        var el = now - t0, rot;
        if (el < windup) {
          var w = el / windup;
          rot = start - windAmt * Math.sin(w * Math.PI / 2);
        } else {
          var t = Math.min(1, (el - windup) / duration);
          var from = start - windAmt;
          rot = from + (end - from) * easeSpin(t);
          if (!landedHook && t > .12 && o.beforeLand) { landedHook = true; o.beforeLand(); }
          if (t >= 1) { rot = end; }
        }
        self.rotation = rot; self._apply();
        var idx = self.indexAtPointer(rot);
        if (idx !== lastIdx) { lastIdx = idx; if (self.opts.onTick) { self.opts.onTick(idx); } }
        if (el < windup + duration) { self._raf = requestAnimationFrame(frame); }
        else {
          self.rotation = end % TAU; self._apply();
          self.spinning = false; self.wrap.classList.remove('spinning');
          resolve(self.indexAtPointer());
        }
      }
      self._raf = requestAnimationFrame(frame);
    });
  };

  global.MN_Roulette = Roulette;
})(window);
