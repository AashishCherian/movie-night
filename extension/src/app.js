/* =====================================================================================
 * Movie Night Decision Engine — APPLICATION UI
 * Owns: screen flow, selection state, rendering. Delegates to:
 *   MN_CONFIG (config.js) · MN_DATA (data.js) · MN_ENGINE (engine.js)
 *   MN_Roulette (roulette.js) · MN_FX (fx.js)
 * Sandbox rules honoured: no CDN, no innerHTML with data (textContent/createElement only),
 * every error rendered on screen.
 * ===================================================================================== */
(function () {
  'use strict';

  var CFG = window.MN_CONFIG, ENGINE = window.MN_ENGINE, FX = window.MN_FX;
  var root = document.getElementById('app');

  /* ---------------------------------------------------------------- state ---------- */
  var S = {
    adapter: null, mode: 'mock', catalogue: null, loadInfo: null,
    screen: 'loading',
    sel: { languages: [], moods: [], genres: [], platforms: [] },
    gs: { moodKey: null, suggested: [], recommended: [], added: [], selected: [] },
    surprise: false,
    history: [], current: null,
    wheel: null, wheelItems: [], pool: [],
    spinning: false
  };
  var STEPS = ['language', 'mood', 'genre', 'platform', 'roulette'];
  var STEP_LABEL = { language: 'Language', mood: 'Mood', genre: 'Genre', platform: 'Platform', roulette: 'Spin' };

  /* ---------------------------------------------------------------- dom helpers ---- */
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v === undefined || v === null || v === false) { return; }
      if (k === 'class') { el.className = v; }
      else if (k === 'text') { el.textContent = v; }
      else if (k === 'style') { Object.keys(v).forEach(function (s) { el.style.setProperty(s, v[s]); }); }
      else if (k.slice(0, 2) === 'on') { el.addEventListener(k.slice(2), v); }
      else if (v === true) { el.setAttribute(k, ''); }
      else { el.setAttribute(k, v); }
    });
    for (var i = 2; i < arguments.length; i++) { append(el, arguments[i]); }
    return el;
  }
  function append(el, c) {
    if (c === null || c === undefined || c === false) { return; }
    if (Array.isArray(c)) { c.forEach(function (x) { append(el, x); }); return; }
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  function clear(el) { while (el.firstChild) { el.removeChild(el.firstChild); } }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function fmtRuntime(m) { if (!m) { return ''; } var hh = Math.floor(m / 60), mm = Math.round(m % 60); return (hh ? hh + 'h ' : '') + (mm ? mm + 'm' : ''); }
  function fmtVotes(v) { if (v === null || v === undefined) { return ''; } if (v >= 1e6) { return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; } if (v >= 1e3) { return Math.round(v / 1e3) + 'K'; } return String(v); }
  function hash(s) { var x = 2166136261; for (var i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; }
  function vibrate(ms) { try { if (navigator.vibrate) { navigator.vibrate(ms); } } catch (e) { /* noop */ } }
  function platformMeta(name) {
    for (var i = 0; i < CFG.platforms.length; i++) { if (CFG.platforms[i].name === name) { return CFG.platforms[i]; } }
    return { name: name, color: '#6D28D9', mono: (name || '?').charAt(0) };
  }
  function moodMeta(m) { return CFG.moodMeta[m] || CFG.defaultMoodMeta; }
  function langMeta(l) { for (var i = 0; i < CFG.languages.length; i++) { if (CFG.languages[i].name === l) { return CFG.languages[i]; } } return { name: l, native: '' }; }
  function toggle(list, v) { var i = list.indexOf(v); if (i >= 0) { list.splice(i, 1); } else { list.push(v); } return list; }

  /* ---------------------------------------------------------------- persistence ---- */
  var LS_KEY = 'mn.selection.v1';
  function saveSel() {
    if (!CFG.rememberSelections) { return; }
    try { localStorage.setItem(LS_KEY, JSON.stringify({ sel: S.sel, gs: S.gs })); } catch (e) { /* storage unavailable in some sandboxes */ }
  }
  function loadSel() {
    if (!CFG.rememberSelections) { return; }
    try {
      var raw = localStorage.getItem(LS_KEY); if (!raw) { return; }
      var o = JSON.parse(raw), cat = S.catalogue;
      function keep(arr, allowed) { return (arr || []).filter(function (x) { return allowed.indexOf(x) >= 0; }); }
      S.sel.languages = keep(o.sel.languages, cat.languages);
      S.sel.moods = keep(o.sel.moods, cat.moods);
      S.sel.platforms = keep(o.sel.platforms, cat.platforms);
      if (o.gs) {
        S.gs.added = keep(o.gs.added, cat.genres);
        S.gs.selected = keep(o.gs.selected, cat.genres);
        S.gs.recommended = keep(o.gs.recommended, cat.genres);
        S.gs.suggested = keep(o.gs.suggested, cat.genres);
        S.gs.moodKey = o.gs.moodKey || null;
        S.sel.genres = S.gs.selected.slice();
      }
    } catch (e) { /* ignore */ }
  }

  /* ---------------------------------------------------------------- poster --------- */
  function posterEl(m, opts) {
    opts = opts || {};
    var hv = hash(m.id + m.title);
    var h1 = hv % 360, h2 = (h1 + 40 + (hv >> 9) % 80) % 360;
    var p = h('div', { class: 'poster', style: { '--h1': String(h1), '--h2': String(h2) }, role: 'img', 'aria-label': 'Poster for ' + m.title });
    if (opts.fs) { p.style.setProperty('--pfs', opts.fs); }
    p.appendChild(h('div', { class: 'art' }));
    p.appendChild(h('div', { class: 'ptxt' },
      h('div', { class: 'ptitle', text: m.title }),
      opts.noLang ? null : h('div', { class: 'plang', text: (m.languages[0] || '') + (m.year ? ' · ' + m.year : '') })));
    if (m.poster) {
      var img = h('img', { alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
      img.addEventListener('error', function () { img.remove(); });
      img.src = m.poster;
      p.appendChild(img);
    }
    return p;
  }

  /* ---------------------------------------------------------------- chrome --------- */
  function atmosphere() {
    var atmo = h('div', { class: 'atmo' }, h('div', { class: 'spot l' }), h('div', { class: 'spot r' }));
    var cv = h('canvas');
    atmo.appendChild(cv);
    document.body.appendChild(atmo);
    document.body.appendChild(h('div', { class: 'curtain l' }));
    document.body.appendChild(h('div', { class: 'curtain r' }));
    document.body.appendChild(h('div', { class: 'valance' }));
    try { var st = new FX.Stars(cv); st.start(); } catch (e) { /* decorative only */ }
  }

  var shell, stage, topRight, reelEl;
  function buildShell() {
    clear(root);
    topRight = h('div', { class: 'topbar-right' });
    reelEl = h('div', { class: 'reel', role: 'progressbar', 'aria-valuemin': '1', 'aria-valuemax': '5' });
    stage = h('main', { class: 'stage', id: 'stage' });
    shell = h('div', { class: 'shell' },
      h('header', { class: 'topbar' },
        h('button', { class: 'brand', 'aria-label': 'Movie Night — start over', onclick: function () { if (!S.spinning) { go('welcome'); } } },
          h('span', { class: 'dot', text: '🎬' }), h('span', { text: 'MOVIE NIGHT' })),
        topRight),
      reelEl, stage);
    root.appendChild(shell);
  }

  function renderTopbar() {
    clear(topRight);
    var badge = S.mode === 'tableau'
      ? h('span', { class: 'badge live', title: 'Querying the Tableau workbook datasources live', text: 'Live · Tableau' })
      : h('span', { class: 'badge mock', title: 'Running outside Tableau with preview data', text: CFG.publicDemo ? 'Demo' : 'Preview · mock data' });
    topRight.appendChild(badge);
    if (S.screen === 'welcome') {
      topRight.appendChild(h('button', { class: 'icon-btn', title: 'Refresh catalogue', 'aria-label': 'Refresh catalogue', text: '↻', onclick: refreshCatalogue }));
    }
  }

  function renderReel() {
    clear(reelEl);
    var idx = STEPS.indexOf(S.screen);
    if (S.screen === 'reveal') { idx = 5; }
    var show = idx >= 0 && !S.surprise;
    reelEl.style.display = show ? '' : 'none';
    if (!show) { return; }
    reelEl.setAttribute('aria-valuenow', String(Math.min(idx + 1, 5)));
    STEPS.forEach(function (s, i) {
      reelEl.appendChild(h('div', { class: 'frame' + (i < idx ? ' done' : i === idx ? ' now' : '') },
        h('span', { class: 'n', text: (i + 1) + ' · ' }), STEP_LABEL[s]));
    });
  }

  /* ---------------------------------------------------------------- navigation ----- */
  var navToken = 0;
  function go(screen, opts) {
    opts = opts || {};
    closeSheet();
    var token = ++navToken;
    var old = stage.firstElementChild;
    var swap = function () {
      if (token !== navToken) { return; }
      if (S.wheel && screen !== 'roulette') { S.wheel.destroy(); S.wheel = null; }
      S.screen = screen;
      document.body.classList.toggle('curtains-open', screen !== 'welcome' && screen !== 'loading');
      clear(stage);
      Array.prototype.forEach.call(document.querySelectorAll('body > .reveal-bg'), function (n) { n.remove(); });
      var el = SCREENS[screen](opts);
      stage.appendChild(el);
      renderTopbar(); renderReel();
      try { window.scrollTo({ top: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, 0); }
      var focusEl = el.querySelector('[data-autofocus]') || el.querySelector('h1, h2');
      if (focusEl) { focusEl.setAttribute('tabindex', '-1'); try { focusEl.focus({ preventScroll: true }); } catch (e) { /* noop */ } }
      if (opts.after) { opts.after(el); }
    };
    if (old && !FX.reduceMotion) { old.classList.add('leaving'); setTimeout(swap, 260); } else { swap(); }
  }

  /* ---------------------------------------------------------------- live counts ---- */
  function partialSel(upto) {
    var s = { languages: [], moods: [], genres: [], platforms: [] };
    var order = ['languages', 'moods', 'genres', 'platforms'];
    for (var i = 0; i <= upto; i++) { s[order[i]] = S.sel[order[i]]; }
    return s;
  }
  function matchMeter(upto) {
    var el = h('div', { class: 'match-meter', 'aria-live': 'polite' });
    var last = -1;
    function update() {
      var n = ENGINE.filterMovies(S.catalogue, partialSel(upto)).length;
      clear(el);
      el.classList.toggle('zero', n === 0);
      var b = h('b', { text: String(n) });
      if (last !== -1 && last !== n) { b.classList.add('bump'); }
      last = n;
      el.appendChild(h('span', { text: '🎬' }));
      el.appendChild(b);
      el.appendChild(h('span', { text: n === 1 ? 'movie matches so far' : 'movies match so far' }));
    }
    el.update = update; update();
    return el;
  }

  /* ---------------------------------------------------------------- sheet / toast -- */
  var sheetEl = null;
  function openSheet(title, desc, body) {
    closeSheet();
    var sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'grab' }), h('h3', { text: title }), desc ? h('p', { text: desc }) : null, body,
      h('button', { class: 'btn btn-ghost btn-block', text: 'Done', onclick: closeSheet }));
    sheetEl = h('div', { class: 'sheet-backdrop', onclick: function (e) { if (e.target === sheetEl) { closeSheet(); } } }, sheet);
    document.body.appendChild(sheetEl);
    var f = sheet.querySelector('button'); if (f) { f.focus(); }
  }
  function closeSheet() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeSheet(); } });

  var toastTimer;
  function toast(msg) {
    var old = document.querySelector('.toast'); if (old) { old.remove(); }
    var t = h('div', { class: 'toast', role: 'status', text: msg });
    document.body.appendChild(t);
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.remove(); }, 3200);
  }

  function openExternal(url, label) {
    var w = null;
    try { w = window.open(url, '_blank'); if (w) { w.opener = null; } } catch (e) { w = null; }
    if (!w) {
      var code = h('code', { text: url });
      openSheet(label || 'Open link', 'Your browser or Tableau blocked the pop-up. Copy this verified link:', h('div', { class: 'link-row' }, code,
        h('button', { class: 'chip-btn solid', text: 'Copy', onclick: function () {
          try { navigator.clipboard.writeText(url).then(function () { toast('Link copied'); }, function () { toast('Select the link to copy it'); }); }
          catch (e) { toast('Select the link to copy it'); }
        } })));
    }
  }

  /* ================================================================ SCREENS ========= */
  var SCREENS = {};

  SCREENS.loading = function (o) {
    return h('section', { class: 'screen loading' },
      h('div', { class: 'projector', 'aria-hidden': 'true' }),
      h('p', { class: 'eyebrow', text: 'Now loading' }),
      h('p', { class: 'sub', text: (o && o.msg) || 'Rolling the film… fetching tonight\'s catalogue.' }));
  };

  SCREENS.error = function (o) {
    return h('section', { class: 'screen' },
      h('div', { class: 'error-card', role: 'alert' },
        h('h2', { text: '🎞️ The projector jammed' }),
        h('p', { class: 'sub', text: 'Live query unavailable — the catalogue could not be loaded from Tableau.' }),
        h('pre', { text: o.message }),
        h('p', { class: 'sub', text: 'Check that the workbook still contains the "MN …" datasources listed in README, then reload.' }),
        h('button', { class: 'btn btn-primary btn-block', text: 'Try again', onclick: function () { boot(); } })));
  };

  SCREENS.welcome = function () {
    var cat = S.catalogue;
    return h('section', { class: 'screen welcome' },
      h('div', { class: 'ticket', text: 'Admit one · Tonight only' }),
      h('div', { class: 'marquee' }, h('div', { class: 'bulbs', 'aria-hidden': 'true' }),
        h('h1', { 'data-autofocus': true }, h('span', { class: 'grad-text', text: 'TONIGHT\'S MOVIE?' })),
        h('p', { class: 'sub', text: 'Stop scrolling. Let the cinema decide.' })),
      h('div', { class: 'ctas' },
        h('button', { class: 'btn btn-primary btn-block', onclick: function () { S.surprise = false; go('language'); } }, 'LET\'S FIND A MOVIE', h('span', { 'aria-hidden': 'true', text: '🍿' })),
        h('button', { class: 'btn btn-ghost btn-block', onclick: function () { S.surprise = true; go('roulette', { autoSpin: true }); } }, h('span', { 'aria-hidden': 'true', text: '🎲' }), 'SURPRISE ME')),
      h('p', { class: 'fine', text: plural(cat.movies.length, 'film') + ' · ' + plural(cat.languages.length, 'language') + ' · ' + cat.region.label + ' catalogue' }),
      CFG.publicDemo ? h('p', { class: 'fine', text: 'Fan-made demo. Ratings from IMDb search results (personal, non-commercial use). Streaming availability is illustrative, not real.' }) : null);
  };

  /* ---------- Language ---------- */
  SCREENS.language = function () {
    var cat = S.catalogue, meter = matchMeter(0), next;
    var grid = h('div', { class: 'grid lang', role: 'group', 'aria-label': 'Languages' });
    function paint() {
      Array.prototype.forEach.call(grid.children, function (b) { b.setAttribute('aria-pressed', S.sel.languages.indexOf(b.dataset.v) >= 0 ? 'true' : 'false'); });
      next.disabled = !S.sel.languages.length; meter.update(); saveSel();
    }
    cat.languages.forEach(function (l) {
      var n = cat.counts.languages[l] || 0, lm = langMeta(l);
      grid.appendChild(h('button', { class: 'card lang-card', 'data-v': l, 'aria-pressed': 'false', disabled: n === 0,
        onclick: function () { toggle(S.sel.languages, l); vibrate(8); paint(); } },
        h('span', { class: 'check', text: '✓', 'aria-hidden': 'true' }),
        h('span', { class: 'name', text: l }),
        lm.native && lm.native !== l ? h('span', { class: 'native', text: lm.native, lang: '' }) : null,
        h('span', { class: 'ct', text: n ? plural(n, 'film') : 'Coming soon' })));
    });
    next = h('button', { class: 'btn btn-primary', onclick: function () { go('mood'); } }, 'NEXT →');
    var el = h('section', { class: 'screen select-screen' },
      h('p', { class: 'eyebrow', text: 'Step 1 · Language' }),
      h('h1', { class: 'q', 'data-autofocus': true, text: 'What language are you in the mood for?' }),
      h('p', { class: 'sub', text: 'Pick as many as you like — we\'ll look across all of them.' }),
      h('div', { class: 'tools' },
        h('button', { class: 'chip-btn', text: 'Select all', onclick: function () { S.sel.languages = cat.languages.filter(function (l) { return cat.counts.languages[l]; }); paint(); } }),
        h('button', { class: 'chip-btn', text: 'Clear', onclick: function () { S.sel.languages = []; paint(); } })),
      grid,
      h('div', { class: 'actions' }, next, h('div', { class: 'actions-row' }, h('button', { class: 'btn-link', text: '← Back', onclick: function () { go('welcome'); } }), meter)));
    paint();
    return el;
  };

  /* ---------- Mood ---------- */
  SCREENS.mood = function () {
    var cat = S.catalogue, meter = matchMeter(1), next;
    var grid = h('div', { class: 'grid mood', role: 'group', 'aria-label': 'Moods' });
    function paint() {
      Array.prototype.forEach.call(grid.children, function (b) { b.setAttribute('aria-pressed', S.sel.moods.indexOf(b.dataset.v) >= 0 ? 'true' : 'false'); });
      next.disabled = !S.sel.moods.length; meter.update(); saveSel();
    }
    cat.moods.forEach(function (m) {
      var mm = moodMeta(m), n = cat.counts.moods[m] || 0;
      grid.appendChild(h('button', { class: 'card mood-card', 'data-v': m, 'aria-pressed': 'false', disabled: n === 0,
        style: { '--mh': String(mm.hue) }, onclick: function () { toggle(S.sel.moods, m); vibrate(8); paint(); } },
        h('span', { class: 'check', text: '✓', 'aria-hidden': 'true' }),
        h('span', { class: 'emo', text: mm.emoji, 'aria-hidden': 'true' }),
        h('span', { class: 'lbl', text: m }),
        h('span', { class: 'desc', text: mm.blurb })));
    });
    next = h('button', { class: 'btn btn-primary', onclick: function () { go('genre'); } }, 'NEXT →');
    var el = h('section', { class: 'screen select-screen' },
      h('p', { class: 'eyebrow', text: 'Step 2 · Mood' }),
      h('h1', { class: 'q', 'data-autofocus': true, text: 'What\'s your mood tonight?' }),
      h('p', { class: 'sub', text: 'Mix and match — we\'ll suggest genres to fit.' }),
      grid,
      h('div', { class: 'actions' }, next, h('div', { class: 'actions-row' }, h('button', { class: 'btn-link', text: '← Back', onclick: function () { go('language'); } }), meter)));
    paint();
    return el;
  };

  /* ---------- Genre (mood-suggested + user editable) ---------- */
  function syncGenresToMoods() {
    var key = S.sel.moods.slice().sort().join('|');
    if (S.gs.moodKey === key) { return; }
    var gs = S.gs;
    gs.suggested = ENGINE.suggestGenres(S.catalogue, S.sel.moods);
    gs.recommended = gs.suggested.slice();
    gs.added = gs.added.filter(function (g) { return gs.recommended.indexOf(g) < 0; });
    var keptAdded = gs.selected.filter(function (g) { return gs.added.indexOf(g) >= 0; });
    gs.selected = gs.recommended.concat(keptAdded);
    gs.moodKey = key;
    S.sel.genres = gs.selected.slice();
  }
  function resetGenres() {
    var gs = S.gs;
    gs.recommended = gs.suggested.slice(); gs.added = []; gs.selected = gs.suggested.slice();
    S.sel.genres = gs.selected.slice();
  }

  SCREENS.genre = function () {
    syncGenresToMoods();
    var cat = S.catalogue, gs = S.gs, meter = matchMeter(2);
    var chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'Genres' });
    var anyNote = h('div', { class: 'note' });

    function chip(g, kind) {
      var on = gs.selected.indexOf(g) >= 0;
      return h('div', { class: 'gchip ' + kind + (on ? ' on' : '') },
        h('button', { class: 'tog', 'aria-pressed': on ? 'true' : 'false', onclick: function () { toggle(gs.selected, g); vibrate(6); paint(); } },
          h('span', { text: g }),
          h('span', { class: 'ct', text: String(cat.counts.genres[g] || 0) }),
          h('span', { class: 'tag', text: kind === 'rec' ? '★ Suggested' : '+ Added' })),
        h('button', { class: 'x', 'aria-label': 'Remove ' + g, text: '×', onclick: function () {
          gs.selected = gs.selected.filter(function (x) { return x !== g; });
          if (kind === 'rec') { gs.recommended = gs.recommended.filter(function (x) { return x !== g; }); }
          else { gs.added = gs.added.filter(function (x) { return x !== g; }); }
          paint();
        } }));
    }
    function paint() {
      clear(chips);
      gs.recommended.forEach(function (g) { chips.appendChild(chip(g, 'rec')); });
      gs.added.forEach(function (g) { chips.appendChild(chip(g, 'usr')); });
      if (!gs.recommended.length && !gs.added.length) { chips.appendChild(h('p', { class: 'sub', text: 'No genres on the list yet — add a few, or continue with any genre.' })); }
      S.sel.genres = gs.selected.slice();
      clear(anyNote);
      if (!S.sel.genres.length) { append(anyNote, [h('b', { text: 'Any genre. ' }), 'Nothing selected, so we won\'t filter by genre.']); }
      else { append(anyNote, ['Showing movies in ', h('b', { text: 'any' }), ' of your ' + plural(S.sel.genres.length, 'selected genre') + '. Tap a chip to switch it off, × to remove it.']); }
      meter.update(); saveSel();
    }
    function openAdd() {
      var onList = gs.recommended.concat(gs.added);
      var avail = cat.genres.filter(function (g) { return onList.indexOf(g) < 0; });
      var wrap = h('div', { class: 'chips' });
      if (!avail.length) { wrap.appendChild(h('p', { class: 'sub', text: 'Every genre is already on your list.' })); }
      avail.forEach(function (g) {
        wrap.appendChild(h('button', { class: 'add-chip', onclick: function (e) {
          if (gs.suggested.indexOf(g) >= 0) { gs.recommended.push(g); } else { gs.added.push(g); }
          if (gs.selected.indexOf(g) < 0) { gs.selected.push(g); }
          e.currentTarget.remove(); paint(); toast('Added ' + g);
        } }, '+ ' + g, h('small', { text: String(cat.counts.genres[g] || 0) })));
      });
      openSheet('Add a genre', 'Tap to add. Added genres are marked in blue.', wrap);
    }
    var moodsLine = S.sel.moods.map(function (m) { return moodMeta(m).emoji + ' ' + m; }).join('  ·  ');
    var el = h('section', { class: 'screen select-screen' },
      h('p', { class: 'eyebrow', text: 'Step 3 · Genre' }),
      h('h1', { class: 'q', 'data-autofocus': true, text: 'Here\'s what fits your vibe' }),
      h('p', { class: 'sub', text: 'Suggested for ' + moodsLine + '. Make it yours.' }),
      h('div', { class: 'legend' }, h('span', { class: 'rec', text: 'Suggested from your moods' }), h('span', { class: 'usr', text: 'Added by you' })),
      h('div', { class: 'tools' },
        h('button', { class: 'chip-btn solid', text: '+ Add genre', onclick: openAdd }),
        h('button', { class: 'chip-btn', text: '↺ Reset to suggested', onclick: function () { resetGenres(); paint(); toast('Back to suggested genres'); } }),
        h('button', { class: 'chip-btn', text: 'Clear all', onclick: function () { gs.selected = []; paint(); } })),
      chips, anyNote,
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-primary', onclick: function () { go('platform'); } }, 'NEXT →'),
        h('div', { class: 'actions-row' }, h('button', { class: 'btn-link', text: '← Back', onclick: function () { go('mood'); } }), meter)));
    paint();
    return el;
  };

  /* ---------- Platform ---------- */
  SCREENS.platform = function () {
    var cat = S.catalogue, ready = cat.platformDataReady, meter = matchMeter(3), next;
    var grid = h('div', { class: 'grid plat', role: 'group', 'aria-label': 'Streaming platforms' });
    var note = h('div', { class: ready ? 'note' : 'note warn' });
    // Counts reflect the language, mood and genre picks made on the previous steps.
    var prior = ENGINE.filterMovies(cat, partialSel(2));
    var counts = {};
    prior.forEach(function (m) { m.platforms.forEach(function (p) { counts[p.name] = (counts[p.name] || 0) + 1; }); });
    var usable = cat.platforms.filter(function (p) { return ready && counts[p]; });
    S.sel.platforms = S.sel.platforms.filter(function (p) { return usable.indexOf(p) >= 0; });
    function paint() {
      Array.prototype.forEach.call(grid.children, function (b) { b.setAttribute('aria-pressed', S.sel.platforms.indexOf(b.dataset.v) >= 0 ? 'true' : 'false'); });
      clear(note);
      if (!ready) {
        append(note, [h('b', { text: 'Streaming availability for ' + cat.region.label + ' isn\'t loaded yet. ' }),
          'The roulette will search the full catalogue.']);
      } else if (!S.sel.platforms.length) {
        append(note, [h('b', { text: 'Pick at least one platform. ' }), 'A movie on any one of your picks counts.']);
      } else {
        append(note, ['Movies on ', h('b', { text: S.sel.platforms.join(' or ') }), ' in ' + cat.region.label + '.']);
      }
      if (next) { next.disabled = ready && !S.sel.platforms.length; }
      meter.update(); saveSel();
    }
    cat.platforms.forEach(function (p) {
      var pm = platformMeta(p), n = counts[p] || 0;
      grid.appendChild(h('button', { class: 'card plat-card' + (ready ? '' : ' locked'), 'data-v': p, 'aria-pressed': 'false', disabled: !ready || n === 0,
        onclick: function () { toggle(S.sel.platforms, p); vibrate(8); paint(); } },
        h('span', { class: 'check', text: '✓', 'aria-hidden': 'true' }),
        h('span', { class: 'plat-logo', style: { '--pc': pm.color }, text: pm.mono, 'aria-hidden': 'true' }),
        h('span', { class: 'pn' }, p, h('span', { class: 'ps', text: !ready ? 'Availability pending' : n ? plural(n, 'match', 'matches') : 'No matches' }))));
    });
    next = h('button', { class: 'btn btn-primary', onclick: function () { S.surprise = false; go('roulette'); } }, 'NEXT →');
    var el = h('section', { class: 'screen select-screen' },
      h('p', { class: 'eyebrow', text: 'Step 4 · Platform · ' + cat.region.label }),
      h('h1', { class: 'q', 'data-autofocus': true, text: 'Where should we look?' }),
      h('p', { class: 'sub', text: 'Pick your subscriptions — as many as you like.' + (CFG.publicDemo ? ' (Availability shown is demo data.)' : '') }),
      ready ? h('div', { class: 'tools' },
        h('button', { class: 'chip-btn', text: 'Select all', onclick: function () { S.sel.platforms = usable.slice(); paint(); } }),
        h('button', { class: 'chip-btn', text: 'Clear', onclick: function () { S.sel.platforms = []; paint(); } })) : null,
      grid, note,
      h('div', { class: 'actions' }, next,
        h('div', { class: 'actions-row' }, h('button', { class: 'btn-link', text: '← Back', onclick: function () { go('genre'); } }), meter)));
    paint();
    return el;
  };

  /* ---------- Roulette ---------- */
  function currentPool() {
    return S.surprise ? S.catalogue.movies.slice() : ENGINE.filterMovies(S.catalogue, S.sel);
  }
  function wheelItemsFor(pool) {
    var W = CFG.wheel, items;
    if (pool.length <= W.maxSegments) {
      items = ENGINE.sample(pool, pool.length);
      var base = items.slice();
      while (items.length < W.minSegments) { items = items.concat(base); }
      if (items.length > 1 && items[0].id === items[items.length - 1].id && base.length > 1) { items.push(items.shift()); }
    } else {
      items = ENGINE.sample(pool, W.maxSegments);
    }
    return items.map(function (m) { return { id: m.id, label: m.title, sub: m.languages[0] || '' }; });
  }

  function summaryPills() {
    if (S.surprise) { return h('div', { class: 'summary-pills' }, h('span', { text: '🎲 Surprise mode · whole catalogue' })); }
    var c = S.catalogue, out = [];
    out.push(S.sel.languages.length === c.languages.length ? 'All languages' : S.sel.languages.join(' / '));
    out.push(S.sel.moods.map(function (m) { return moodMeta(m).emoji + ' ' + m; }).join(' / '));
    out.push(S.sel.genres.length ? S.sel.genres.join(' / ') : 'Any genre');
    out.push(c.platformDataReady && S.sel.platforms.length ? S.sel.platforms.join(' / ') : 'Any platform');
    return h('div', { class: 'summary-pills' }, out.map(function (t) { return h('span', { text: t }); }));
  }

  SCREENS.roulette = function (o) {
    o = o || {};
    var pool = currentPool();
    S.pool = pool;
    if (!pool.length) { return emptyState(); }

    var status = h('div', { class: 'spin-status', 'aria-live': 'polite', text: plural(pool.length, 'movie') + ' in the draw' });
    var wrap = h('div', { class: 'wheel-wrap' });
    wrap.appendChild(h('div', { class: 'wheel-rim', 'aria-hidden': 'true' }));
    var pointer = h('div', { class: 'pointer', 'aria-hidden': 'true' });
    pointer.appendChild(pointerSvg());
    var hub = h('button', { class: 'hub', 'aria-label': 'Spin the roulette', text: 'SPIN', onclick: function () { spin(); } });
    var spinBtn = h('button', { class: 'btn btn-gold btn-block', onclick: function () { spin(); } }, '🎡 SPIN');

    var stack = h('div', { class: 'stack', 'aria-hidden': 'true' });
    ENGINE.sample(pool, Math.min(5, pool.length)).forEach(function (m, i, arr) {
      var k = i - (arr.length - 1) / 2;
      var p = posterEl(m, { noLang: true });
      p.style.setProperty('--i', String(k));
      p.style.transform = 'translateX(-50%) rotate(' + (k * 7) + 'deg)';
      p.style.zIndex = String(10 - Math.abs(Math.round(k)));
      stack.appendChild(p);
    });

    var el = h('section', { class: 'screen roulette' },
      h('div', { class: 'roulette-head' },
        h('p', { class: 'eyebrow', text: S.surprise ? 'Surprise mode' : 'Step 5 · Spin' }),
        h('h1', { class: 'q', 'data-autofocus': true }, h('span', { class: 'grad-text', text: 'YOUR MOVIE NIGHT IS READY' })),
        h('p', { class: 'sub', text: 'We found movies matching your vibe.' }),
        h('div', { class: 'pool-line' }, h('span', { class: 'pool-count', text: String(pool.length) }), h('span', { text: pool.length === 1 ? 'eligible movie' : 'eligible movies' })),
        summaryPills()),
      h('div', { class: 'roulette-body' },
        h('div', {}, wrap),
        h('div', { class: 'roulette-side' }, stack, status, spinBtn,
          h('div', { class: 'actions-row' },
            h('button', { class: 'btn-link', text: S.surprise ? '← Home' : '← Edit picks', onclick: function () { if (!S.spinning) { go(S.surprise ? 'welcome' : 'platform'); } } }),
            h('button', { class: 'btn-link', text: '↺ Reshuffle', onclick: function () { if (!S.spinning) { S.wheelItems = wheelItemsFor(pool); S.wheel.setItems(S.wheelItems); toast('Wheel reshuffled'); } } }),
            h('button', { class: 'btn-link', text: '✕ Reset', onclick: function () { if (!S.spinning) { resetAll(); } } })))));

    wrap.appendChild(pointer); wrap.appendChild(hub);

    function spin() {
      if (S.spinning) { return; }
      S.spinning = true; hub.disabled = true; spinBtn.disabled = true;
      status.classList.remove('win'); status.textContent = 'Spinning…';
      var winner = ENGINE.pickMovie(pool, S.history);
      var winnerItem = { id: winner.id, label: winner.title, sub: winner.languages[0] || '' };
      var hits = []; S.wheelItems.forEach(function (it, i) { if (it.id === winner.id) { hits.push(i); } });
      var k = hits.length ? hits[Math.floor(Math.random() * hits.length)] : Math.floor(Math.random() * S.wheelItems.length);
      S.wheel.spinTo(k, {
        durationMs: CFG.wheel.spinMs,
        turns: CFG.wheel.minTurns + Math.floor(Math.random() * (CFG.wheel.maxTurns - CFG.wheel.minTurns + 1)),
        beforeLand: function () { if (!hits.length) { S.wheelItems[k] = winnerItem; S.wheel.replaceItem(k, winnerItem); } }
      }).then(function () {
        S.history.push(winner.id); if (S.history.length > 50) { S.history.shift(); }
        S.current = winner;
        status.textContent = '🎉 We have a winner!'; status.classList.add('win');
        vibrate([30, 40, 60]);
        var r = wrap.getBoundingClientRect();
        FX.confetti({ count: 90, x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + 20) / window.innerHeight });
        setTimeout(function () { S.spinning = false; go('reveal'); }, FX.reduceMotion ? 200 : 1100);
      }, function () { S.spinning = false; hub.disabled = false; spinBtn.disabled = false; });
    }

    // build wheel after insertion so it can measure itself
    setTimeout(function () {
      if (S.wheel) { S.wheel.destroy(); }
      S.wheelItems = wheelItemsFor(pool);
      S.wheel = new window.MN_Roulette(wrap, {
        onTick: function () { pointer.classList.remove('tick'); void pointer.offsetWidth; pointer.classList.add('tick'); }
      });
      S.wheel.setItems(S.wheelItems);
      if (pool.length === 1) { status.textContent = 'Only one movie fits — it\'s destiny.'; }
      if (o.autoSpin) { setTimeout(spin, FX.reduceMotion ? 50 : 550); }
    }, 0);
    return el;
  };

  function pointerSvg() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 44 56');
    var defs = document.createElementNS(NS, 'defs');
    var lg = document.createElementNS(NS, 'linearGradient'); lg.setAttribute('id', 'pg'); lg.setAttribute('x1', '0'); lg.setAttribute('x2', '0'); lg.setAttribute('y1', '0'); lg.setAttribute('y2', '1');
    [['0', '#FDE68A'], ['.55', '#FBBF24'], ['1', '#B45309']].forEach(function (s) { var st = document.createElementNS(NS, 'stop'); st.setAttribute('offset', s[0]); st.setAttribute('stop-color', s[1]); lg.appendChild(st); });
    defs.appendChild(lg); svg.appendChild(defs);
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M22 54 L4 16 A18 18 0 1 1 40 16 Z'); path.setAttribute('fill', 'url(#pg)'); path.setAttribute('stroke', '#78350F'); path.setAttribute('stroke-width', '2');
    var c = document.createElementNS(NS, 'circle'); c.setAttribute('cx', '22'); c.setAttribute('cy', '17'); c.setAttribute('r', '6'); c.setAttribute('fill', '#E11D48'); c.setAttribute('stroke', '#FFF'); c.setAttribute('stroke-width', '2');
    svg.appendChild(path); svg.appendChild(c);
    return svg;
  }

  function emptyState() {
    var d = ENGINE.diagnose(S.catalogue, S.sel);
    function fix(title, hint, gain, fn) {
      return h('button', { class: 'fix', onclick: fn },
        h('span', {}, h('b', { text: title }), h('small', { text: hint })),
        gain !== null ? h('span', { class: 'gain', text: gain ? '→ ' + gain : '' }) : null);
    }
    return h('section', { class: 'screen empty' },
      h('div', { class: 'big-emo', text: '🎭', 'aria-hidden': 'true' }),
      h('h1', { class: 'q', 'data-autofocus': true, text: 'Looks like we have a very specific movie mood tonight!' }),
      h('p', { class: 'sub', text: 'Nothing matches every pick at once. Loosen one thing and we\'ll be rolling:' }),
      summaryPills(),
      h('div', { class: 'fixes' },
        fix('Remove a genre', S.sel.genres.length ? 'Drop a genre or two' : 'Genres are already open', d.genres ? plural(d.genres, 'movie') + ' w/o genre filter' : '', function () { go('genre'); }),
        fix('Change mood', 'Try a different vibe', d.moods ? plural(d.moods, 'movie') + ' w/o mood filter' : '', function () { go('mood'); }),
        fix('Change language', 'Add another language', d.languages ? plural(d.languages, 'movie') + ' in any language' : '', function () { go('language'); }),
        fix('Change platform', S.catalogue.platformDataReady ? 'Add another service' : 'Availability not filtered yet', S.catalogue.platformDataReady && d.platforms ? plural(d.platforms, 'movie') + ' on any platform' : '', function () { go('platform'); })),
      h('div', { class: 'actions' },
        h('button', { class: 'btn btn-ghost', onclick: function () { S.surprise = true; go('roulette', { autoSpin: true }); } }, '🎲 JUST SURPRISE ME')));
  }

  /* ---------- Reveal ---------- */
  SCREENS.reveal = function () {
    var m = S.current;
    if (!m) { return SCREENS.roulette({}); }
    var cat = S.catalogue;
    var bg = h('div', { class: 'reveal-bg', 'aria-hidden': 'true' }, posterEl(m, { noLang: true }));

    var rating = null;
    if (m.rating !== null) {
      rating = h('span', { class: 'imdb' }, '⭐ ' + m.rating.toFixed(1), h('small', { text: 'IMDb' + (m.votes !== null ? ' · ' + fmtVotes(m.votes) + ' votes' : '') }));
    }
    var pending = !cat.metadataReady || m.rating === null ? h('span', { class: 'pending-pill', title: m.metadataStatus || '', text: 'IMDb rating coming soon' }) : null;

    var meta = [];
    if (m.runtime) { meta.push(fmtRuntime(m.runtime)); }
    if (m.year) { meta.push(String(m.year)); }
    meta.push(m.languages.join(', '));
    if (m.moods.length) { meta.push(m.moods.map(function (x) { return moodMeta(x).emoji + ' ' + x; }).join(', ')); }

    var avail = h('div', { class: 'avail' }, h('h3', { text: 'Where to watch · ' + cat.region.label + (CFG.publicDemo ? ' · demo data' : '') }));
    if (m.platforms.length) {
      avail.appendChild(h('div', { class: 'avail-list' }, m.platforms.map(function (p) {
        var pm = platformMeta(p.name);
        return h('span', { class: 'avail-pill' }, h('i', { style: { '--pc': pm.color }, text: pm.mono }), 'Available on ' + p.name, p.verified ? h('small', { text: '✓ ' + p.verified }) : null);
      })));
    } else {
      avail.appendChild(h('p', { text: cat.platformDataReady
        ? 'No verified streaming option in ' + cat.region.label + ' right now.'
        : 'Streaming availability in ' + cat.region.label + ' hasn\'t been verified for this catalogue yet.' }));
    }

    var trailerBtn = h('button', { class: 'btn btn-ghost', disabled: !m.trailer, title: m.trailer ? '' : 'No trailer link in the catalogue yet',
      onclick: function () { if (m.trailer) { openExternal(m.trailer, 'Watch trailer'); } } }, m.trailer ? '▶ WATCH TRAILER' : 'NO TRAILER YET');
    var whereBtn = h('button', { class: 'btn btn-ghost', onclick: function () { whereToWatch(m); } }, '📺 WHERE TO WATCH');
    var againBtn = h('button', { class: 'btn btn-primary span2', onclick: function () { go('roulette', { autoSpin: true }); } }, '🎡 SPIN AGAIN');
    var moodBtn = h('button', { class: 'btn btn-ghost span2', onclick: function () { S.surprise = false; go('mood'); } }, '🎭 CHANGE MY MOOD');

    document.body.appendChild(bg);
    var el = h('section', { class: 'screen reveal' },
      h('p', { class: 'eyebrow', style: { 'text-align': 'center' }, text: '★ TONIGHT\'S PICK ★' }),
      h('div', { class: 'reveal-grid' },
        h('div', { class: 'reveal-poster' }, posterEl(m)),
        h('p', { class: 'your-movie', text: 'Your movie is…' }),
        h('h1', { class: 'reveal-title', 'data-autofocus': true, text: m.title }),
        m.originalTitle && m.originalTitle !== m.title ? h('div', { class: 'orig-title', text: m.originalTitle }) : null,
        h('div', { class: 'rating-line' }, rating, pending),
        h('p', { class: 'synopsis' + (m.synopsis ? '' : ' pending'), text: m.synopsis || fallbackSynopsis(m) }),
        h('div', { class: 'meta-line' }, meta.map(function (t) { return h('span', { text: t }); })),
        m.genres.length ? h('div', { class: 'genre-tags' }, m.genres.map(function (g) { return h('span', { text: g }); })) : null,
        avail,
        h('div', { class: 'reveal-actions' }, againBtn, trailerBtn, whereBtn, moodBtn),
        h('div', { class: 'actions-row', style: { 'justify-content': 'center' } },
          h('button', { class: 'btn-link', text: '✕ Start over', onclick: resetAll }))));

    setTimeout(function () { FX.confetti({ count: 180, y: .3 }); vibrate(40); }, FX.reduceMotion ? 0 : 1250);
    return el;
  };

  /* Factual one-liner built only from catalogue fields, for titles with no written synopsis yet. */
  function fallbackSynopsis(m) {
    var bits = [m.year ? m.year + ' ' : '', (m.languages[0] || '') + ' film'];
    var mood = m.moods.length ? ' for a ' + m.moods[0].toLowerCase() + ' movie night' : '';
    var phrase = bits.join('');
    return (/^[AEIOU8]/i.test(phrase) ? 'An ' : 'A ') + phrase + mood + '. A full synopsis is on its way.';
  }

  function statusLabel(st) {
    var u = String(st || '').toUpperCase();
    if (!u || (CFG.displayAsAvailable || []).indexOf(u) >= 0) { return CFG.publicDemo ? 'Demo listing (not verified)' : 'Available'; }
    return st;
  }

  function whereToWatch(m) {
    var cat = S.catalogue;
    var body = h('div', {});
    if (m.platforms.length) {
      m.platforms.forEach(function (p) {
        body.appendChild(h('div', { class: 'link-row' },
          h('span', {}, h('b', { text: p.name }), h('small', { style: { display: 'block', color: 'var(--muted-2)' }, text: statusLabel(p.status) + (p.verified ? ' · verified ' + p.verified : '') })),
          p.url ? h('button', { class: 'chip-btn solid', text: 'Find on ' + p.name + ' ↗', onclick: function () { openExternal(p.url, p.name); } }) : h('small', { text: 'No link on file' })));
      });
    } else {
      body.appendChild(h('p', { text: cat.platformDataReady
        ? 'We have no verified streaming option for this title in ' + cat.region.label + '.'
        : 'Availability hasn\'t been verified for the ' + cat.region.label + ' catalogue yet, so we won\'t point you at a guess.' }));
    }
    if (m.imdbUrl) {
      body.appendChild(h('div', { class: 'link-row' }, h('span', { text: 'IMDb title page' }),
        h('button', { class: 'chip-btn solid', text: 'Open ↗', onclick: function () { openExternal(m.imdbUrl, 'IMDb'); } })));
    }
    openSheet('Where to watch ' + m.title, 'Verified availability for ' + cat.region.label + ' only.', body);
  }

  function resetAll() {
    S.sel = { languages: [], moods: [], genres: [], platforms: [] };
    S.gs = { moodKey: null, suggested: [], recommended: [], added: [], selected: [] };
    S.history = []; S.current = null; S.surprise = false;
    saveSel();
    go('welcome');
  }

  /* ---------------------------------------------------------------- boot ----------- */
  function applyData(info) {
    S.loadInfo = info;
    S.catalogue = ENGINE.buildCatalogue(info.tables, CFG);
    if (!S.catalogue.movies.length) { throw new Error('The Movies datasource returned no rows.'); }
  }

  function refreshCatalogue() {
    go('loading', { msg: 'Refreshing the catalogue…' });
    S.adapter.refresh().then(function (info) { applyData(info); go('welcome'); toast('Catalogue refreshed · ' + plural(S.catalogue.movies.length, 'film')); })
      .catch(function (e) { go('error', { message: String((e && e.message) || e) }); });
  }

  function boot() {
    if (!root) { return; }
    if (!stage) { atmosphere(); buildShell(); }
    go('loading');
    S.adapter = window.MN_DATA.pickAdapter();
    S.mode = S.adapter.mode;
    renderTopbar();
    S.adapter.init().then(function () { return S.adapter.load(); }).then(function (info) {
      applyData(info);
      loadSel();
      if (info.warnings && info.warnings.length) { setTimeout(function () { toast(info.warnings[0]); }, 800); }
      go('welcome');
    }).catch(function (err) {
      go('error', { message: String((err && (err.message || err.errorCode)) || err) });
    });
  }

  window.addEventListener('error', function (e) { if (stage && S.screen === 'loading') { go('error', { message: e.message }); } });
  boot();
})();
