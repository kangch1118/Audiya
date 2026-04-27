const localTracks = [
  { title: "Supernova", artist: "aespa", mood: "happy", state: "drive", genre: "kpop", color: "orange", season: "summer", origin: "domestic" },
  { title: "Smoke Sprite", artist: "So!YoON! ft. RM", mood: "calm", state: "night", genre: "indie", color: "purple", season: "winter", origin: "domestic" },
  { title: "Hype Boy", artist: "NewJeans", mood: "happy", state: "walk", genre: "kpop", color: "orange", season: "spring", origin: "domestic" },
  { title: "Jasmine", artist: "DPR LIVE", mood: "calm", state: "night", genre: "rnb", color: "blue", season: "autumn", origin: "domestic" },
  { title: "Power", artist: "G-DRAGON", mood: "happy", state: "workout", genre: "hiphop", color: "red", season: "summer", origin: "domestic" },
  { title: "Time Lapse", artist: "TAEYEON", mood: "sad", state: "night", genre: "ballad", color: "blue", season: "winter", origin: "domestic" },
  { title: "After LIKE", artist: "IVE", mood: "happy", state: "workout", genre: "kpop", color: "orange", season: "summer", origin: "domestic" },
  { title: "How You Like That", artist: "BLACKPINK", mood: "focus", state: "workout", genre: "edm", color: "red", season: "summer", origin: "domestic" },
  { title: "NIGHT DANCER", artist: "imase", mood: "calm", state: "drive", genre: "indie", color: "green", season: "autumn", origin: "global" },
  { title: "Dream", artist: "Paul Kim", mood: "sad", state: "study", genre: "ballad", color: "blue", season: "winter", origin: "domestic" },
  { title: "LILAC", artist: "IU", mood: "happy", state: "study", genre: "kpop", color: "green", season: "spring", origin: "domestic" },
  { title: "Money Trees", artist: "Kendrick Lamar", mood: "focus", state: "study", genre: "hiphop", color: "green", season: "autumn", origin: "global" },
  { title: "Wake Me Up", artist: "Avicii", mood: "focus", state: "workout", genre: "edm", color: "orange", season: "summer", origin: "global" },
  { title: "Blue", artist: "Yerin Baek", mood: "calm", state: "study", genre: "rnb", color: "blue", season: "winter", origin: "domestic" },
  { title: "Ditto", artist: "NewJeans", mood: "calm", state: "night", genre: "kpop", color: "blue", season: "winter", origin: "domestic" },
  { title: "As It Was", artist: "Harry Styles", mood: "romantic", state: "walk", genre: "indie", color: "green", season: "spring", origin: "global" },
  { title: "Love Dive", artist: "IVE", mood: "romantic", state: "drive", genre: "kpop", color: "purple", season: "spring", origin: "domestic" },
  { title: "ETA", artist: "NewJeans", mood: "happy", state: "drive", genre: "kpop", color: "red", season: "summer", origin: "domestic" },
  { title: "Yoru ni Kakeru", artist: "YOASOBI", mood: "focus", state: "night", genre: "jpop", color: "blue", season: "winter", origin: "japan" },
  { title: "Pretender", artist: "Official HIGE DANdism", mood: "romantic", state: "walk", genre: "jpop", color: "green", season: "spring", origin: "japan" },
  { title: "Blinding Lights", artist: "The Weeknd", mood: "happy", state: "drive", genre: "pop", color: "orange", season: "autumn", origin: "global" },
  { title: "Levitating", artist: "Dua Lipa", mood: "happy", state: "workout", genre: "pop", color: "red", season: "summer", origin: "global" }
  ,{ title: "Champagne Supernova", artist: "Oasis", mood: "calm", state: "drive", genre: "band", color: "green", season: "autumn", origin: "global" }
  ,{ title: "The Beginning", artist: "ONE OK ROCK", mood: "focus", state: "workout", genre: "band", color: "red", season: "summer", origin: "japan" }
];

const defaultSharedPlaylists = [
  { name: "새벽 감성 버스", owner: "minji", theme: "night + blue", likes: 128 },
  { name: "시험기간 집중모드", owner: "hyun", theme: "study + green", likes: 97 },
  { name: "봄산책 설렘곡", owner: "sora", theme: "walk + spring", likes: 142 }
];

const optionGroups = document.querySelectorAll(".option-group");
const likesInput = document.querySelector("#likes");
const captureInput = document.querySelector("#capture");
const captureHint = document.querySelector("#captureHint");
const recommendBtn = document.querySelector("#recommendBtn");
const resetBtn = document.querySelector("#resetBtn");
const countRange = document.querySelector("#countRange");
const countValue = document.querySelector("#countValue");
const cards = document.querySelector("#cards");
const insights = document.querySelector("#insights");
const resultCount = document.querySelector("#resultCount");
const qualityHint = document.querySelector("#qualityHint");
const sharedPlaylistsContainer = document.querySelector("#sharedPlaylists");
const shareNameInput = document.querySelector("#shareName");
const shareOwnerInput = document.querySelector("#shareOwner");
const shareBtn = document.querySelector("#shareBtn");
const shareHint = document.querySelector("#shareHint");
const spotifyUrlInput = document.querySelector("#spotifyUrl");
const spotifyAnalyzeBtn = document.querySelector("#spotifyAnalyzeBtn");
const spotifyHint = document.querySelector("#spotifyHint");
const toast = document.querySelector("#toast");
const themeToggle = document.querySelector("#themeToggle");

let ocrTokens = [];
let ocrReady = typeof window.Tesseract !== "undefined";
let currentRecommendations = [];
let activeThemeText = "기본 탐색 모드";
let shareApiOnline = false;
let spotifyTokens = [];
let spotifyTracks = [];
let toastTimer = null;
let hasCompletedRecommendation = false;
const CLIENT_FETCH_TIMEOUT_MS = 12000;
const FEEDBACK_STORAGE_KEY = "audiya-feedback-v1";
const FEEDBACK_USER_ID_KEY = "audiya-feedback-user-id";
const FEEDBACK_WEIGHT_SCALE = 0.28;
const AI_RERANK_ENABLED = true;
const AI_RERANK_TOP_K = 40;

