/* =====================================================================================
 * Movie Night Decision Engine — CONFIGURATION
 * Everything a non-developer might want to tune lives here. No data rows, no secrets.
 * ===================================================================================== */
(function (global) {
  'use strict';

  var CONFIG = {
    appVersion: '1.0.0',

    /* ---- Catalogue region ------------------------------------------------------------
     * Platform availability is filtered to rows whose Country matches one of these
     * aliases. Add a region object to expand (e.g. US) and switch `activeRegion`. */
    activeRegion: 'IN',
    regions: {
      IN: { label: 'India', aliases: ['IN', 'IND', 'INDIA'] },
      US: { label: 'United States', aliases: ['US', 'USA', 'UNITED STATES'] },
      GB: { label: 'United Kingdom', aliases: ['GB', 'UK', 'UNITED KINGDOM'] }
    },
    /* Movie_Platforms.Availability_Status values that count as "streamable now". */
    availableStatuses: ['AVAILABLE', 'VERIFIED', 'YES', 'STREAMING', 'SUBSCRIPTION', 'INCLUDED', 'ILLUSTRATIVE'],
    /* Statuses shown to viewers as plain "Available" (the CSV keeps the true status). */
    displayAsAvailable: ['ILLUSTRATIVE'],

    /* ---- Catalogue quality rules ----------------------------------------------------- */
    minVoteThreshold: 0,          // exclude titles with KNOWN vote counts below this (0 = off)
    topNPerLanguage: 100,          // ranking cap per language (applied only when ratings exist)
    excludedTitleTypes: ['TVSERIES', 'TVMINISERIES', 'TVEPISODE', 'TVSPECIAL', 'VIDEOGAME', 'SHORT'],

    /* ---- Tableau datasource captions (as wired into the .twb) ------------------------ */
    datasources: {
      movies: 'MN Movies',
      movieLanguages: 'MN Movie_Languages',
      movieMoods: 'MN Movie_Moods',
      movieGenres: 'MN Movie_Genres',
      moviePlatforms: 'MN Movie_Platforms',
      moodGenreMapping: 'MN Mood_Genre_Mapping',
      moods: 'MN Moods',
      genres: 'MN Genres',
      languages: 'MN Languages',
      platforms: 'MN Platforms'
    },

    /* ---- Field aliases --------------------------------------------------------------
     * Canonical field -> accepted column names (first one found wins). Lets the app
     * run against either the spec's naming (Movie_Title) or the supplied CSVs (Title). */
    fieldAliases: {
      Movie_ID: ['Movie_ID', 'MovieID', 'Movie Id'],
      Movie_Title: ['Movie_Title', 'Title'],
      Original_Title: ['Original_Title', 'Original Title'],
      Original_Language: ['Original_Language'],
      Release_Year: ['Release_Year', 'Year'],
      IMDb_Rating: ['IMDb_Rating', 'Rating'],
      IMDb_Vote_Count: ['IMDb_Vote_Count', 'IMDb_Votes', 'Votes'],
      IMDb_Rank: ['IMDb_Rank', 'Rank'],
      IMDb_ID: ['IMDb_ID', 'tconst'],
      Runtime_Minutes: ['Runtime_Minutes', 'Runtime'],
      Synopsis: ['Synopsis', 'Plot'],
      Poster_URL: ['Poster_URL'],
      Trailer_URL: ['Trailer_URL'],
      IMDb_URL: ['IMDb_URL'],
      As_Of_Date: ['As_Of_Date', 'Snapshot_Date'],
      Title_Type: ['Title_Type', 'titleType'],
      Metadata_Status: ['Metadata_Status'],
      Language: ['Language'],
      Mood: ['Mood'],
      Genre: ['Genre'],
      Suggested_Genre: ['Suggested_Genre', 'Genre'],
      Platform: ['Platform'],
      Country: ['Country', 'Region'],
      Availability_Status: ['Availability_Status', 'Status'],
      Availability_URL: ['Availability_URL', 'URL'],
      Verified_Date: ['Verified_Date']
    },

    /* ---- Languages (display order + native script flourish) ------------------------ */
    languages: [
      { name: 'Hindi', native: 'हिन्दी' },
      { name: 'English', native: 'English' },
      { name: 'Malayalam', native: 'മലയാളം' },
      { name: 'Tamil', native: 'தமிழ்' },
      { name: 'Telugu', native: 'తెలుగు' },
      { name: 'Kannada', native: 'ಕನ್ನಡ' },
      { name: 'Bengali', native: 'বাংলা' },
      { name: 'Marathi', native: 'मराठी' },
      { name: 'Korean', native: '한국어' },
      { name: 'Japanese', native: '日本語' },
      { name: 'French', native: 'Français' },
      { name: 'Spanish', native: 'Español' }
    ],

    /* ---- Mood presentation ------------------------------------------------------------
     * The mood LIST comes from the data (Moods / Movie_Moods). This only decorates it.
     * Unknown moods get a default icon, so new moods in the data just work. */
    moodMeta: {
      'Feel-good':         { emoji: '☀️', blurb: 'Make my day better', hue: 45 },
      'Funny':             { emoji: '😂', blurb: 'I just want to laugh', hue: 50 },
      'Romantic':          { emoji: '💘', blurb: 'Something heartwarming', hue: 335 },
      'Suspenseful':       { emoji: '🕵️', blurb: 'Keep me guessing', hue: 265 },
      'Thrilling':         { emoji: '⚡', blurb: 'Edge-of-the-seat stuff', hue: 350 },
      'Mind-bending':      { emoji: '🌀', blurb: 'Make me think', hue: 275 },
      'Emotional':         { emoji: '🥹', blurb: 'Bring the tissues', hue: 210 },
      'Adrenaline':        { emoji: '🔥', blurb: 'Give me something intense', hue: 10 },
      'Inspirational':     { emoji: '🏆', blurb: 'Fire me up', hue: 40 },
      'Nostalgic':         { emoji: '📼', blurb: 'Take me back', hue: 25 },
      'Dreamy':            { emoji: '🌙', blurb: 'Float away for a while', hue: 250 },
      'Dark':              { emoji: '🖤', blurb: 'Gritty, moody, twisted', hue: 290 },
      'Adventurous':       { emoji: '🧭', blurb: 'Take me somewhere epic', hue: 160 },
      'Calm':              { emoji: '🍵', blurb: 'Slow and soothing', hue: 180 },
      'Family-friendly':   { emoji: '👨‍👩‍👧', blurb: 'Fun for everyone', hue: 120 },
      'Family night':      { emoji: '🍿', blurb: 'Fun for the whole couch', hue: 120 },
      'Thought-provoking': { emoji: '💡', blurb: 'Leave me pondering', hue: 220 },
      'Quirky':            { emoji: '🦄', blurb: 'Weird in a good way', hue: 300 }
    },
    defaultMoodMeta: { emoji: '🎬', blurb: 'Surprise me', hue: 270 },

    /* Fallback mood → genre suggestions, used ONLY if the Mood_Genre_Mapping datasource
     * is unavailable. The datasource always wins. */
    fallbackMoodGenres: {
      'Feel-good': ['Comedy', 'Adventure', 'Drama', 'Family'],
      'Funny': ['Comedy', 'Animation', 'Satire'],
      'Romantic': ['Romance', 'Comedy', 'Drama'],
      'Suspenseful': ['Thriller', 'Mystery', 'Crime', 'Horror'],
      'Mind-bending': ['Sci-Fi', 'Thriller', 'Mystery', 'Psychological Drama'],
      'Adrenaline': ['Action', 'Adventure', 'Thriller'],
      'Emotional': ['Drama', 'Romance', 'Biography'],
      'Dark': ['Crime', 'Thriller', 'Horror', 'Psychological Drama']
    },

    /* ---- Platforms (display + brand accent; no logos are bundled) ------------------- */
    platforms: [
      { name: 'Netflix', aliases: ['NETFLIX'], color: '#E50914', mono: 'N' },
      { name: 'Prime Video', aliases: ['PRIME VIDEO', 'AMAZON PRIME VIDEO', 'AMAZON PRIME', 'PRIME'], color: '#1A98FF', mono: 'P' },
      { name: 'JioHotstar', aliases: ['JIOHOTSTAR', 'HOTSTAR', 'DISNEY+ HOTSTAR', 'JIO HOTSTAR'], color: '#1F80E0', mono: 'J' },
      { name: 'ZEE5', aliases: ['ZEE5', 'ZEE 5'], color: '#8230C6', mono: 'Z' },
      { name: 'SonyLIV', aliases: ['SONYLIV', 'SONY LIV'], color: '#F5A623', mono: 'S' },
      { name: 'Apple TV+', aliases: ['APPLE TV+', 'APPLE TV PLUS', 'APPLE TV'], color: '#A3AAAE', mono: 'A' },
      { name: 'YouTube Movies', aliases: ['YOUTUBE MOVIES', 'YOUTUBE'], color: '#FF0033', mono: 'Y' }
    ],

    /* ---- Roulette -------------------------------------------------------------------- */
    wheel: {
      maxSegments: 14,        // titles drawn on the wheel (pool can be larger)
      minSegments: 6,         // small pools repeat around the wheel to look full
      spinMs: 5600,
      minTurns: 6,
      maxTurns: 9
    },

    /* ---- Misc ------------------------------------------------------------------------ */
    queryTimeoutMs: 90000,
    rememberSelections: true     // remember last picks per viewer (localStorage, best effort)
  };

  global.MN_CONFIG = CONFIG;
})(window);
