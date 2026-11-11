/* =====================================================================================
 * Movie Night Decision Engine — RECOMMENDATION LOGIC (pure, no DOM)
 *   buildCatalogue(tables, config) -> catalogue (normalised, de-duplicated, indexed)
 *   suggestGenres(catalogue, moods) -> [genre]
 *   filterMovies(catalogue, selection) -> [movie]      OR within a category, AND across
 *   diagnose(catalogue, selection) -> what relaxing each filter would yield
 *   pickMovie(pool, history, rng) -> movie              avoids immediate repeats
 * Works in the browser (window.MN_ENGINE) and Node (module.exports) for testing.
 * ===================================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.MN_ENGINE = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function str(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function num(v) {
    var s = str(v).replace(/,/g, '');
    if (!s) { return null; }
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function upper(v) { return str(v).toUpperCase(); }
  function uniq(arr) {
    var seen = {}, out = [];
    arr.forEach(function (x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }
  function httpsOnly(u) { var s = str(u); return /^https:\/\//i.test(s) ? s : ''; }

  function canonicalPlatform(name, config) {
    var u = upper(name);
    if (!u) { return ''; }
    for (var i = 0; i < config.platforms.length; i++) {
      var p = config.platforms[i];
      if (upper(p.name) === u || (p.aliases || []).indexOf(u) >= 0) { return p.name; }
    }
    return str(name);
  }

  function buildCatalogue(tables, config) {
    var region = config.regions[config.activeRegion] || { label: config.activeRegion, aliases: [config.activeRegion] };
    var regionAliases = region.aliases.map(upper);
    var okStatus = config.availableStatuses.map(upper);
    var excludedTypes = (config.excludedTitleTypes || []).map(upper);
    var stats = { rawMovies: 0, excludedType: 0, excludedVotes: 0, mergedDuplicates: 0, platformRowsInRegion: 0, platformRowsOther: 0 };

    var byId = {};          // Movie_ID -> movie
    var byImdb = {};        // IMDb_ID  -> movie (for de-duplication)
    var alias = {};         // duplicate Movie_ID -> surviving movie

    (tables.movies || []).forEach(function (r) {
      var id = str(r.Movie_ID);
      if (!id) { return; }
      stats.rawMovies++;
      if (excludedTypes.indexOf(upper(r.Title_Type)) >= 0) { stats.excludedType++; return; }
      var votes = num(r.IMDb_Vote_Count);
      if (votes !== null && config.minVoteThreshold > 0 && votes < config.minVoteThreshold) { stats.excludedVotes++; return; }
      var imdbId = str(r.IMDb_ID);
      if (byId[id]) { return; }
      if (imdbId && byImdb[imdbId]) { alias[id] = byImdb[imdbId]; stats.mergedDuplicates++; return; }
      var m = {
        id: id,
        title: str(r.Movie_Title) || str(r.Original_Title) || id,
        originalTitle: str(r.Original_Title),
        originalLanguage: str(r.Original_Language),
        year: num(r.Release_Year),
        rating: num(r.IMDb_Rating),
        votes: votes,
        rank: num(r.IMDb_Rank),
        imdbId: imdbId,
        runtime: num(r.Runtime_Minutes),
        synopsis: str(r.Synopsis),
        poster: httpsOnly(r.Poster_URL),
        trailer: httpsOnly(r.Trailer_URL),
        imdbUrl: httpsOnly(r.IMDb_URL) || (/^tt\d+$/.test(imdbId) ? 'https://www.imdb.com/title/' + imdbId + '/' : ''),
        asOf: str(r.As_Of_Date),
        metadataStatus: str(r.Metadata_Status),
        languages: [], moods: [], genres: [], platforms: []
      };
      byId[id] = m;
      if (imdbId) { byImdb[imdbId] = m; }
    });

    function target(id) { id = str(id); return byId[id] || alias[id] || null; }
    function addTo(list, key, valFn) {
      (list || []).forEach(function (r) {
        var m = target(r.Movie_ID); var v = valFn(r);
        if (m && v && m[key].indexOf(v) < 0) { m[key].push(v); }
      });
    }
    addTo(tables.movieLanguages, 'languages', function (r) { return str(r.Language); });
    addTo(tables.movieMoods, 'moods', function (r) { return str(r.Mood); });
    addTo(tables.movieGenres, 'genres', function (r) { return str(r.Genre); });

    (tables.moviePlatforms || []).forEach(function (r) {
      var m = target(r.Movie_ID); if (!m) { return; }
      var inRegion = regionAliases.indexOf(upper(r.Country)) >= 0;
      var available = okStatus.indexOf(upper(r.Availability_Status)) >= 0;
      if (!inRegion) { stats.platformRowsOther++; return; }
      if (!available) { return; }
      var name = canonicalPlatform(r.Platform, config);
      if (!name) { return; }
      stats.platformRowsInRegion++;
      if (!m.platforms.some(function (p) { return p.name === name; })) {
        m.platforms.push({ name: name, url: httpsOnly(r.Availability_URL), verified: str(r.Verified_Date), status: str(r.Availability_Status) });
      }
    });

    var movies = Object.keys(byId).map(function (k) { return byId[k]; });
    movies.forEach(function (m) {
      if (!m.languages.length && m.originalLanguage) { m.languages.push(m.originalLanguage); }
    });

    /* Rank within language by rating desc (only where the data has ratings and no rank). */
    var hasRatings = movies.some(function (m) { return m.rating !== null; });
    if (hasRatings) {
      var byLang = {};
      movies.forEach(function (m) { m.languages.forEach(function (l) { (byLang[l] = byLang[l] || []).push(m); }); });
      Object.keys(byLang).forEach(function (l) {
        byLang[l].sort(function (a, b) { return (b.rating || 0) - (a.rating || 0) || (b.votes || 0) - (a.votes || 0); });
        byLang[l].forEach(function (m, i) { m.langRank = m.langRank || {}; m.langRank[l] = m.rank && m.languages.length === 1 ? m.rank : i + 1; });
      });
    }

    /* ---- Option lists (data-driven) ---- */
    function count(key) {
      var c = {};
      movies.forEach(function (m) { m[key].forEach(function (v) { c[v] = (c[v] || 0) + 1; }); });
      return c;
    }
    var langCounts = count('languages'), moodCounts = count('moods'), genreCounts = count('genres');
    var platformCounts = {};
    movies.forEach(function (m) { m.platforms.forEach(function (p) { platformCounts[p.name] = (platformCounts[p.name] || 0) + 1; }); });

    var configLangs = config.languages.map(function (l) { return l.name; });
    var languages = uniq(configLangs.concat((tables.languages || []).map(function (r) { return str(r.Language); }), Object.keys(langCounts)))
      .filter(function (l) { return langCounts[l] || configLangs.indexOf(l) >= 0; });
    var moods = uniq((tables.moods || []).map(function (r) { return str(r.Mood); }).concat(Object.keys(moodCounts)));

    var moodGenres = {};
    (tables.moodGenreMapping || []).forEach(function (r) {
      var mo = str(r.Mood), g = str(r.Suggested_Genre);
      if (mo && g) { (moodGenres[mo] = moodGenres[mo] || []); if (moodGenres[mo].indexOf(g) < 0) { moodGenres[mo].push(g); } }
    });
    var mappingSource = 'datasource';
    if (!Object.keys(moodGenres).length) { moodGenres = JSON.parse(JSON.stringify(config.fallbackMoodGenres || {})); mappingSource = 'config fallback'; }

    var genres = uniq((tables.genres || []).map(function (r) { return str(r.Genre); })
      .concat(Object.keys(genreCounts))).sort();

    var platforms = uniq(config.platforms.map(function (p) { return p.name; })
      .concat((tables.platforms || []).map(function (r) { return canonicalPlatform(r.Platform, config); })));

    var asOf = uniq(movies.map(function (m) { return m.asOf; })).sort().pop() || '';

    return {
      movies: movies,
      byId: byId,
      languages: languages, moods: moods, genres: genres, platforms: platforms,
      counts: { languages: langCounts, moods: moodCounts, genres: genreCounts, platforms: platformCounts },
      moodGenres: moodGenres, mappingSource: mappingSource,
      region: { code: config.activeRegion, label: region.label },
      platformDataReady: stats.platformRowsInRegion > 0,
      metadataReady: movies.some(function (m) { return m.rating !== null || m.year !== null; }),
      asOf: asOf,
      stats: stats
    };
  }

  function suggestGenres(cat, moods) {
    var out = [];
    (moods || []).forEach(function (mo) { (cat.moodGenres[mo] || []).forEach(function (g) { if (out.indexOf(g) < 0) { out.push(g); } }); });
    return out;
  }

  function anyIn(values, wanted) {
    for (var i = 0; i < wanted.length; i++) { if (values.indexOf(wanted[i]) >= 0) { return true; } }
    return false;
  }

  /* selection = { languages:[], moods:[], genres:[], platforms:[] }. Empty list = "any". */
  function matches(m, sel, cat, skip) {
    skip = skip || {};
    if (!skip.languages && sel.languages && sel.languages.length && !anyIn(m.languages, sel.languages)) { return false; }
    if (!skip.moods && sel.moods && sel.moods.length && !anyIn(m.moods, sel.moods)) { return false; }
    if (!skip.genres && sel.genres && sel.genres.length && !anyIn(m.genres, sel.genres)) { return false; }
    if (!skip.platforms && cat.platformDataReady && sel.platforms && sel.platforms.length &&
        !anyIn(m.platforms.map(function (p) { return p.name; }), sel.platforms)) { return false; }
    return true;
  }

  function filterMovies(cat, sel, skip) {
    return cat.movies.filter(function (m) { return matches(m, sel, cat, skip); });
  }

  /* How many movies would we get if we relaxed each filter? Used by the empty state. */
  function diagnose(cat, sel) {
    var out = {};
    ['genres', 'moods', 'languages', 'platforms'].forEach(function (k) {
      var s = {}; s[k] = true;
      out[k] = filterMovies(cat, sel, s).length;
    });
    return out;
  }

  /* Random pick; never the immediately previous movie unless it is the only option.
   * Also avoids the last few picks when the pool is big enough. */
  function pickMovie(pool, history, rng) {
    rng = rng || Math.random;
    if (!pool.length) { return null; }
    if (pool.length === 1) { return pool[0]; }
    history = history || [];
    var avoidN = Math.min(history.length, Math.max(1, Math.floor(pool.length / 3)), 5);
    var avoid = history.slice(-avoidN);
    var candidates = pool.filter(function (m) { return avoid.indexOf(m.id) < 0; });
    if (!candidates.length) {
      var last = history[history.length - 1];
      candidates = pool.filter(function (m) { return m.id !== last; });
    }
    return candidates[Math.floor(rng() * candidates.length)];
  }

  /* Fisher–Yates sample of n distinct items. */
  function sample(arr, n, rng) {
    rng = rng || Math.random;
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a.slice(0, n);
  }

  return { buildCatalogue: buildCatalogue, suggestGenres: suggestGenres, filterMovies: filterMovies,
    diagnose: diagnose, pickMovie: pickMovie, sample: sample, _num: num };
});
