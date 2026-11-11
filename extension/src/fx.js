/* =====================================================================================
 * Movie Night Decision Engine — AMBIENT FX (stars/dust) + CONFETTI
 * Canvas 2D only, DPR-aware, pauses when the tab is hidden, honours reduced motion.
 * ===================================================================================== */
(function (global) {
  'use strict';
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function fitCanvas(c) {
    var dpr = Math.min(global.devicePixelRatio || 1, 2);
    var w = c.clientWidth, h = c.clientHeight;
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    var ctx = c.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h };
  }

  /* ---------- Starfield / projector dust ---------- */
  function Stars(canvas) {
    this.c = canvas; this.p = []; this.running = false;
    var self = this;
    this._frame = function (t) { self.draw(t); if (self.running) { self.raf = requestAnimationFrame(self._frame); } };
    global.addEventListener('resize', function () { self.seed(); });
    document.addEventListener('visibilitychange', function () { document.hidden ? self.stop() : self.start(); });
    this.seed();
  }
  Stars.prototype.seed = function () {
    var f = fitCanvas(this.c);
    var n = Math.round(Math.min(140, (f.w * f.h) / 9000));
    this.p = [];
    for (var i = 0; i < n; i++) {
      this.p.push({ x: Math.random() * f.w, y: Math.random() * f.h, r: Math.random() * 1.4 + .3,
        a: Math.random() * Math.PI * 2, s: Math.random() * .6 + .2, vy: -(Math.random() * .12 + .02),
        hue: [270, 330, 45, 200][i % 4] });
    }
    if (reduce) { this.draw(0); }
  };
  Stars.prototype.draw = function (t) {
    var f = fitCanvas(this.c), ctx = f.ctx;
    ctx.clearRect(0, 0, f.w, f.h);
    for (var i = 0; i < this.p.length; i++) {
      var s = this.p[i];
      if (!reduce) { s.y += s.vy; if (s.y < -4) { s.y = f.h + 4; s.x = Math.random() * f.w; } }
      var tw = .35 + .65 * Math.abs(Math.sin(s.a + t * .001 * s.s));
      ctx.beginPath();
      ctx.fillStyle = 'hsla(' + s.hue + ',100%,85%,' + (tw * .8).toFixed(3) + ')';
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  };
  Stars.prototype.start = function () { if (reduce || this.running) { return; } this.running = true; this.raf = requestAnimationFrame(this._frame); };
  Stars.prototype.stop = function () { this.running = false; cancelAnimationFrame(this.raf); };

  /* ---------- Confetti burst ---------- */
  function confetti(opts) {
    if (reduce) { return; }
    opts = opts || {};
    var c = document.createElement('canvas');
    c.className = 'fx-layer';
    document.body.appendChild(c);
    var f = fitCanvas(c);
    var colors = ['#FBBF24', '#EC4899', '#8B5CF6', '#E11D48', '#FFFFFF', '#38BDF8'];
    var parts = [];
    var n = opts.count || 160;
    var ox = (opts.x !== undefined ? opts.x : .5) * f.w, oy = (opts.y !== undefined ? opts.y : .35) * f.h;
    for (var i = 0; i < n; i++) {
      var ang = Math.random() * Math.PI * 2, sp = Math.random() * 9 + 4;
      parts.push({ x: ox, y: oy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp - 6, w: Math.random() * 8 + 4, h: Math.random() * 5 + 3,
        rot: Math.random() * 6, vr: (Math.random() - .5) * .4, col: colors[i % colors.length], life: 0, shape: i % 3 });
    }
    var start = performance.now();
    function frame(t) {
      var el = t - start;
      f.ctx.clearRect(0, 0, f.w, f.h);
      parts.forEach(function (p) {
        p.vy += .22; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        var alpha = Math.max(0, 1 - el / 3200);
        f.ctx.save(); f.ctx.globalAlpha = alpha; f.ctx.translate(p.x, p.y); f.ctx.rotate(p.rot); f.ctx.fillStyle = p.col;
        if (p.shape === 0) { f.ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); }
        else if (p.shape === 1) { f.ctx.beginPath(); f.ctx.arc(0, 0, p.h / 1.6, 0, Math.PI * 2); f.ctx.fill(); }
        else { star(f.ctx, p.w / 1.4); }
        f.ctx.restore();
      });
      if (el < 3300) { requestAnimationFrame(frame); } else { c.remove(); }
    }
    requestAnimationFrame(frame);
  }
  function star(ctx, r) {
    ctx.beginPath();
    for (var i = 0; i < 10; i++) { var rr = i % 2 ? r * .45 : r, a = i * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  global.MN_FX = { Stars: Stars, confetti: confetti, reduceMotion: reduce, fitCanvas: fitCanvas };
})(window);