function getOrCreateFeedbackUserId() {
  const saved = localStorage.getItem(FEEDBACK_USER_ID_KEY);
  if (saved) return saved;

  const created =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `user-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  localStorage.setItem(FEEDBACK_USER_ID_KEY, created);
  return created;
}

const feedbackUserId = getOrCreateFeedbackUserId();

function loadFeedbackProfile() {
  try {
    const raw = localStorage.getItem(FEEDBACK_STORAGE_KEY);
    if (!raw) {
      return { likedTokens: {}, dislikedTokens: {}, likedArtists: {}, dislikedArtists: {}, likedGenres: {}, dislikedGenres: {} };
    }

    const parsed = JSON.parse(raw);
    return {
      likedTokens: parsed && parsed.likedTokens ? parsed.likedTokens : {},
      dislikedTokens: parsed && parsed.dislikedTokens ? parsed.dislikedTokens : {},
      likedArtists: parsed && parsed.likedArtists ? parsed.likedArtists : {},
      dislikedArtists: parsed && parsed.dislikedArtists ? parsed.dislikedArtists : {},
      likedGenres: parsed && parsed.likedGenres ? parsed.likedGenres : {},
      dislikedGenres: parsed && parsed.dislikedGenres ? parsed.dislikedGenres : {}
    };
  } catch (_error) {
    return { likedTokens: {}, dislikedTokens: {}, likedArtists: {}, dislikedArtists: {}, likedGenres: {}, dislikedGenres: {} };
  }
}

function saveFeedbackProfile(profile) {
  try {
    localStorage.setItem(FEEDBACK_STORAGE_KEY, JSON.stringify(profile));
  } catch (_error) {
    // Ignore storage failures and continue with in-memory behavior.
  }
}

let feedbackProfile = loadFeedbackProfile();

function mergeFeedbackProfile(base, incoming) {
  const mergeBucket = (a = {}, b = {}) => {
    const merged = { ...a };
    Object.entries(b).forEach(([key, value]) => {
      merged[key] = (merged[key] || 0) + Number(value || 0);
    });
    return merged;
  };

  return {
    likedTokens: mergeBucket(base.likedTokens, incoming.likedTokens),
    dislikedTokens: mergeBucket(base.dislikedTokens, incoming.dislikedTokens),
    likedArtists: mergeBucket(base.likedArtists, incoming.likedArtists),
    dislikedArtists: mergeBucket(base.dislikedArtists, incoming.dislikedArtists),
    likedGenres: mergeBucket(base.likedGenres, incoming.likedGenres),
    dislikedGenres: mergeBucket(base.dislikedGenres, incoming.dislikedGenres)
  };
}

async function fetchServerFeedbackProfile() {
  const response = await fetchWithTimeout(`/api/feedback/profile?userId=${encodeURIComponent(feedbackUserId)}`);
  if (!response.ok) {
    throw new Error("feedback-profile-failed");
  }

  const payload = await response.json();
  return payload && payload.profile ? payload.profile : null;
}

async function hydrateFeedbackProfile() {
  try {
    const serverProfile = await fetchServerFeedbackProfile();
    if (!serverProfile) return;
    feedbackProfile = mergeFeedbackProfile(feedbackProfile, serverProfile);
    saveFeedbackProfile(feedbackProfile);
  } catch (_error) {
    // Keep local-only learning when server profile is unavailable.
  }
}

async function postFeedbackEvent(track, sentiment) {
  if (!track) return;

  const eventType = sentiment > 0 ? "like" : "dislike";
  const body = {
    userId: feedbackUserId,
    eventType,
    sentiment: sentiment > 0 ? "up" : "down",
    track: {
      title: track.title,
      artist: track.artist,
      genre: track.genre || "",
      source: track.source || ""
    }
  };

  try {
    await fetchWithTimeout("/api/feedback/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  } catch (_error) {
    // Local learning already applied; network sync can fail silently.
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = CLIENT_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function setQualityState(isDegraded, note = "") {
  if (!qualityHint) return;

  qualityHint.classList.remove("quality-normal", "quality-degraded");
  if (isDegraded) {
    qualityHint.classList.add("quality-degraded");
    qualityHint.textContent = `데이터 품질: 대체모드${note ? ` (${note})` : ""}`;
  } else {
    qualityHint.classList.add("quality-normal");
    qualityHint.textContent = "데이터 품질: 정상 모드";
  }
}

function applyTheme(mode) {
  document.body.dataset.theme = mode;
  localStorage.setItem("audiya-theme", mode);
}

function initTheme() {
  const saved = localStorage.getItem("audiya-theme");
  const initial = saved === "dark" ? "dark" : "light";
  applyTheme(initial);
}

function showToast(message) {
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("is-visible");

  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toastTimer = setTimeout(() => {
    toast.classList.remove("is-visible");
  }, 1800);
}

function toFeedbackTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 16);
}

function bumpCounter(map, key, delta) {
  if (!key) return;
  map[key] = (map[key] || 0) + delta;
  if (map[key] <= 0) delete map[key];
}

function storeTrackFeedback(track, sentiment) {
  if (!track) return;

  const delta = sentiment > 0 ? 1 : 1;
  const tokenBucket = sentiment > 0 ? feedbackProfile.likedTokens : feedbackProfile.dislikedTokens;
  const artistBucket = sentiment > 0 ? feedbackProfile.likedArtists : feedbackProfile.dislikedArtists;
  const genreBucket = sentiment > 0 ? feedbackProfile.likedGenres : feedbackProfile.dislikedGenres;

  const trackTokens = toFeedbackTokens(`${track.title} ${track.artist}`);
  trackTokens.forEach((token) => bumpCounter(tokenBucket, token, delta));
  bumpCounter(artistBucket, String(track.artist || "").toLowerCase(), delta);
  bumpCounter(genreBucket, String(track.genre || "").toLowerCase(), delta);

  saveFeedbackProfile(feedbackProfile);
}

function computeFeedbackBoost(track) {
  const tokens = toFeedbackTokens(`${track.title} ${track.artist}`);

  let liked = 0;
  let disliked = 0;

  tokens.forEach((token) => {
    liked += feedbackProfile.likedTokens[token] || 0;
    disliked += feedbackProfile.dislikedTokens[token] || 0;
  });

  const artistKey = String(track.artist || "").toLowerCase();
  liked += feedbackProfile.likedArtists[artistKey] || 0;
  disliked += feedbackProfile.dislikedArtists[artistKey] || 0;

  const genreKey = String(track.genre || "").toLowerCase();
  liked += (feedbackProfile.likedGenres[genreKey] || 0) * 0.9;
  disliked += (feedbackProfile.dislikedGenres[genreKey] || 0) * 0.9;

  return (liked - disliked) * FEEDBACK_WEIGHT_SCALE;
}

function buildLocalFallbackTracks(context) {
  return localTracks.map((track) => ({
    ...track,
    source: "local",
    previewUrl: "",
    mood: context.mood === "all" ? track.mood : context.mood,
    state: context.state === "all" ? track.state : context.state,
    color: context.color === "all" ? track.color : context.color,
    season: context.season === "all" ? track.season : context.season,
    origin: track.origin
  }));
}

const genreQueryMap = {
  kpop: "kpop",
  jpop: "jpop",
  pop: "pop music",
  hiphop: "hip hop",
  rnb: "r&b",
  band: "band rock",
  edm: "edm",
  indie: "indie pop",
  ballad: "ballad"
};

const moodKeywordMap = {
  happy: "upbeat",
  calm: "chill",
  focus: "focus",
  sad: "sad",
  romantic: "romantic"
};

const stateKeywordMap = {
  workout: "workout",
  study: "study",
  drive: "driving",
  night: "night",
  walk: "walking"
};

function getSelectedGenres() {
  return Array.from(document.querySelectorAll('.option-group[data-name="genre"] .choice-btn.is-active')).map((el) => el.dataset.value);
}

function getSelectedCount() {
  if (!countRange) return 10;
  return Number(countRange.value || 10);
}

function updateCountRangeUI() {
  if (!countRange) return;
  const min = Number(countRange.min || 0);
  const max = Number(countRange.max || 20);
  const value = Number(countRange.value || 10);
  const pct = ((value - min) / Math.max(1, max - min)) * 100;
  countRange.style.setProperty("--range-pct", `${pct}%`);
  if (countValue) {
    countValue.textContent = String(value);
  }
}

function getSingleChoiceValue(name, fallback = "all") {
  const selected = document.querySelector(`.option-group[data-name="${name}"] .choice-btn.is-active`);
  return selected ? selected.dataset.value : fallback;
}

function setActiveSingleButton(group, clickedButton) {
  group.querySelectorAll(".choice-btn").forEach((btn) => {
    btn.classList.remove("is-active");
    btn.setAttribute("aria-pressed", "false");
  });
  clickedButton.classList.add("is-active");
  clickedButton.setAttribute("aria-pressed", "true");
}

function getOriginGroup() {
  return document.querySelector('.option-group[data-name="origin"]');
}

function setOriginValue(value) {
  const originGroup = getOriginGroup();
  if (!originGroup) return;

  const target = originGroup.querySelector(`.choice-btn[data-value="${value}"]`);
  if (!target) return;
  setActiveSingleButton(originGroup, target);
}

function applyOriginLock(lockValue = "") {
  const originGroup = getOriginGroup();
  if (!originGroup) return;

  const buttons = Array.from(originGroup.querySelectorAll(".choice-btn"));
  const isLocked = Boolean(lockValue);

  if (isLocked) {
    setOriginValue(lockValue);
  }

  buttons.forEach((button) => {
    const shouldDisable = isLocked && button.dataset.value !== lockValue;
    button.disabled = shouldDisable;
    button.setAttribute("aria-disabled", shouldDisable ? "true" : "false");
  });
}

function syncOriginLockFromGenres() {
  const genres = getSelectedGenres();
  if (genres.includes("jpop")) {
    applyOriginLock("japan");
    return;
  }

  if (genres.includes("kpop")) {
    applyOriginLock("domestic");
    return;
  }

  applyOriginLock("");
}

function initOptionGroups() {
  optionGroups.forEach((group) => {
    const type = group.dataset.type;
    const groupName = group.dataset.name;
    const defaultValue = group.dataset.default;
    const buttons = Array.from(group.querySelectorAll(".choice-btn"));

    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", "false");

      if (type === "single") {
        if (button.dataset.value === defaultValue) {
          button.classList.add("is-active");
          button.setAttribute("aria-pressed", "true");
        }
      }

      button.addEventListener("click", () => {
        if (type === "multi") {
          const willActivate = !button.classList.contains("is-active");

          if (groupName === "genre" && willActivate && button.dataset.value === "jpop") {
            const kpopBtn = group.querySelector('.choice-btn[data-value="kpop"]');
            if (kpopBtn) {
              kpopBtn.classList.remove("is-active");
              kpopBtn.setAttribute("aria-pressed", "false");
            }
          }

          if (groupName === "genre" && willActivate && button.dataset.value === "kpop") {
            const jpopBtn = group.querySelector('.choice-btn[data-value="jpop"]');
            if (jpopBtn) {
              jpopBtn.classList.remove("is-active");
              jpopBtn.setAttribute("aria-pressed", "false");
            }
          }

          button.classList.toggle("is-active", willActivate);
          button.setAttribute("aria-pressed", willActivate ? "true" : "false");
          if (groupName === "genre") {
            syncOriginLockFromGenres();
          }
          return;
        }

        setActiveSingleButton(group, button);
      });
    });
  });

  syncOriginLockFromGenres();
}

function parseLikes(text) {
  return text
    .toLowerCase()
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function parseOcrText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 25);
}

function parseSpotifyText(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 20);
}

function extractSpotifyPlaylistId(url) {
  const matched = String(url).match(/open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/);
  return matched ? matched[1] : "";
}

async function analyzeSpotifyPlaylistUrl(url) {
  const playlistId = extractSpotifyPlaylistId(url);
  if (!playlistId) {
    throw new Error("spotify-url-invalid");
  }

  const normalizedUrl = `https://open.spotify.com/playlist/${playlistId}`;
  const response = await fetchWithTimeout(`/api/spotify/playlist?url=${encodeURIComponent(normalizedUrl)}`);
  if (!response.ok) {
    throw new Error("spotify-api-failed");
  }

  const data = await response.json();
  return {
    playlistId,
    title: data.playlistName || "",
    author: data.ownerName || "",
    tokens: Array.isArray(data.tokens) ? data.tokens : [],
    tracks: Array.isArray(data.tracks) ? data.tracks : [],
    degraded: Boolean(data.fallback || data.warning || data.error)
  };
}

