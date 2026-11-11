/* =====================================================================================
 * Movie Night Decision Engine — DATA ACCESS LAYER
 * Two adapters with one contract:
 *   load() -> Promise<{ mode, source, loadedAt, tables: { movies:[], movieLanguages:[], ... },
 *                       warnings:[] }>
 * Rows are returned with CANONICAL field names (see MN_CONFIG.fieldAliases).
 *   - TableauAdapter : queries every wired datasource live via the Extensions API (queryAsync).
 *   - MockAdapter    : reads window.MN_MOCK_DATA (same table shape) for browser preview only.
 * ===================================================================================== */
(function (global) {
  'use strict';
  var CFG = global.MN_CONFIG;

  var TABLE_FIELDS = {
    movies: ['Movie_ID', 'Movie_Title', 'Original_Title', 'Original_Language', 'Release_Year',
      'IMDb_Rating', 'IMDb_Vote_Count', 'IMDb_Rank', 'IMDb_ID', 'Runtime_Minutes', 'Synopsis',
      'Poster_URL', 'Trailer_URL', 'IMDb_URL', 'As_Of_Date', 'Title_Type', 'Metadata_Status'],
    movieLanguages: ['Movie_ID', 'Language'],
    movieMoods: ['Movie_ID', 'Mood'],
    movieGenres: ['Movie_ID', 'Genre'],
    moviePlatforms: ['Movie_ID', 'Platform', 'Country', 'Availability_Status', 'Availability_URL', 'Verified_Date'],
    moodGenreMapping: ['Mood', 'Suggested_Genre'],
    moods: ['Mood'],
    genres: ['Genre'],
    languages: ['Language'],
    platforms: ['Platform']
  };
  var REQUIRED = { movies: true, movieLanguages: true, movieMoods: true, movieGenres: true };

  function extractData(result) {
    return result && Array.isArray(result.data) ? result.data : [];
  }

  function withTimeout(p, ms, label) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { reject(new Error(label + ' timed out')); }, ms);
      p.then(function (v) { clearTimeout(t); resolve(v); }, function (e) { clearTimeout(t); reject(e); });
    });
  }

  /* Map canonical field -> actual column present in the datasource. */
  function resolveColumns(canonicalList, available) {
    var lower = {};
    available.forEach(function (n) { lower[String(n).toLowerCase()] = n; lower[normKey(n)] = lower[normKey(n)] || n; });
    var map = {};
    canonicalList.forEach(function (canon) {
      var aliases = CFG.fieldAliases[canon] || [canon];
      for (var i = 0; i < aliases.length; i++) {
        var hit = lower[aliases[i].toLowerCase()] || lower[normKey(aliases[i])];
        if (hit) { map[canon] = hit; break; }
      }
    });
    return map;
  }

  /* Normalise a column name so "Movie_ID", "[Movie_ID]", "none:Movie_ID:nk", "ATTR(Movie_ID)" all match. */
  function normKey(k) {
    var s = String(k).toLowerCase().trim();
    var m = s.match(/^[a-z]+\((.*)\)$/); if (m) { s = m[1]; }
    m = s.match(/^[a-z]+:(.*):[a-z]+$/); if (m) { s = m[1]; }
    return s.replace(/^\[|\]$/g, '').replace(/\s*\(.*?\.csv\)$/, '').trim();
  }

  /* rows may be objects keyed by column name, or arrays in `order` column order. */
  function canonRows(rows, colMap, order) {
    var keys = Object.keys(colMap);
    return rows.map(function (r) {
      var o = {}, byNorm = null;
      if (Array.isArray(r) && order) {
        var obj = {}; order.forEach(function (c, i) { obj[c] = r[i]; }); r = obj;
      }
      keys.forEach(function (k) {
        var col = colMap[k], v = r[col];
        if (v === undefined) {
          if (!byNorm) { byNorm = {}; Object.keys(r).forEach(function (rk) { byNorm[normKey(rk)] = r[rk]; }); }
          v = byNorm[normKey(col)];
        }
        if (v && typeof v === 'object' && 'value' in v) { v = v.value; }  // {value, formattedValue}
        o[k] = (v === undefined || v === null || v === '%null%' || v === '') ? null : v;
      });
      return o;
    });
  }

  /* A table is usable if its key column actually came through. */
  function usable(key, rows) {
    var probe = TABLE_FIELDS[key][0] === 'Movie_ID' ? 'Movie_ID' : TABLE_FIELDS[key][0];
    return rows.some(function (r) { return r[probe] !== null && r[probe] !== undefined; });
  }
  function describe(rows) {
    if (!rows.length) { return '0 rows'; }
    var r = rows[0];
    return rows.length + ' rows, keys: ' + (Array.isArray(r) ? '[array ' + r.length + ']' : Object.keys(r).slice(0, 8).join(', '));
  }

  /* ----------------------------------------------------------------------------------- */
  var TableauAdapter = {
    mode: 'tableau',
    _dsByCaption: null,

    init: function () {
      return withTimeout(tableau.extensions.initializeAsync(), CFG.queryTimeoutMs, 'Tableau initialisation');
    },

    _getDataSources: function () {
      var wb = tableau.extensions.workbook;
      if (wb && typeof wb.getAllDataSourcesAsync === 'function') { return wb.getAllDataSourcesAsync(); }
      var wc = tableau.extensions.worksheetContent;
      if (wc && wc.worksheet) { return wc.worksheet.getDataSourcesAsync(); }
      return Promise.resolve([]);
    },

    /* Primary path: VizQL Data Service query (published datasources). Embedded file
     * datasources can reject it ("ExecuteCommand failed: Invalid command"), so fall back to
     * the logical-table data reader, then to getUnderlyingDataAsync for older hosts. */
    _queryTable: function (key, ds) {
      var self = this;
      return self._queryVds(key, ds).catch(function (vdsErr) {
        return self._readTable(key, ds).catch(function (readErr) {
          throw new Error('VDS: ' + (vdsErr.message || vdsErr) + ' | reader: ' + (readErr.message || readErr));
        });
      });
    },

    _readTable: function (key, ds) {
      var canon = TABLE_FIELDS[key];
      var notes = [];
      function colName(c) {
        if (!c) { return ''; }
        return c.fieldName || c.fieldCaption || c.caption || c.name || c._fieldName || '';
      }
      function cellValue(cell) {
        if (cell === null || cell === undefined) { return null; }
        if (typeof cell === 'object') {
          var v = ('value' in cell) ? cell.value : (('nativeValue' in cell) ? cell.nativeValue : cell.formattedValue);
          return v;
        }
        return cell;
      }
      function toRows(dt, label) {
        var cols = (dt.columns || []).map(colName);
        var data = dt.data || [];
        var rowLen = data.length ? (data[0] || []).length : 0;
        // If column metadata is short, fall back to positional mapping using the canonical order.
        if (rowLen && cols.length < rowLen) { notes.push(label + ': ' + cols.length + ' column names for ' + rowLen + ' values'); }
        var rows = data.map(function (r) {
          var o = {};
          for (var i = 0; i < r.length; i++) {
            var name = cols[i] || ('__col' + i);
            var v = cellValue(r[i]);
            o[name] = (v === undefined || v === '%null%') ? null : v;
          }
          return o;
        });
        var out = canonRows(rows, resolveColumns(canon, cols));
        if (!usable(key, out)) {
          var sample = data.length ? (data[0] || []).slice(0, 4).map(function (c) { return String(cellValue(c)); }).join(' | ') : '';
          notes.push(label + ': ' + data.length + ' rows; columns [' + cols.slice(0, 12).join(', ') + ']; first row: ' + sample);
          return null;
        }
        return out;
      }
      function tryLogical() {
        if (typeof ds.getLogicalTablesAsync !== 'function' || typeof ds.getLogicalTableDataReaderAsync !== 'function') {
          return Promise.resolve(null);
        }
        return ds.getLogicalTablesAsync().then(function (tables) {
          tables = tables || [];
          notes.push('logical tables: ' + tables.map(function (t) { return t.caption || t.id; }).join(', '));
          var i = 0;
          function next() {
            if (i >= tables.length) { return null; }
            var t = tables[i++];
            return ds.getLogicalTableDataReaderAsync(t.id, 10000, { ignoreAliases: true, includeAllColumns: true })
              .then(function (reader) {
                return reader.getAllPagesAsync().then(function (dt) {
                  var done = typeof reader.releaseAsync === 'function' ? reader.releaseAsync().catch(function () {}) : Promise.resolve();
                  return done.then(function () { return toRows(dt, 'table ' + (t.caption || t.id)); });
                }, function (e) {
                  if (typeof reader.releaseAsync === 'function') { reader.releaseAsync().catch(function () {}); }
                  throw e;
                });
              })
              .then(function (rows) { return rows || next(); }, function (e) { notes.push('table ' + (t.caption || t.id) + ': ' + (e.message || e)); return next(); });
          }
          return next();
        });
      }
      function tryUnderlying() {
        var fn = ds.getUnderlyingDataAsync || ds.getUnderlyingTableDataAsync;
        if (typeof fn !== 'function') { return Promise.resolve(null); }
        return fn.call(ds, { ignoreAliases: true, includeAllColumns: true, maxRows: 0 })
          .then(function (dt) { return toRows(dt, 'underlying'); }, function (e) { notes.push('underlying: ' + (e.message || e)); return null; });
      }
      // Tableau allows only ONE active DataTableReader per extension: concurrent readers clobber
      // each other (columns from one table, rows from another). Queue every read behind the last.
      var run = function () {
        return tryLogical().catch(function (e) { notes.push('logical: ' + (e.message || e)); return null; })
          .then(function (rows) { return rows || tryUnderlying(); });
      };
      var p = (TableauAdapter._readQueue = (TableauAdapter._readQueue || Promise.resolve()).then(run, run))
        .then(function (rows) {
          if (!rows) { throw new Error(notes.join(' || ') || 'no table reader available'); }
          return rows;
        });
      return withTimeout(p, CFG.queryTimeoutMs, key + ' read');
    },

    _queryVds: function (key, ds) {
      var canon = TABLE_FIELDS[key];
      var metaP = typeof ds.readMetadataAsync === 'function'
        ? ds.readMetadataAsync().then(function (m) {
            return extractData(m).map(function (f) { return f.fieldCaption || f.fieldName; });
          })
        : Promise.resolve(canon);
      return metaP.then(function (available) {
        var colMap = resolveColumns(canon, available);
        var cols = Object.keys(colMap).map(function (k) { return colMap[k]; });
        if (!cols.length) { throw new Error('no recognised columns'); }
        var query = { fields: cols.map(function (c) { return { fieldCaption: c }; }) };
        return withTimeout(ds.queryAsync(query), CFG.queryTimeoutMs, key + ' query').then(function (res) {
          var raw = extractData(res);
          var out = canonRows(raw, colMap, cols);
          if (!usable(key, out)) { throw new Error('VDS returned ' + describe(raw)); }
          return out;
        });
      });
    },

    load: function () {
      var self = this;
      var warnings = [];
      return self._getDataSources().then(function (list) {
        var byName = {};
        (list || []).forEach(function (ds) { byName[ds.name] = ds; });
        self._dsByCaption = byName;
        if (!list || !list.length) { throw new Error('No data source found in the workbook.'); }
        var keys = Object.keys(TABLE_FIELDS);
        return Promise.all(keys.map(function (key) {
          var ds = byName[CFG.datasources[key]];
          if (!ds) {
            if (REQUIRED[key]) { return Promise.reject(new Error('Missing datasource "' + CFG.datasources[key] + '"')); }
            warnings.push('Datasource "' + CFG.datasources[key] + '" not found — using defaults.');
            return [];
          }
          return self._queryTable(key, ds).catch(function (err) {
            if (REQUIRED[key]) { throw new Error(CFG.datasources[key] + ': ' + (err.message || err)); }
            warnings.push(CFG.datasources[key] + ' could not be read (' + (err.message || err) + ').');
            return [];
          });
        })).then(function (results) {
          var tables = {};
          keys.forEach(function (k, i) { tables[k] = results[i]; });
          return { mode: 'tableau', source: 'Tableau workbook datasources', loadedAt: new Date(), tables: tables, warnings: warnings };
        });
      });
    },

    /* Re-read file/extract datasources, then re-query. */
    refresh: function () {
      var self = this;
      var all = self._dsByCaption ? Object.keys(self._dsByCaption).map(function (k) { return self._dsByCaption[k]; }) : [];
      return Promise.all(all.map(function (ds) {
        return typeof ds.refreshAsync === 'function' ? ds.refreshAsync().catch(function () {}) : null;
      })).then(function () { return self.load(); });
    }
  };

  /* ----------------------------------------------------------------------------------- */
  var MockAdapter = {
    mode: 'mock',
    init: function () { return Promise.resolve(); },
    load: function () {
      var raw = global.MN_MOCK_DATA;
      if (!raw) { return Promise.reject(new Error('Mock mode: window.MN_MOCK_DATA is not loaded.')); }
      var tables = {};
      Object.keys(TABLE_FIELDS).forEach(function (key) {
        var rows = raw[key] || [];
        var cols = rows.length ? Object.keys(rows[0]) : [];
        tables[key] = canonRows(rows, resolveColumns(TABLE_FIELDS[key], cols));
      });
      return new Promise(function (r) { setTimeout(r, 450); }).then(function () {
        return { mode: 'mock', source: raw.__source || 'Mock data (preview)', loadedAt: new Date(), tables: tables, warnings: [] };
      });
    },
    refresh: function () { return this.load(); }
  };

  /* Inside Tableau the extension is iframed and the API is present. Anything else = preview. */
  function pickAdapter() {
    var inFrame = false;
    try { inFrame = global.self !== global.top; } catch (e) { inFrame = true; }
    var hasApi = !!(global.tableau && global.tableau.extensions);
    // Tableau Desktop may host the extension top-level (not iframed), so the API + no mock data also means Tableau.
    if (hasApi && (inFrame || !global.MN_MOCK_DATA) && !global.MN_FORCE_MOCK) { return TableauAdapter; }
    return MockAdapter;
  }

  global.MN_DATA = { pickAdapter: pickAdapter, TableauAdapter: TableauAdapter, MockAdapter: MockAdapter, TABLE_FIELDS: TABLE_FIELDS };
})(window);