async function extractTokensFromImage(file) {
  if (!ocrReady) {
    return [];
  }

  const result = await window.Tesseract.recognize(file, "kor+eng", {
    logger: () => {}
  });

  const rawText = (result && result.data && result.data.text) || "";
  return parseOcrText(rawText);
}

function inferGenre(genreName = "") {
  const value = genreName.toLowerCase();
  if (value.includes("k-pop") || value.includes("kpop") || value.includes("k pop")) return "kpop";
  if (value.includes("j-pop") || value.includes("jpop") || value.includes("j pop") || value.includes("japanese")) return "jpop";
  if (value.includes("band") || value.includes("rock") || value.includes("alt rock") || value.includes("alternative rock")) return "band";
  if (value.includes("pop")) return "pop";
  if (value.includes("hip-hop") || value.includes("hip hop") || value.includes("rap")) return "hiphop";
  if (value.includes("r&b") || value.includes("rnb") || value.includes("rhythm and blues") || value.includes("neo soul") || value.includes("soul")) return "rnb";
  if (value.includes("dance") || value.includes("electronic") || value.includes("edm")) return "edm";
  if (value.includes("indie") || value.includes("alternative")) return "indie";
  if (value.includes("ballad") || value.includes("acoustic")) return "ballad";
  return "indie";
}

function formatOriginLabel(origin) {
  if (origin === "domestic") return "국내";
  if (origin === "japan") return "일본";
  if (origin === "global") return "해외";
  return "기타";
}

function buildSearchTerms(context) {
  const terms = [];

  context.genres.forEach((genre) => {
    if (genreQueryMap[genre]) terms.push(genreQueryMap[genre]);
  });

  if (context.mood !== "all" && moodKeywordMap[context.mood]) {
    terms.push(moodKeywordMap[context.mood]);
  }

  if (context.state !== "all" && stateKeywordMap[context.state]) {
    terms.push(stateKeywordMap[context.state]);
  }

  context.likeTokens.slice(0, 3).forEach((token) => terms.push(token));
  context.spotifyTokens.slice(0, 2).forEach((token) => terms.push(token));

  const moodToken = context.mood !== "all" && moodKeywordMap[context.mood] ? moodKeywordMap[context.mood] : "";
  const stateToken = context.state !== "all" && stateKeywordMap[context.state] ? stateKeywordMap[context.state] : "";
  const genreTokens = context.genres.length > 0 ? context.genres : ["kpop", "indie"];

  genreTokens.slice(0, 3).forEach((genre) => {
    const base = genreQueryMap[genre] || genre;
    terms.push(base);
    if (moodToken) terms.push(`${base} ${moodToken}`);
    if (stateToken) terms.push(`${base} ${stateToken}`);
  });

  if (terms.length === 0) {
    terms.push("kpop hits", "indie chill", "hip hop korea");
  }

  return Array.from(new Set(terms)).slice(0, 8);
}

function normalizeApiTrack(apiTrack, context) {
  const genre = inferGenre(apiTrack.primaryGenreName);
  return {
    title: apiTrack.trackName || "Unknown",
    artist: apiTrack.artistName || "Unknown Artist",
    mood: context.mood === "all" ? "calm" : context.mood,
    state: context.state === "all" ? "study" : context.state,
    genre,
    color: context.color === "all" ? "green" : context.color,
    season: context.season === "all" ? "spring" : context.season,
    origin: (() => {
      const country = String(apiTrack.country || "").toUpperCase();
      if (country === "KOR" || country === "KR") return "domestic";
      if (country === "JPN" || country === "JP") return "japan";
      return "global";
    })(),
    source: "itunes",
    previewUrl: apiTrack.trackViewUrl || "",
    coverUrl: apiTrack.artworkUrl100 || apiTrack.artworkUrl60 || ""
  };
}

async function fetchTracksFromItunes(term, limit) {
  const url = `https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=song&limit=${limit}`;
  const response = await fetchWithTimeout(url);
  if (!response.ok) {
    throw new Error(`API 요청 실패: ${response.status}`);
  }
  const data = await response.json();
  return Array.isArray(data.results) ? data.results : [];
}

async function fetchExternalTracks(context, requestedCount) {
  const terms = buildSearchTerms(context);
  const perTerm = Math.max(8, requestedCount);

  const results = await Promise.allSettled(terms.map((term) => fetchTracksFromItunes(term, perTerm)));

  const merged = [];
  results.forEach((result) => {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    }
  });

  const seen = new Set();
  return merged
    .map((item) => normalizeApiTrack(item, context))
    .filter((track) => {
      const key = `${track.title}::${track.artist}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

async function fetchSpotifyCandidates(context, requestedCount) {
  const terms = buildSearchTerms(context);
  const params = new URLSearchParams({
    terms: terms.join(","),
    origin: context.origin,
    limit: String(Math.max(100, requestedCount * 12))
  });

  const response = await fetchWithTimeout(`/api/spotify/candidates?${params.toString()}`);
  if (!response.ok) {
    throw new Error("spotify-candidates-failed");
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.tracks)) {
    return { tracks: [], degraded: true };
  }

  const tracks = payload.tracks.map((track) => ({
    title: track.title || "Unknown",
    artist: track.artist || "Unknown Artist",
    mood: context.mood === "all" ? "calm" : context.mood,
    state: context.state === "all" ? "study" : context.state,
    genre: track.genre || context.genres[0] || "indie",
    color: context.color === "all" ? "green" : context.color,
    season: context.season === "all" ? "spring" : context.season,
    origin: track.origin || (context.origin === "all" ? "global" : context.origin),
    source: "spotify",
    coverUrl: track.coverUrl || "",
    previewUrl: track.previewUrl || "",
    spotifyUrl: track.spotifyUrl || ""
  }));

  return {
    tracks,
    degraded: Boolean(payload.warning || payload.error)
  };
}

async function fetchYouTubeCandidates(context, requestedCount) {
  const terms = buildSearchTerms(context);
  const params = new URLSearchParams({
    terms: terms.join(","),
    origin: context.origin,
    limit: String(Math.max(100, requestedCount * 10))
  });

  const response = await fetchWithTimeout(`/api/youtube/candidates?${params.toString()}`);
  if (!response.ok) {
    throw new Error("youtube-candidates-failed");
  }

  const payload = await response.json();
  if (!payload || !Array.isArray(payload.tracks)) {
    return { tracks: [], degraded: true };
  }

  const tracks = payload.tracks.map((track) => ({
    title: track.title || "Unknown",
    artist: track.artist || "Unknown Artist",
    mood: context.mood === "all" ? "calm" : context.mood,
    state: context.state === "all" ? "study" : context.state,
    genre: track.genre || context.genres[0] || "indie",
    color: context.color === "all" ? "green" : context.color,
    season: context.season === "all" ? "spring" : context.season,
    origin: track.origin || (context.origin === "all" ? "global" : context.origin),
    source: "youtube",
    coverUrl: track.coverUrl || "",
    previewUrl: "",
    youtubeUrl: track.youtubeUrl || ""
  }));

  return {
    tracks,
    degraded: Boolean(payload.warning || payload.error)
  };
}

async function fetchSpotifyCoverForTrack(track) {
  const title = encodeURIComponent(track.title || "");
  const artist = encodeURIComponent(track.artist || "");
  const response = await fetchWithTimeout(`/api/spotify/cover?title=${title}&artist=${artist}`);
  if (!response.ok) {
    return track;
  }

  const data = await response.json();
  return {
    ...track,
    coverUrl: track.coverUrl || data.coverUrl || "",
    spotifyUrl: track.spotifyUrl || data.spotifyUrl || "",
    previewUrl: track.previewUrl || data.previewUrl || ""
  };
}

async function enrichMissingCovers(items) {
  const targets = items.filter((track) => !track.coverUrl).slice(0, 6);
  if (targets.length === 0) {
    return items;
  }

  const lookup = new Map();
  await Promise.all(
    targets.map(async (track) => {
      const enriched = await fetchSpotifyCoverForTrack(track);
      lookup.set(`${track.title}::${track.artist}`.toLowerCase(), enriched);
    })
  );

  return items.map((track) => {
    const key = `${track.title}::${track.artist}`.toLowerCase();
    return lookup.get(key) || track;
  });
}

function buildAiRerankContext(context) {
  return {
    genres: context.genres,
    origin: context.origin,
    mood: context.mood,
    state: context.state,
    color: context.color,
    season: context.season,
    likeTokens: context.likeTokens.slice(0, 12),
    ocrTokens: context.ocrTokens.slice(0, 12),
    spotifyTokens: context.spotifyTokens.slice(0, 12)
  };
}

async function rerankWithAi(items, context, requestedCount) {
  if (!AI_RERANK_ENABLED || !Array.isArray(items) || items.length === 0) {
    return { items, degraded: false, note: "" };
  }

  const payload = {
    context: buildAiRerankContext(context),
    tracks: items.slice(0, AI_RERANK_TOP_K),
    limit: Math.min(requestedCount, AI_RERANK_TOP_K)
  };

  try {
    const response = await fetchWithTimeout("/api/ai/rerank", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error("ai-rerank-http-failed");
    }

    const data = await response.json();
    const reranked = data && Array.isArray(data.tracks) ? data.tracks : [];
    if (reranked.length === 0) {
      return { items, degraded: true, note: "AI 재정렬 응답 비어 있음" };
    }

    const merged = reranked
      .slice(0, requestedCount)
      .map((track) => ({
        ...track,
        reasons: Array.isArray(track.reasons) && track.reasons.length > 0 ? track.reasons : ["AI 재정렬"]
      }));

    const note = data && data.fallback ? "로컬 의미 재정렬" : "임베딩 재정렬";
    return {
      items: merged,
      // Local semantic rerank is an intended default path when OpenAI is unavailable.
      degraded: false,
      note
    };
  } catch (_error) {
    return { items, degraded: true, note: "AI 재정렬 실패" };
  }
}

function scoreTrack(track, context) {
  let score = 0;
  const reasons = [];

  if (context.genres.length > 0 && context.genres.includes(track.genre)) {
    score += 3;
    reasons.push("선호 장르 일치");
  }

  if (context.mood !== "all" && context.mood === track.mood) {
    score += 2;
    reasons.push("기분 일치");
  }

  if (context.state !== "all" && context.state === track.state) {
    score += 2;
    reasons.push("상황 일치");
  }

  if (context.origin !== "all" && context.origin === track.origin) {
    score += 2;
    reasons.push("지역 조건 일치");
  }

  if (context.color !== "all" && context.color === track.color) {
    score += 1;
    reasons.push("색감 일치");
  }

  if (context.season !== "all" && context.season === track.season) {
    score += 1;
    reasons.push("계절 일치");
  }

  const textBlob = `${track.title} ${track.artist}`.toLowerCase();
  if (context.likeTokens.some((token) => textBlob.includes(token))) {
    score += 2;
    reasons.push("좋아하는 곡/아티스트 유사");
  }

  if (context.ocrTokens.some((token) => textBlob.includes(token))) {
    score += 3;
    reasons.push("캡처 OCR 텍스트 유사");
  }

  if (context.spotifyTokens.some((token) => textBlob.includes(token))) {
    score += 2;
    reasons.push("Spotify URL 분석 유사");
  }

  const feedbackBoost = computeFeedbackBoost(track);
  if (feedbackBoost !== 0) {
    score += feedbackBoost;
    reasons.push(feedbackBoost > 0 ? "피드백 학습 선호" : "피드백 학습 비선호");
  }

  return { ...track, score, reasons };
}

function applyHardFilters(items, context) {
  return items.filter((track) => {
    const genreMatch = context.genres.length === 0 || context.genres.includes(track.genre);
    const originMatch = context.origin === "all" || track.origin === context.origin;
    return genreMatch && originMatch;
  });
}

function sortAndUniqueByScore(items, context) {
  const seen = new Set();
  return items
    .map((track) => scoreTrack(track, context))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ko"))
    .filter((track) => {
      const key = `${track.title}::${track.artist}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function takeWithBackfill(poolRaw, context, requestedCount) {
  const strictPool = applyHardFilters(poolRaw, context);
  const strictSorted = sortAndUniqueByScore(strictPool, context);
  const selected = [...strictSorted.slice(0, requestedCount)];

  const hasGenreConstraint = context.genres.length > 0;
  let relaxedGenre = false;

  if (selected.length >= requestedCount) {
    return { items: selected, expanded: false, insufficient: false, relaxedGenre };
  }

  const selectedKeys = new Set(selected.map((track) => `${track.title}::${track.artist}`.toLowerCase()));

  // Step 1: when genre is too strict, keep origin and mood/state but relax genre.
  if (hasGenreConstraint) {
    relaxedGenre = true;
    const originPool = poolRaw.filter((track) => context.origin === "all" || track.origin === context.origin);
    const originSorted = sortAndUniqueByScore(originPool, context);

    originSorted.forEach((track) => {
      if (selected.length >= requestedCount) return;
      const key = `${track.title}::${track.artist}`.toLowerCase();
      if (selectedKeys.has(key)) return;
      selectedKeys.add(key);
      selected.push({ ...track, reasons: [...(track.reasons || []), "장르 완화 보충"] });
    });

    if (selected.length >= requestedCount) {
      return { items: selected, expanded: true, insufficient: false, relaxedGenre };
    }
  }

  // Step 2: for non-genre constrained requests, relax remaining filters but keep origin first.
  if (!hasGenreConstraint) {
    const originPool = poolRaw.filter((track) => context.origin === "all" || track.origin === context.origin);
    const originSorted = sortAndUniqueByScore(originPool, context);

    originSorted.forEach((track) => {
      if (selected.length >= requestedCount) return;
      const key = `${track.title}::${track.artist}`.toLowerCase();
      if (selectedKeys.has(key)) return;
      selectedKeys.add(key);
      selected.push({ ...track, reasons: [...(track.reasons || []), "조건 확장 보충"] });
    });

    if (selected.length >= requestedCount) {
      return { items: selected, expanded: true, insufficient: false, relaxedGenre };
    }
  }

  const fullSorted = sortAndUniqueByScore(poolRaw, context);
  fullSorted.forEach((track) => {
    if (selected.length >= requestedCount) return;
    const key = `${track.title}::${track.artist}`.toLowerCase();
    if (selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push({ ...track, reasons: [...(track.reasons || []), "전체 풀 보충"] });
  });

  return { items: selected, expanded: true, insufficient: selected.length < requestedCount, relaxedGenre };
}

function resetForm() {
  optionGroups.forEach((group) => {
    const type = group.dataset.type;
    const defaultValue = group.dataset.default;
    const buttons = Array.from(group.querySelectorAll(".choice-btn"));

    buttons.forEach((button) => {
      const shouldBeActive = type === "single" && button.dataset.value === defaultValue;
      button.classList.toggle("is-active", shouldBeActive);
      button.setAttribute("aria-pressed", shouldBeActive ? "true" : "false");
    });
  });

  if (countRange) countRange.value = "10";
  updateCountRangeUI();

  likesInput.value = "";
  spotifyUrlInput.value = "";
  spotifyHint.textContent = "플레이리스트 URL을 넣고 분석하면 제목/작성자 정보를 추천에 반영합니다.";
  captureInput.value = "";
  captureHint.textContent = "이미지를 올리면 OCR로 곡/아티스트 텍스트를 분석합니다.";

  ocrTokens = [];
  spotifyTokens = [];
  spotifyTracks = [];
  syncOriginLockFromGenres();
  setQualityState(false);
  recommend({ showCompletionToast: false });
}

function countBy(items, key) {
  const map = new Map();
  items.forEach((item) => {
    map.set(item[key], (map.get(item[key]) || 0) + 1);
  });
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => `${name} ${count}`);
}

function renderTracks(items) {
  cards.innerHTML = "";

  if (items.length === 0) {
    cards.innerHTML = '<div class="empty">입력 조건과 맞는 곡이 적어요. 장르를 추가하거나 조건을 완화해보세요.</div>';
    resultCount.textContent = "0곡";
    return;
  }

  items.forEach((track, index) => {
    const card = document.createElement("article");
    card.className = "card";
    card.style.animationDelay = `${index * 0.05}s`;
    const spotifyQuery = encodeURIComponent(`${track.title} ${track.artist}`);
    const spotifyUrl = track.spotifyUrl || `https://open.spotify.com/search/${spotifyQuery}`;
    const appleUrl = track.previewUrl || `https://music.apple.com/us/search?term=${spotifyQuery}`;
    const youtubeUrl = track.youtubeUrl || `https://www.youtube.com/results?search_query=${spotifyQuery}`;
    const sourceLabel =
      track.source === "spotify"
        ? "Spotify API"
        : track.source === "youtube"
          ? "YouTube API"
          : track.source === "itunes"
            ? "iTunes API"
            : "내장 데이터";
    const encodedTitle = encodeURIComponent(track.title || "");
    const encodedArtist = encodeURIComponent(track.artist || "");
    const coverHtml = track.coverUrl
      ? `<img src="${track.coverUrl}" alt="${track.title} 앨범 이미지" loading="lazy" />`
      : '<div class="album-fallback">🎵</div>';
    card.innerHTML = `
      <div class="card-top">
        <div class="album-cover">${coverHtml}</div>
        <h3>${track.title}</h3>
      </div>
      <p class="meta">${track.artist}</p>
      <p class="meta">${track.genre.toUpperCase()} | ${track.mood} | ${track.state} | ${formatOriginLabel(track.origin)}</p>
      <p class="reason">${track.reasons.slice(0, 2).join(" · ") || "탐색 추천"}</p>
      <p class="meta">${sourceLabel}</p>
      <div class="card-actions">
        <a href="${spotifyUrl}" target="_blank" rel="noopener noreferrer">Spotify</a>
        <a href="${appleUrl}" target="_blank" rel="noopener noreferrer">Apple Music</a>
        <a href="${youtubeUrl}" target="_blank" rel="noopener noreferrer">YouTube</a>
      </div>
      <div class="feedback-actions">
        <button type="button" class="feedback-btn" data-feedback="up" data-title="${encodedTitle}" data-artist="${encodedArtist}">좋아요</button>
        <button type="button" class="feedback-btn" data-feedback="down" data-title="${encodedTitle}" data-artist="${encodedArtist}">별로예요</button>
      </div>
    `;
    cards.appendChild(card);
  });

  resultCount.textContent = `${items.length}곡`;
}

function renderInsights(items, context) {
  insights.innerHTML = "";

  if (items.length === 0) {
    insights.innerHTML = '<p class="helper">분석할 추천 결과가 없습니다.</p>';
    return;
  }

  const topGenre = countBy(items, "genre").slice(0, 3).join(" / ");
  const topArtist = countBy(items, "artist").slice(0, 3).join(" / ");
  const originMix = countBy(items, "origin")
    .map((line) => line.replace("domestic", "국내").replace("japan", "일본").replace("global", "해외"))
    .join(" / ");
  const themes = [`mood:${context.mood}`, `state:${context.state}`, `color:${context.color}`, `season:${context.season}`]
    .filter((v) => !v.endsWith(":all"))
    .join(" | ");

  insights.innerHTML = `
    <article class="insight-card">
      <h3>장르 분포</h3>
      <p>${topGenre || "데이터 없음"}</p>
    </article>
    <article class="insight-card">
      <h3>가수 분포</h3>
      <p>${topArtist || "데이터 없음"}</p>
    </article>
    <article class="insight-card">
      <h3>지역 비율</h3>
      <p>${originMix || "데이터 없음"}</p>
    </article>
    <article class="insight-card">
      <h3>반영된 테마</h3>
      <p>${themes || "전체 테마 탐색"}</p>
    </article>
  `;
}

function renderSharedPlaylists(playlists) {
  sharedPlaylistsContainer.innerHTML = "";

  if (!playlists || playlists.length === 0) {
    sharedPlaylistsContainer.innerHTML = '<div class="empty">아직 공유된 플레이리스트가 없습니다.</div>';
    return;
  }

  playlists.forEach((playlist) => {
    const firstTrack = Array.isArray(playlist.tracks) && playlist.tracks.length > 0 ? playlist.tracks[0] : null;
    const thumbHtml = firstTrack && firstTrack.coverUrl
      ? `<img src="${firstTrack.coverUrl}" alt="${playlist.name} 썸네일" loading="lazy" />`
      : '<div class="album-fallback">🎼</div>';
    const item = document.createElement("article");
    item.className = "share-card";
    item.innerHTML = `
      <div class="card-top">
        <div class="album-cover">${thumbHtml}</div>
        <h3>${playlist.name}</h3>
      </div>
      <p class="meta">@${playlist.owner}</p>
      <p class="meta">${playlist.theme}</p>
      <p class="meta">${playlist.likes || 0} likes</p>
    `;
    sharedPlaylistsContainer.appendChild(item);
  });
}

async function fetchSharedPlaylists() {
  const response = await fetchWithTimeout("/api/playlists");
  if (!response.ok) {
    throw new Error("공유 목록 조회 실패");
  }
  const payload = await response.json();
  if (!payload || !Array.isArray(payload.items)) {
    throw new Error("응답 형식 오류");
  }
  return payload.items;
}

async function saveSharedPlaylist(payload) {
  const response = await fetchWithTimeout("/api/playlists", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error("공유 저장 실패");
  }

  const data = await response.json();
  return data.item;
}

async function hydrateSharedPlaylists() {
  try {
    const items = await fetchSharedPlaylists();
    shareApiOnline = true;
    renderSharedPlaylists(items);
    shareHint.textContent = "DB 기반 공유 목록이 연결되었습니다.";
  } catch (_error) {
    shareApiOnline = false;
    renderSharedPlaylists(defaultSharedPlaylists);
    shareHint.textContent = "서버 미연결 상태입니다. 기본 공유 목록을 표시합니다. (node server.js 실행 필요)";
  }
}

function buildSharePayload() {
  const owner = shareOwnerInput.value.trim() || "guest";
  const name = shareNameInput.value.trim() || `${owner}의 ${activeThemeText} 플레이리스트`;
  const tracks = currentRecommendations.slice(0, 10).map((track) => ({
    title: track.title,
    artist: track.artist,
    source: track.source,
    coverUrl: track.coverUrl || "",
    previewUrl: track.previewUrl || ""
  }));

  return {
    name,
    owner,
    theme: activeThemeText,
    tracks
  };
}

async function handleShareCurrentPlaylist() {
  if (currentRecommendations.length === 0) {
    shareHint.textContent = "먼저 추천을 생성한 뒤 공유할 수 있습니다.";
    return;
  }

  if (!shareApiOnline) {
    shareHint.textContent = "서버가 연결되지 않아 저장할 수 없습니다. node server.js로 서버를 실행해주세요.";
    return;
  }

  shareBtn.disabled = true;
  shareBtn.textContent = "저장 중...";

  try {
    const payload = buildSharePayload();
    await saveSharedPlaylist(payload);
    shareHint.textContent = `공유 완료: ${payload.name}`;
    shareNameInput.value = "";
    await hydrateSharedPlaylists();
  } catch (_error) {
    shareHint.textContent = "공유 저장 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.";
  } finally {
    shareBtn.disabled = false;
    shareBtn.textContent = "현재 추천 공유하기 🤝";
  }
}

async function recommend(options = {}) {
  const showCompletionToast = options.showCompletionToast ?? true;

  const context = {
    genres: getSelectedGenres(),
    origin: getSingleChoiceValue("origin", "all"),
    mood: getSingleChoiceValue("mood", "all"),
    state: getSingleChoiceValue("state", "all"),
    color: getSingleChoiceValue("color", "all"),
    season: getSingleChoiceValue("season", "spring"),
    likeTokens: parseLikes(likesInput.value),
    ocrTokens,
    spotifyTokens
  };

  recommendBtn.disabled = true;
  recommendBtn.textContent = "추천 생성 중...";

  try {
    const requestedCount = getSelectedCount();
    if (requestedCount === 0) {
      renderTracks([]);
      renderInsights([], context);
      currentRecommendations = [];
      setQualityState(false);
      return;
    }

    let externalTracks = [];
    let spotifyCandidateTracks = [];
    let youtubeCandidateTracks = [];
    let degradedReasons = [];

    try {
      externalTracks = await fetchExternalTracks(context, requestedCount);
    } catch (_error) {
      externalTracks = [];
    }

    try {
      const spotifyCandidateResult = await fetchSpotifyCandidates(context, requestedCount);
      spotifyCandidateTracks = spotifyCandidateResult.tracks;
      if (spotifyCandidateResult.degraded) {
        degradedReasons.push("Spotify 후보 일부 제한");
      }
    } catch (_error) {
      spotifyCandidateTracks = [];
      degradedReasons.push("Spotify 후보 연결 실패");
    }

    try {
      const youtubeCandidateResult = await fetchYouTubeCandidates(context, requestedCount);
      youtubeCandidateTracks = youtubeCandidateResult.tracks;
      if (youtubeCandidateResult.degraded) {
        degradedReasons.push("YouTube 후보 일부 제한");
      }
    } catch (_error) {
      youtubeCandidateTracks = [];
      degradedReasons.push("YouTube 후보 연결 실패");
    }

    const normalizedSpotifyTracks = spotifyTracks.map((track) => ({
      title: track.title,
      artist: track.artist,
      mood: context.mood === "all" ? "calm" : context.mood,
      state: context.state === "all" ? "study" : context.state,
      genre: context.genres[0] || "indie",
      color: context.color === "all" ? "green" : context.color,
      season: context.season === "all" ? "spring" : context.season,
      origin: context.origin === "all" ? "global" : context.origin,
      source: "spotify",
      coverUrl: track.coverUrl || "",
      previewUrl: track.previewUrl || "",
      spotifyUrl: track.spotifyUrl || ""
    }));

    const externalPoolRaw = [
      ...normalizedSpotifyTracks,
      ...spotifyCandidateTracks,
      ...youtubeCandidateTracks,
      ...externalTracks
    ];

    const externalSelection = takeWithBackfill(externalPoolRaw, context, requestedCount);
    let recommended = externalSelection.items.slice(0, requestedCount);
    if (externalSelection.expanded) {
      degradedReasons.push("조건 확장 보충");
    }
    if (externalSelection.relaxedGenre) {
      degradedReasons.push("장르 조건 일부 완화");
    }
    if (recommended.length < requestedCount) {
      const localPoolRaw = buildLocalFallbackTracks(context);
      const localFill = takeWithBackfill(localPoolRaw, context, requestedCount);
      const selectedKeys = new Set(recommended.map((track) => `${track.title}::${track.artist}`.toLowerCase()));

      localFill.items.forEach((track) => {
        if (recommended.length >= requestedCount) return;
        const key = `${track.title}::${track.artist}`.toLowerCase();
        if (selectedKeys.has(key)) return;
        selectedKeys.add(key);
        recommended.push({ ...track, reasons: [...(track.reasons || []), "로컬 안전망 보충"] });
      });

      degradedReasons.push("외부 소스 부족으로 로컬 보충");
    }

    if (recommended.length < requestedCount) {
      degradedReasons.push("후보 수 부족");
    }

    recommended = await enrichMissingCovers(recommended);

    const rerankedResult = await rerankWithAi(recommended, context, requestedCount);
    recommended = rerankedResult.items;
    if (rerankedResult.degraded && rerankedResult.note) {
      degradedReasons.push(rerankedResult.note);
    }

    setQualityState(degradedReasons.length > 0, degradedReasons[0] || "");

    renderTracks(recommended);
    renderInsights(recommended, context);
    currentRecommendations = recommended;

    const activeThemes = [context.origin, context.mood, context.state, context.color, context.season].filter((v) => v !== "all");
    const themeText = activeThemes.length > 0 ? activeThemes.join(" / ") : "기본 탐색 모드";
    activeThemeText = themeText;

    if (showCompletionToast && hasCompletedRecommendation) {
      showToast("플레이리스트 제작이 완료되었습니다!");
    }
    hasCompletedRecommendation = true;
  } finally {
    recommendBtn.disabled = false;
    recommendBtn.textContent = "추천 받기 🎧";
  }
}

captureInput.addEventListener("change", async () => {
  if (!captureInput.files || captureInput.files.length === 0) {
    ocrTokens = [];
    captureHint.textContent = "이미지를 올리면 OCR로 곡/아티스트 텍스트를 분석합니다.";
    return;
  }

  const file = captureInput.files[0];

  if (!ocrReady) {
    ocrTokens = [];
    captureHint.textContent = `업로드됨: ${file.name} (OCR 라이브러리 로드 실패로 텍스트 분석 미적용)`;
    return;
  }

  captureHint.textContent = `업로드됨: ${file.name} (OCR 분석 중...)`;

  try {
    ocrTokens = await extractTokensFromImage(file);
    captureHint.textContent = `업로드됨: ${file.name} (OCR 토큰 ${ocrTokens.length}개 추출 완료)`;
  } catch (_error) {
    ocrTokens = [];
    captureHint.textContent = `업로드됨: ${file.name} (OCR 분석 실패, 텍스트 입력 기반 추천 사용)`;
  }
});

spotifyAnalyzeBtn.addEventListener("click", async () => {
  const url = spotifyUrlInput.value.trim();

  if (!url) {
    spotifyTokens = [];
    spotifyTracks = [];
    spotifyHint.textContent = "Spotify 플레이리스트 URL을 입력해주세요.";
    return;
  }

  spotifyAnalyzeBtn.disabled = true;
  spotifyAnalyzeBtn.textContent = "분석 중...";

  try {
    const meta = await analyzeSpotifyPlaylistUrl(url);
    spotifyTokens = meta.tokens;
    spotifyTracks = meta.tracks;
    spotifyHint.textContent = `분석 완료: ${meta.title || "제목 없음"} / ${meta.author || "작성자 없음"} (트랙 ${spotifyTracks.length}곡 반영)`;
    if (meta.degraded) {
      setQualityState(true, "Spotify 대체 응답");
    }
  } catch (_error) {
    const fallbackId = extractSpotifyPlaylistId(url);
    spotifyTokens = parseSpotifyText(`spotify playlist ${fallbackId || ""}`);
    spotifyTracks = [];
    spotifyHint.textContent = "분석은 완료되었지만 API 연결이 불안정하여 최소 모드로 반영했습니다.";
    setQualityState(true, "Spotify 최소 모드");
  } finally {
    spotifyAnalyzeBtn.disabled = false;
    spotifyAnalyzeBtn.textContent = "URL 분석 🔗";
  }
});

recommendBtn.addEventListener("click", recommend);
if (countRange) {
  countRange.addEventListener("input", () => {
    updateCountRangeUI();
  });
}
if (resetBtn) {
  resetBtn.addEventListener("click", resetForm);
}
shareBtn.addEventListener("click", handleShareCurrentPlaylist);
themeToggle.addEventListener("click", () => {
  const current = document.body.dataset.theme === "dark" ? "dark" : "light";
  applyTheme(current === "dark" ? "light" : "dark");
});

cards.addEventListener("click", (event) => {
  const feedbackBtn = event.target.closest(".feedback-btn");
  if (!feedbackBtn) return;

  const title = decodeURIComponent(feedbackBtn.dataset.title || "");
  const artist = decodeURIComponent(feedbackBtn.dataset.artist || "");
  const sentiment = feedbackBtn.dataset.feedback === "up" ? 1 : -1;
  const targetTrack = currentRecommendations.find((track) => track.title === title && track.artist === artist);

  if (!targetTrack) return;
  storeTrackFeedback(targetTrack, sentiment);
  postFeedbackEvent(targetTrack, sentiment);
  showToast(sentiment > 0 ? "좋아요가 학습되었습니다" : "비선호가 학습되었습니다");
});

initTheme();
initOptionGroups();
updateCountRangeUI();
hydrateSharedPlaylists();
hydrateFeedbackProfile();
recommend({ showCompletionToast: false });
