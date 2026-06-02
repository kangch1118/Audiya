const http = require("http");
const fsSync = require("fs");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");

let supabase;

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) {
    return;
  }

  const raw = fsSync.readFileSync(filePath, "utf-8");
  raw.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      return;
    }

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex < 1) {
      return;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!(key in process.env)) {
      process.env[key] = value;
    }
  });
}

loadEnvFile(path.join(__dirname, ".env"));

const { createClient } = require("@supabase/supabase-js");
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase URL or Service Role Key in environment variables");
}
supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DB_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DB_DIR, "playlists.json");
const FEEDBACK_DB_FILE = path.join(DB_DIR, "feedback_events.json");
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || "";
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || "";
const SPOTIFY_CLIENT_ID_2 = process.env.SPOTIFY_CLIENT_ID_2 || "";
const SPOTIFY_CLIENT_SECRET_2 = process.env.SPOTIFY_CLIENT_SECRET_2 || "";
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY || "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
const OPENAI_EMBED_MODEL =
  process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const AI_RERANK_MAX_ITEMS = (() => {
  const raw = Number(process.env.AI_RERANK_MAX_ITEMS || "60");
  if (!Number.isFinite(raw)) return 60;
  return Math.max(10, Math.min(120, raw));
})();
const SPOTIFY_MATCH_THRESHOLD = (() => {
  const raw = Number(process.env.SPOTIFY_MATCH_THRESHOLD || "0.34");
  if (!Number.isFinite(raw)) return 0.34;
  return Math.min(0.9, Math.max(0.1, raw));
})();
const EXTERNAL_FETCH_TIMEOUT_MS = (() => {
  const raw = Number(process.env.EXTERNAL_FETCH_TIMEOUT_MS || "10000");
  if (!Number.isFinite(raw)) return 10000;
  return Math.max(2000, raw);
})();

// Spotify 자격증명 풀 (429 시 자동 전환)
const spotifyCredentials = [
  { id: SPOTIFY_CLIENT_ID, secret: SPOTIFY_CLIENT_SECRET, cache: { accessToken: "", expiresAt: 0 }, rateLimitedUntil: 0 },
];
// 2번 키가 설정된 경우에만 풀에 추가
if (SPOTIFY_CLIENT_ID_2 && SPOTIFY_CLIENT_SECRET_2) {
  spotifyCredentials.push({ id: SPOTIFY_CLIENT_ID_2, secret: SPOTIFY_CLIENT_SECRET_2, cache: { accessToken: "", expiresAt: 0 }, rateLimitedUntil: 0 });
}
let activeCredIdx = 0;

const spotifyTokenCache = spotifyCredentials[0].cache; // 기존 코드 호환용
const searchCache = new Map(); // query → { tracks, ts }

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
};

async function ensureDbFiles() {
  try {
    await fs.mkdir(DB_DIR, { recursive: true });
    try { await fs.access(DB_FILE); } catch (_e) {
      await fs.writeFile(DB_FILE, JSON.stringify({ items: [] }, null, 2), "utf-8");
    }
    try { await fs.access(FEEDBACK_DB_FILE); } catch (_e) {
      await fs.writeFile(FEEDBACK_DB_FILE, JSON.stringify({ items: [] }, null, 2), "utf-8");
    }
  } catch (_error) {
    // 서버리스 환경에서 파일시스템 접근 불가 시 무시
  }
}

async function readDb() {
  try {
    await ensureDbFiles();
    const raw = await fs.readFile(DB_FILE, "utf-8");
    const data = JSON.parse(raw);
    return (!data || !Array.isArray(data.items)) ? { items: [] } : data;
  } catch (_error) {
    return { items: [] };
  }
}

async function writeDb(data) {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (_error) {}
}

async function readFeedbackDb() {
  try {
    await ensureDbFiles();
    const raw = await fs.readFile(FEEDBACK_DB_FILE, "utf-8");
    const data = JSON.parse(raw);
    return (!data || !Array.isArray(data.items)) ? { items: [] } : data;
  } catch (_error) {
    return { items: [] };
  }
}

async function writeFeedbackDb(data) {
  try {
    await fs.writeFile(FEEDBACK_DB_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (_error) {}
}

async function readJsonBody(req) {
  let body = "";
  await new Promise((resolve, reject) => {
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", resolve);
    req.on("error", reject);
  });

  return JSON.parse(body || "{}");
}

// 인증 관련 함수들
function hashPassword(password) {
  return crypto
    .createHash("sha256")
    .update(password + "salt_audiya")
    .digest("hex");
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

async function createUser(username, password, name, phone) {
  try {
    const hashedPassword = hashPassword(password);
    const token = generateToken();

    const { data, error } = await supabase
      .from("users")
      .insert({
        username: username.toLowerCase(),
        password_hash: hashedPassword,
        name,
        phone,
        auth_token: token,
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error("Supabase insert error:", error);
      return { success: false, message: "회원가입 실패" };
    }

    return { success: true, token, username: username.toLowerCase() };
  } catch (error) {
    console.error("Create user error:", error);
    return { success: false, message: "사용자 생성 중 오류 발생" };
  }
}

async function authenticateUser(username, password) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("*")
      .eq("username", username.toLowerCase())
      .single();

    if (error || !data) {
      return {
        success: false,
        code: "USER_NOT_FOUND",
        message: "아이디 또는 비밀번호가 올바르지 않습니다",
      };
    }

    const hashedPassword = hashPassword(password);
    if (data.password_hash !== hashedPassword) {
      return {
        success: false,
        code: "WRONG_PASSWORD",
        message: "비밀번호가 올바르지 않습니다",
      };
    }

    const token = generateToken();
    const { error: updateError } = await supabase
      .from("users")
      .update({ auth_token: token, last_login: new Date().toISOString() })
      .eq("id", data.id);

    if (updateError) {
      console.error("Token update error:", updateError);
    }

    return { success: true, token, username: username.toLowerCase(), name: data.name };
  } catch (error) {
    console.error("Authenticate user error:", error);
    return { success: false, message: "로그인 중 오류 발생" };
  }
}

async function getUserProfile(token) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, name, phone, created_at, preferences, avatar_url")
      .eq("auth_token", token)
      .single();

    if (error || !data) return { success: false, message: "사용자를 찾을 수 없습니다" };

    const p = data.phone || "";
    const maskedPhone = p.length >= 7 ? p.slice(0, 3) + "****" + p.slice(-4) : p;
    return { success: true, user: { ...data, phone: maskedPhone } };
  } catch (error) {
    console.error("Get user profile error:", error);
    return { success: false, message: "프로필 조회 실패" };
  }
}

async function updateUserName(token, name) {
  try {
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) return { success: false, message: "인증 실패" };
    const { error } = await supabase.from("users").update({ name }).eq("id", user.id);
    if (error) return { success: false, message: "업데이트 실패" };
    return { success: true };
  } catch (error) {
    console.error("Update name error:", error);
    return { success: false, message: "이름 변경 중 오류 발생" };
  }
}

async function changePassword(token, currentPassword, newPassword) {
  try {
    const { data: user } = await supabase.from("users").select("id, password_hash").eq("auth_token", token).single();
    if (!user) return { success: false, message: "인증 실패" };
    if (user.password_hash !== hashPassword(currentPassword)) {
      return { success: false, message: "현재 비밀번호가 올바르지 않습니다" };
    }
    const { error } = await supabase.from("users").update({ password_hash: hashPassword(newPassword) }).eq("id", user.id);
    if (error) return { success: false, message: "비밀번호 변경 실패" };
    return { success: true };
  } catch (error) {
    console.error("Change password error:", error);
    return { success: false, message: "비밀번호 변경 중 오류 발생" };
  }
}

async function getUserPlaylistsFromDb(token) {
  try {
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) return { success: false, message: "인증 실패" };
    const { data, error } = await supabase
      .from("playlists").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return { success: false, message: "조회 실패" };
    return { success: true, playlists: data || [] };
  } catch (error) {
    console.error("Get user playlists error:", error);
    return { success: false, message: "플레이리스트 조회 중 오류 발생" };
  }
}

async function getLikedPlaylists(token) {
  try {
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) return { success: false, message: "인증 실패" };
    const { data, error } = await supabase
      .from("playlist_likes").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    if (error) return { success: false, message: "조회 실패" };
    return { success: true, likes: data || [] };
  } catch (error) {
    console.error("Get liked playlists error:", error);
    return { success: false, message: "좋아요 조회 중 오류 발생" };
  }
}

async function toggleLikePlaylist(token, playlistId, playlistName, playlistData) {
  try {
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) return { success: false, message: "인증 실패" };

    const { data: existing } = await supabase
      .from("playlist_likes").select("id").eq("user_id", user.id).eq("playlist_id", playlistId).single();

    const liked = !existing;
    if (existing) {
      await supabase.from("playlist_likes").delete().eq("id", existing.id);
    } else {
      await supabase.from("playlist_likes").insert({
        user_id: user.id, playlist_id: playlistId,
        playlist_name: playlistName, playlist_data: playlistData,
        created_at: new Date().toISOString(),
      });
    }
    // community_playlists likes 카운트 동기화
    try {
      const { data: cp } = await supabase.from("community_playlists").select("likes").eq("id", playlistId).single();
      if (cp) {
        const newLikes = Math.max(0, (cp.likes || 0) + (liked ? 1 : -1));
        await supabase.from("community_playlists").update({ likes: newLikes }).eq("id", playlistId);
      }
    } catch (_e) {}
    return { success: true, liked };
  } catch (error) {
    console.error("Toggle like error:", error);
    return { success: false, message: "좋아요 처리 중 오류 발생" };
  }
}

async function getUserLikedIds(token) {
  try {
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) return [];
    const { data } = await supabase.from("playlist_likes").select("playlist_id").eq("user_id", user.id);
    return (data || []).map((r) => r.playlist_id);
  } catch (_error) {
    return [];
  }
}

async function syncOAuthUser(provider, providerId, email, name) {
  try {
    // 기존 OAuth 사용자 찾기
    const { data: existing } = await supabase
      .from("users").select("*")
      .eq("oauth_provider", provider).eq("oauth_id", providerId).single();

    if (existing) {
      const token = generateToken();
      await supabase.from("users")
        .update({ auth_token: token, last_login: new Date().toISOString() })
        .eq("id", existing.id);
      return { success: true, token, username: existing.username, name: existing.name };
    }

    // 고유 username 생성
    let base = (email || `${provider}user`).split("@")[0]
      .replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 14) || "user";
    if (base.length < 4) base = base.padEnd(4, "0");
    let username = base;
    for (let i = 1; ; i++) {
      const { data: dup } = await supabase.from("users").select("id").eq("username", username).single();
      if (!dup) break;
      username = `${base}${i}`;
    }

    // 고유 name 생성
    let displayName = (name || username).slice(0, 30);
    let finalName = displayName;
    for (let i = 1; ; i++) {
      const { data: dup } = await supabase.from("users").select("id").eq("name", finalName).single();
      if (!dup) break;
      finalName = `${displayName}${i}`;
    }

    const token = generateToken();
    const { data: newUser, error } = await supabase.from("users").insert({
      username, name: finalName, password_hash: "", phone: "",
      oauth_provider: provider, oauth_id: providerId,
      auth_token: token, created_at: new Date().toISOString(),
    }).select().single();

    if (error) { console.error("OAuth user create error:", error); return { success: false, message: "계정 생성 실패" }; }
    return { success: true, token, username: newUser.username, name: newUser.name, isNew: true };
  } catch (err) {
    console.error("syncOAuthUser error:", err);
    return { success: false, message: "OAuth 처리 중 오류" };
  }
}

async function verifyPhoneForReset(username, phone) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, username, phone")
      .eq("username", username.toLowerCase())
      .single();

    if (error || !data) {
      return { success: false, message: "아이디를 찾을 수 없습니다" };
    }

    if (data.phone !== phone) {
      return { success: false, message: "전화번호가 일치하지 않습니다" };
    }

    const resetToken = generateToken();
    const { error: updateError } = await supabase
      .from("users")
      .update({
        reset_token: resetToken,
        reset_token_at: new Date().toISOString(),
      })
      .eq("id", data.id);

    if (updateError) {
      console.error("Reset token update error:", updateError);
      return { success: false, message: "재설정 토큰 생성 실패" };
    }

    return { success: true, resetToken };
  } catch (error) {
    console.error("Verify phone error:", error);
    return { success: false, message: "전화번호 확인 중 오류 발생" };
  }
}

async function resetPassword(resetToken, newPassword) {
  try {
    const { data, error } = await supabase
      .from("users")
      .select("id, reset_token_at")
      .eq("reset_token", resetToken)
      .single();

    if (error || !data) {
      return { success: false, message: "유효하지 않은 재설정 토큰입니다" };
    }

    const tokenAge = Date.now() - new Date(data.reset_token_at).getTime();
    if (tokenAge > 15 * 60 * 1000) {
      return { success: false, message: "재설정 토큰이 만료되었습니다 (15분)" };
    }

    const hashedPassword = hashPassword(newPassword);
    const { error: updateError } = await supabase
      .from("users")
      .update({
        password_hash: hashedPassword,
        reset_token: null,
        reset_token_at: null,
      })
      .eq("id", data.id);

    if (updateError) {
      console.error("Password reset error:", updateError);
      return { success: false, message: "비밀번호 변경 실패" };
    }

    return { success: true };
  } catch (error) {
    console.error("Reset password error:", error);
    return { success: false, message: "비밀번호 재설정 중 오류 발생" };
  }
}

async function saveUserPlaylist(token, playlistName, tracks, preferences) {
  try {
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("auth_token", token)
      .single();

    if (userError || !userData) {
      return { success: false, message: "사용자 인증 실패" };
    }

    const { data, error } = await supabase
      .from("playlists")
      .insert({
        user_id: userData.id,
        name: playlistName,
        tracks: tracks,
        preferences: preferences,
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) {
      console.error("Save playlist error:", error);
      return { success: false, message: "플레이리스트 저장 실패" };
    }

    return { success: true, playlist: data[0] };
  } catch (error) {
    console.error("Save playlist error:", error);
    return { success: false, message: "플레이리스트 저장 중 오류 발생" };
  }
}

function buildFeedbackProfile(events) {
  const likedTokens = {};
  const dislikedTokens = {};
  const likedArtists = {};
  const dislikedArtists = {};
  const likedGenres = {};
  const dislikedGenres = {};

  const toTokens = (value) =>
    String(value || "")
      .toLowerCase()
      .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 1)
      .slice(0, 16);

  const bump = (bucket, key, delta = 1) => {
    if (!key) return;
    bucket[key] = (bucket[key] || 0) + delta;
  };

  events.forEach((event) => {
    const track = event && event.track ? event.track : {};
    const sentiment = String(
      event && event.sentiment ? event.sentiment : "",
    ).toLowerCase();
    const isLike = sentiment === "up" || sentiment === "like";
    const isDislike = sentiment === "down" || sentiment === "dislike";
    if (!isLike && !isDislike) return;

    const tokenBucket = isLike ? likedTokens : dislikedTokens;
    const artistBucket = isLike ? likedArtists : dislikedArtists;
    const genreBucket = isLike ? likedGenres : dislikedGenres;

    toTokens(`${track.title || ""} ${track.artist || ""}`).forEach((token) =>
      bump(tokenBucket, token, 1),
    );
    bump(artistBucket, String(track.artist || "").toLowerCase(), 1);
    bump(genreBucket, String(track.genre || "").toLowerCase(), 1);
  });

  return {
    likedTokens,
    dislikedTokens,
    likedArtists,
    dislikedArtists,
    likedGenres,
    dislikedGenres,
  };
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(payload));
}

async function fetchWithTimeout(
  url,
  options = {},
  timeoutMs = EXTERNAL_FETCH_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function parseSpotifyPlaylistId(rawUrl) {
  const matched = String(rawUrl || "").match(
    /open\.spotify\.com\/playlist\/([a-zA-Z0-9]+)/,
  );
  return matched ? matched[1] : "";
}

function buildMinimalPlaylistFallback(playlistId, sourceUrl = "") {
  const urlText = String(sourceUrl || "");
  const tokenSeed = `${playlistId} ${urlText} spotify playlist`;
  return {
    playlistId,
    playlistName: "Spotify Playlist",
    ownerName: "Spotify User",
    tokens: parseTokens(tokenSeed),
    tracks: [],
    fallback: true,
  };
}

function parseTokens(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 30);
}

function inferGenreFromText(value) {
  const text = String(value || "").toLowerCase();
  if (
    text.includes("kpop") ||
    text.includes("k-pop") ||
    text.includes("korean")
  )
    return "kpop";
  if (
    text.includes("jpop") ||
    text.includes("j-pop") ||
    text.includes("japanese") ||
    text.includes("anime")
  )
    return "jpop";
  if (
    text.includes("band") ||
    text.includes("rock") ||
    text.includes("alt rock") ||
    text.includes("alternative rock")
  )
    return "band";
  if (text.includes("pop")) return "pop";
  if (
    text.includes("hiphop") ||
    text.includes("hip-hop") ||
    text.includes("rap")
  )
    return "hiphop";
  if (
    text.includes("rnb") ||
    text.includes("r&b") ||
    text.includes("rhythm and blues") ||
    text.includes("neo soul") ||
    text.includes("soul")
  )
    return "rnb";
  if (
    text.includes("edm") ||
    text.includes("electronic") ||
    text.includes("dance")
  )
    return "edm";
  if (text.includes("ballad") || text.includes("acoustic")) return "ballad";
  return "indie";
}

function isLikelyMusicVideo(item) {
  const snippet = item && item.snippet ? item.snippet : null;
  if (!snippet) return false;

  const title = String(snippet.title || "").toLowerCase();
  const channel = String(snippet.channelTitle || "").toLowerCase();

  // Exclude common non-track results.
  const blockedTitleKeywords = [
    "shorts",
    "playlist",
    "compilation",
    "mix",
    "reaction",
    "interview",
    "cover dance",
    "dance practice",
    "full album",
  ];
  if (blockedTitleKeywords.some((keyword) => title.includes(keyword))) {
    return false;
  }

  // Prefer official artist/topic uploads and known music formatting.
  if (channel.includes(" - topic") || channel.includes("official")) return true;
  if (
    title.includes("official") ||
    title.includes("mv") ||
    title.includes("m/v") ||
    title.includes("audio") ||
    title.includes("lyrics")
  ) {
    return true;
  }

  // Fallback acceptance for plain artist-title format.
  return title.includes(" - ") || title.includes("|");
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b(feat|ft|remix|version|ver|live)\b\.?/g, " ")
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toTokenSet(value) {
  return new Set(
    normalizeText(value)
      .split(" ")
      .map((token) => token.trim())
      .filter((token) => token.length > 1),
  );
}

function overlapScore(aSet, bSet) {
  if (aSet.size === 0 || bSet.size === 0) {
    return 0;
  }

  let same = 0;
  aSet.forEach((token) => {
    if (bSet.has(token)) same += 1;
  });

  return same / Math.max(aSet.size, bSet.size);
}

function pickBestSpotifyMatch(queryTitle, queryArtist, candidates) {
  const qTitleSet = toTokenSet(queryTitle);
  const qArtistSet = toTokenSet(queryArtist);

  let best = null;
  let bestScore = 0;

  candidates.forEach((item) => {
    const title = item && item.name ? item.name : "";
    const artists =
      item && Array.isArray(item.artists)
        ? item.artists.map((artist) => artist.name).join(" ")
        : "";

    const titleScore = overlapScore(qTitleSet, toTokenSet(title));
    const artistScore = overlapScore(qArtistSet, toTokenSet(artists));
    const combined = titleScore * 0.72 + artistScore * 0.28;

    if (combined > bestScore) {
      bestScore = combined;
      best = item;
    }
  });

  // Avoid mismatched covers/links by requiring minimum similarity.
  if (bestScore < SPOTIFY_MATCH_THRESHOLD) {
    return null;
  }

  return best;
}

async function getSpotifyTokenForCred(cred) {
  const now = Date.now();
  if (cred.cache.accessToken && cred.cache.expiresAt > now + 30 * 1000) {
    return cred.cache.accessToken;
  }
  const basicToken = Buffer.from(`${cred.id}:${cred.secret}`).toString("base64");
  const response = await fetchWithTimeout("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { Authorization: `Basic ${basicToken}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  if (!response.ok) throw new Error(`spotify-token-failed:${response.status}`);
  const data = await response.json();
  const expiresIn = Number(data.expires_in || 3600);
  cred.cache.accessToken = data.access_token;
  cred.cache.expiresAt = now + expiresIn * 1000;
  return cred.cache.accessToken;
}

async function getSpotifyAccessToken() {
  const now = Date.now();
  // rate limited 되지 않은 첫 번째 자격증명 선택
  for (let i = 0; i < spotifyCredentials.length; i++) {
    const idx = (activeCredIdx + i) % spotifyCredentials.length;
    const cred = spotifyCredentials[idx];
    if (!cred.id || !cred.secret) continue;
    if (cred.rateLimitedUntil > now) continue;
    return await getSpotifyTokenForCred(cred);
  }
  // 모두 rate limited → 가장 빨리 해제되는 것 사용
  const best = spotifyCredentials.filter(c => c.id && c.secret).sort((a, b) => a.rateLimitedUntil - b.rateLimitedUntil)[0];
  if (!best) throw new Error("Spotify 자격증명 없음");
  return await getSpotifyTokenForCred(best);
}

function markSpotifyRateLimited(retryAfterSec = 60) {
  const now = Date.now();
  const cred = spotifyCredentials[activeCredIdx % spotifyCredentials.length];
  if (cred) cred.rateLimitedUntil = now + retryAfterSec * 1000;
  // 다음 자격증명으로 전환
  activeCredIdx = (activeCredIdx + 1) % spotifyCredentials.length;
  console.log(`[Spotify] 키 ${activeCredIdx + 1}로 전환 (${retryAfterSec}초 후 복구)`);
}

async function fetchSpotifyPlaylist(playlistId) {
  const token = await getSpotifyAccessToken();
  const endpointWithMarket = `https://api.spotify.com/v1/playlists/${playlistId}?market=KR`;
  let response = await fetchWithTimeout(endpointWithMarket, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 404) {
    const endpointNoMarket = `https://api.spotify.com/v1/playlists/${playlistId}`;
    response = await fetchWithTimeout(endpointNoMarket, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
  }

  if (!response.ok) {
    throw new Error(`spotify-playlist-failed:${response.status}`);
  }

  const data = await response.json();
  const items = Array.isArray(data.tracks && data.tracks.items)
    ? data.tracks.items
    : [];
  const tracks = items
    .map((item) => item.track)
    .filter(Boolean)
    .map((track) => ({
      title: track.name || "Unknown",
      artist: Array.isArray(track.artists)
        ? track.artists.map((artist) => artist.name).join(", ")
        : "Unknown Artist",
      source: "spotify",
      spotifyUrl:
        track.external_urls && track.external_urls.spotify
          ? track.external_urls.spotify
          : "",
      previewUrl: track.preview_url || "",
      coverUrl:
        track.album &&
        Array.isArray(track.album.images) &&
        track.album.images[0]
          ? track.album.images[0].url
          : "",
    }))
    .slice(0, 50);

  const tokenText = `${data.name || ""} ${data.owner && data.owner.display_name ? data.owner.display_name : ""} ${tracks
    .slice(0, 20)
    .map((track) => `${track.title} ${track.artist}`)
    .join(" ")}`;

  return {
    playlistId,
    playlistName: data.name || "",
    ownerName:
      data.owner && data.owner.display_name ? data.owner.display_name : "",
    tokens: parseTokens(tokenText),
    tracks,
  };
}

async function fetchSpotifyPlaylistOEmbedFallback(playlistId) {
  const url = `https://open.spotify.com/playlist/${playlistId}`;
  const endpoint = `https://open.spotify.com/oembed?url=${encodeURIComponent(url)}`;
  const response = await fetchWithTimeout(endpoint);
  if (!response.ok) {
    throw new Error(`spotify-oembed-failed:${response.status}`);
  }

  const data = await response.json();
  const playlistName = data.title || "";
  const ownerName = data.author_name || "";
  const tokenText = `${playlistName} ${ownerName}`;

  return {
    playlistId,
    playlistName,
    ownerName,
    tokens: parseTokens(tokenText),
    tracks: [],
    fallback: true,
  };
}

async function searchSpotifyTracks(term, options = {}) {
  const token = await getSpotifyAccessToken();
  const limit = Math.min(50, Math.max(1, Number(options.limit || 50)));
  const offset = Math.max(0, Number(options.offset || 0));
  const market = options.market || "KR";
  const endpoint = `https://api.spotify.com/v1/search?q=${encodeURIComponent(term)}&type=track&market=${encodeURIComponent(market)}&limit=${limit}&offset=${offset}`;

  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get("retry-after") || "60", 10);
    markSpotifyRateLimited(retryAfter);
    throw new Error(`spotify-search-failed:429`);
  }
  if (!response.ok) {
    throw new Error(`spotify-search-failed:${response.status}`);
  }

  const data = await response.json();
  const items =
    data && data.tracks && Array.isArray(data.tracks.items)
      ? data.tracks.items
      : [];
  return items.map((track) => ({
    title: track.name || "Unknown",
    artist: Array.isArray(track.artists)
      ? track.artists.map((artist) => artist.name).join(", ")
      : "Unknown Artist",
    source: "spotify",
    spotifyUrl:
      track.external_urls && track.external_urls.spotify
        ? track.external_urls.spotify
        : "",
    previewUrl: track.preview_url || "",
    coverUrl:
      track.album && Array.isArray(track.album.images) && track.album.images[0]
        ? track.album.images[0].url
        : "",
  }));
}

async function fetchSpotifyCandidates(terms, options = {}) {
  const market = options.market || "KR";
  const origin = options.origin || "all";
  const requested = Math.max(30, Math.min(220, Number(options.limit || 120)));

  const searchJobs = [];
  terms.slice(0, 8).forEach((term) => {
    searchJobs.push({ term, offset: 0 });
    searchJobs.push({ term, offset: 50 });
  });

  const settled = await Promise.allSettled(
    searchJobs.map((job) =>
      searchSpotifyTracks(job.term, { market, limit: 50, offset: job.offset }),
    ),
  );

  const merged = [];
  settled.forEach((result, index) => {
    if (result.status !== "fulfilled") return;
    const term = searchJobs[index].term;
    const genre = inferGenreFromText(term);
    result.value.forEach((track) => {
      merged.push({
        ...track,
        genre,
        origin: origin === "all" ? "global" : origin,
      });
    });
  });

  const seen = new Set();
  const unique = [];
  merged.forEach((track) => {
    const key = `${track.title}::${track.artist}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(track);
  });

  return unique.slice(0, requested);
}

async function fetchSpotifyCover(title, artist) {
  const token = await getSpotifyAccessToken();
  const query = `track:${title || ""} artist:${artist || ""}`.trim();
  if (!query) {
    return { coverUrl: "", spotifyUrl: "", previewUrl: "" };
  }

  const endpoint = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&market=KR&limit=5`;
  const response = await fetchWithTimeout(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    throw new Error(`spotify-cover-failed:${response.status}`);
  }

  const data = await response.json();
  const candidates =
    data && data.tracks && Array.isArray(data.tracks.items)
      ? data.tracks.items
      : [];
  const item = pickBestSpotifyMatch(title, artist, candidates);
  if (!item) {
    return { coverUrl: "", spotifyUrl: "", previewUrl: "" };
  }

  return {
    coverUrl:
      item.album && Array.isArray(item.album.images) && item.album.images[0]
        ? item.album.images[0].url
        : "",
    spotifyUrl:
      item.external_urls && item.external_urls.spotify
        ? item.external_urls.spotify
        : "",
    previewUrl: item.preview_url || "",
  };
}

function sanitizeYouTubeTitle(rawTitle) {
  return String(rawTitle || "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(
      /\b(official|mv|m\/v|audio|lyrics|lyric|performance|visualizer|teaser|shorts?)\b/gi,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function splitYouTubeArtistTitle(videoTitle, channelTitle) {
  const cleaned = sanitizeYouTubeTitle(videoTitle);
  if (!cleaned) {
    return { title: "Unknown", artist: channelTitle || "Unknown Artist" };
  }

  const separators = [" - ", " | ", " : ", " – "];
  for (const sep of separators) {
    if (cleaned.includes(sep)) {
      const [left, right] = cleaned.split(sep);
      const leftTrim = String(left || "").trim();
      const rightTrim = String(right || "").trim();
      if (leftTrim && rightTrim) {
        return { title: rightTrim, artist: leftTrim };
      }
    }
  }

  return {
    title: cleaned,
    artist: channelTitle || "Unknown Artist",
  };
}

async function searchYouTubeMusicVideos(term, options = {}) {
  const maxResults = Math.min(
    50,
    Math.max(5, Number(options.maxResults || 25)),
  );
  const regionCode = options.regionCode || "KR";
  const pageToken = options.pageToken || "";
  const params = new URLSearchParams({
    part: "snippet",
    type: "video",
    videoCategoryId: "10",
    videoDuration: "medium",
    q: term,
    maxResults: String(maxResults),
    regionCode,
    key: YOUTUBE_API_KEY,
  });

  if (pageToken) {
    params.set("pageToken", pageToken);
  }

  const endpoint = `https://www.googleapis.com/youtube/v3/search?${params.toString()}`;
  const response = await fetchWithTimeout(endpoint);
  if (!response.ok) {
    throw new Error(`youtube-search-failed:${response.status}`);
  }

  const data = await response.json();
  const items = Array.isArray(data.items) ? data.items : [];
  return {
    items,
    nextPageToken: data.nextPageToken || "",
  };
}

async function fetchYouTubeCandidates(terms, options = {}) {
  const origin = options.origin || "all";
  const requested = Math.max(30, Math.min(220, Number(options.limit || 120)));
  const regionCodes =
    origin === "domestic"
      ? ["KR"]
      : origin === "japan"
        ? ["JP"]
        : ["US", "KR", "JP"];
  const merged = [];

  for (const term of terms.slice(0, 6)) {
    for (const regionCode of regionCodes) {
      let token = "";
      for (let page = 0; page < 2; page += 1) {
        const pageData = await searchYouTubeMusicVideos(term, {
          maxResults: 25,
          regionCode,
          pageToken: token,
        });
        const genre = inferGenreFromText(term);

        pageData.items.forEach((item) => {
          const snippet = item && item.snippet ? item.snippet : null;
          const videoId =
            item && item.id && item.id.videoId ? item.id.videoId : "";
          if (!snippet || !videoId) return;
          if (!isLikelyMusicVideo(item)) return;

          const parsed = splitYouTubeArtistTitle(
            snippet.title,
            snippet.channelTitle || "",
          );
          merged.push({
            title: parsed.title,
            artist: parsed.artist,
            source: "youtube",
            youtubeUrl: `https://www.youtube.com/watch?v=${videoId}`,
            coverUrl:
              snippet.thumbnails && snippet.thumbnails.medium
                ? snippet.thumbnails.medium.url
                : "",
            previewUrl: "",
            genre,
            origin:
              origin === "all"
                ? regionCode === "KR"
                  ? "domestic"
                  : regionCode === "JP"
                    ? "japan"
                    : "global"
                : origin,
          });
        });

        token = pageData.nextPageToken;
        if (!token) break;
      }
    }
  }

  const seen = new Set();
  const unique = [];
  merged.forEach((track) => {
    const key = `${track.title}::${track.artist}`.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    unique.push(track);
  });

  return unique.slice(0, requested);
}

function toPublicItem(item) {
  return {
    id: item.id,
    name: item.name,
    owner: item.owner,
    ownerUsername: item.ownerUsername || "",
    theme: item.theme,
    genres: Array.isArray(item.genres) ? item.genres : [],
    likes: item.likes || 0,
    createdAt: item.createdAt,
    tracks: Array.isArray(item.tracks) ? item.tracks : [],
  };
}

function toCommunityItem(item) {
  return {
    id: item.id,
    name: item.name,
    owner: item.owner,
    ownerUsername: item.owner_username || "",
    theme: item.theme || "",
    genres: Array.isArray(item.genres) ? item.genres : [],
    likes: item.likes || 0,
    createdAt: item.created_at,
    tracks: Array.isArray(item.tracks) ? item.tracks : [],
    coverImage: item.cover_image || null,
  };
}

function extractGenres(tracks) {
  const counts = {};
  (tracks || []).forEach((t) => { if (t.genre) counts[t.genre] = (counts[t.genre] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
}

function dotProduct(a, b) {
  const size = Math.min(a.length, b.length);
  let sum = 0;
  for (let i = 0; i < size; i += 1) {
    sum += Number(a[i] || 0) * Number(b[i] || 0);
  }
  return sum;
}

function vectorNorm(a) {
  return Math.sqrt(dotProduct(a, a));
}

function cosineSimilarity(a, b) {
  const denom = vectorNorm(a) * vectorNorm(b);
  if (!denom) return 0;
  return dotProduct(a, b) / denom;
}

function buildRerankQueryText(context = {}) {
  const genres = Array.isArray(context.genres) ? context.genres.join(" ") : "";
  const likeTokens = Array.isArray(context.likeTokens)
    ? context.likeTokens.slice(0, 10).join(" ")
    : "";
  const ocrTokens = Array.isArray(context.ocrTokens)
    ? context.ocrTokens.slice(0, 10).join(" ")
    : "";
  const spotifyTokens = Array.isArray(context.spotifyTokens)
    ? context.spotifyTokens.slice(0, 10).join(" ")
    : "";

  return [
    "music recommendation",
    `mood ${context.mood || "all"}`,
    `state ${context.state || "all"}`,
    `color ${context.color || "all"}`,
    `season ${context.season || "all"}`,
    `origin ${context.origin || "all"}`,
    genres,
    likeTokens,
    ocrTokens,
    spotifyTokens,
  ]
    .filter(Boolean)
    .join(" ");
}

function buildTrackText(track = {}) {
  return [
    track.title || "",
    track.artist || "",
    track.genre || "",
    track.mood || "",
    track.state || "",
    track.origin || "",
    track.source || "",
  ]
    .filter(Boolean)
    .join(" ");
}

function tokenizeSimple(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u3131-\u318e\uac00-\ud7a3\s]/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1)
    .slice(0, 64);
}

function localSemanticScore(queryText, trackText) {
  const q = tokenizeSimple(queryText);
  const t = tokenizeSimple(trackText);
  if (q.length === 0 || t.length === 0) return 0;

  const qSet = new Set(q);
  const tSet = new Set(t);
  let overlap = 0;
  qSet.forEach((token) => {
    if (tSet.has(token)) overlap += 1;
  });

  return overlap / Math.max(qSet.size, tSet.size);
}

async function fetchOpenAiEmbeddings(texts) {
  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: OPENAI_EMBED_MODEL,
        input: texts,
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`openai-embeddings-failed:${response.status}`);
  }

  const payload = await response.json();
  const vectors = Array.isArray(payload.data)
    ? payload.data.map((item) => item.embedding)
    : [];
  if (vectors.length !== texts.length) {
    throw new Error("openai-embeddings-invalid");
  }
  return vectors;
}

async function rerankTracks(context, tracks, limit) {
  const clipped = tracks.slice(0, AI_RERANK_MAX_ITEMS);
  if (clipped.length === 0) {
    return { tracks: [], provider: "none", fallback: true };
  }

  const queryText = buildRerankQueryText(context);
  const trackTexts = clipped.map((track) => buildTrackText(track));

  if (OPENAI_API_KEY) {
    try {
      const vectors = await fetchOpenAiEmbeddings([queryText, ...trackTexts]);
      const queryVector = vectors[0];
      const rescored = clipped
        .map((track, idx) => {
          const similarity = cosineSimilarity(queryVector, vectors[idx + 1]);
          const baseScore = Number(track.score || 0);
          const hybridScore = baseScore + similarity * 3.2;
          return {
            ...track,
            aiScore: similarity,
            score: hybridScore,
            reasons: [
              ...(Array.isArray(track.reasons) ? track.reasons : []),
              "임베딩 유사도 반영",
            ],
          };
        })
        .sort(
          (a, b) => b.score - a.score || a.title.localeCompare(b.title, "ko"),
        );

      return {
        tracks: rescored.slice(0, limit),
        provider: "openai-embeddings",
        fallback: false,
      };
    } catch (_error) {
      // Fallback below keeps recommendation available even when embedding API fails.
    }
  }

  const rescoredLocal = clipped
    .map((track) => {
      const similarity = localSemanticScore(queryText, buildTrackText(track));
      const baseScore = Number(track.score || 0);
      return {
        ...track,
        aiScore: similarity,
        score: baseScore + similarity * 1.6,
        reasons: [
          ...(Array.isArray(track.reasons) ? track.reasons : []),
          "의미 기반 재정렬",
        ],
      };
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ko"));

  return {
    tracks: rescoredLocal.slice(0, limit),
    provider: "local-semantic",
    fallback: true,
  };
}

async function generateAiSearchTerms(context) {
  const genreLabel = {
    kpop: "K-POP", jpop: "J-POP", pop: "POP", hiphop: "Hip-Hop",
    rnb: "R&B", band: "Band/Rock", edm: "EDM", indie: "Indie", ballad: "Ballad",
  };
  const genres = (context.genres || []).map((g) => genreLabel[g] || g).join(", ") || "any";
  const originLabel = { domestic: "Korean", japan: "Japanese", global: "Western/Global", all: "any" };
  const origin = originLabel[context.origin] || "any";

  const hasUserInputs = context.likes || context.ocrContent || context.spotifyTracks;
  const systemPrompt = `You are a music recommendation AI. Output ONLY valid JSON. No extra text.`;

  const primaryBlock = hasUserInputs ? `⭐ PRIMARY SIGNALS (최우선 — 이와 유사한 음악을 찾아야 함):
${context.likes ? `- 좋아하는 가수/곡: ${context.likes}` : ""}
${context.spotifyTracks ? `- Spotify 플레이리스트: ${context.spotifyTracks}` : ""}
${context.ocrContent ? `- 이미지에서 감지된 곡/가수: ${context.ocrContent}` : ""}

위 아티스트들과 음악적으로 유사한 아티스트/곡을 반드시 포함할 것.

` : "";

  const userPrompt = `${primaryBlock}보조 선호:
- 장르: ${genres}
- 기분: ${context.mood || "any"}
- 상황: ${context.state || "any"}
- 색감: ${context.color || "any"}
- 계절: ${context.season || "any"}
- 추천 범위: ${origin}

Spotify/YouTube 검색에 최적화된 검색어를 생성해줘.
${hasUserInputs ? "PRIMARY SIGNALS 아티스트와 스타일이 비슷한 아티스트를 searchTerms와 suggestedArtists에 우선 포함." : ""}

Output JSON:
{
  "searchTerms": ["10 to 14 specific search query strings"],
  "vibeDescription": "2~3문장 한국어로 플레이리스트 분위기 설명 (PRIMARY SIGNALS 반영)",
  "suggestedArtists": ["6 to 8 specific artist names — similar to PRIMARY SIGNALS if provided"]
}`;

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" },
      }),
    },
    15000,
  );

  if (!response.ok) {
    throw new Error(`openai-suggest-failed:${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || "{}";
  return JSON.parse(content);
}

async function aiFilterTracks(context, tracks) {
  const genreLabel = {
    kpop: "K-POP", jpop: "J-POP", pop: "POP", hiphop: "Hip-Hop",
    rnb: "R&B", band: "Band/Rock", edm: "EDM", indie: "Indie", ballad: "Ballad",
  };
  const moodLabel = { happy: "신남/활기참", calm: "잔잔함/평온", focus: "집중", sad: "감성적/슬픔", romantic: "설렘/로맨틱", all: "무관" };
  const stateLabel = { workout: "운동", study: "공부/집중", drive: "드라이브", night: "야간/밤", walk: "산책", all: "무관" };

  const genres = (context.genres || []).map((g) => genreLabel[g] || g).join(", ") || "무관";
  const mood = moodLabel[context.mood] || context.mood || "무관";
  const state = stateLabel[context.state] || context.state || "무관";

  const trackList = tracks.slice(0, 50).map((t, i) =>
    `${i + 1}. "${t.title}" - ${t.artist}${t.genre ? ` [${genreLabel[t.genre] || t.genre}]` : ""}`
  ).join("\n");

  const systemPrompt = `You are a professional music curator. Evaluate songs based on user preferences. Return ONLY valid JSON, no extra text.`;

  const originRule = context.origin === "domestic"
    ? "⚠️ 반드시 한국 아티스트/한국 음악만 높은 점수를 줘. 해외/일본 곡은 무조건 3점 이하."
    : context.origin === "japan"
    ? "⚠️ 반드시 일본 아티스트/일본 음악만 높은 점수를 줘. 한국/해외 곡은 무조건 3점 이하."
    : context.origin === "global"
    ? "⚠️ 서양(미국/영국 등) 아티스트 곡만 높은 점수를 줘. 한국/일본 곡은 무조건 3점 이하."
    : "";

  const hasPrimary = context.likes || context.ocrContent || context.spotifyTracks;
  const primarySection = hasPrimary ? `⭐ PRIMARY SIGNALS (가장 중요한 판단 기준):
${context.likes ? `- 사용자가 좋아하는 가수/곡: ${context.likes}` : ""}
${context.spotifyTracks ? `- Spotify 플레이리스트 곡들: ${context.spotifyTracks}` : ""}
${context.ocrContent ? `- 이미지 캡처 곡/가수: ${context.ocrContent}` : ""}

위 아티스트/곡과 음악적 스타일이 유사하면 높은 점수를 줘.

` : "";

  const userPrompt = `${primarySection}보조 선호:
- 장르: ${genres}
- 기분: ${mood}
- 상황: ${state}
- 추천 범위: ${context.origin || "all"}

${originRule}

아래 곡들을 평가해줘. 곡 제목/아티스트로 장르·분위기·국적·스타일을 유추해서 판단.
${hasPrimary ? "PRIMARY SIGNALS 아티스트와 스타일이 유사할수록 높은 점수." : ""}
점수 기준: 0=전혀 안 맞음, 5=보통, 7=잘 맞음, 10=완벽히 맞음

각 곡의 국적(origin)도 판별해줘:
- "domestic" = 한국 아티스트/한국 음악
- "japan"    = 일본 아티스트/일본 음악
- "global"   = 그 외 (미국·영국·유럽 등 서양)

${trackList}

Return JSON:
{
  "scores": [
    {"index": 1, "score": 8, "origin": "domestic", "reason": "이유를 한국어로 간단히"},
    ...
  ]
}`;

  const response = await fetchWithTimeout(
    "https://api.openai.com/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      }),
    },
    25000,
  );

  if (!response.ok) {
    throw new Error(`openai-filter-failed:${response.status}`);
  }

  const data = await response.json();
  const content = data.choices[0]?.message?.content || '{"scores":[]}';
  return JSON.parse(content);
}

async function handleApi(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = requestUrl.pathname;

  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return true;
  }

  // 회원가입
  if (pathname === "/api/auth/signup" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { message: "잘못된 JSON 형식입니다." });
      return true;
    }

    const username = String(payload.username || "").trim().toLowerCase();
    const password = String(payload.password || "").trim();
    const name = String(payload.name || "").trim();
    const phone = String(payload.phone || "").trim();

    if (!username || !password || !name || !phone) {
      sendJson(res, 400, { message: "아이디, 비밀번호, 이름, 전화번호는 필수입니다." });
      return true;
    }

    if (!/^[a-z0-9]{4,20}$/.test(username)) {
      sendJson(res, 400, { message: "아이디는 영문자+숫자 4~20자여야 합니다." });
      return true;
    }

    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      sendJson(res, 400, { message: "비밀번호는 8자 이상, 영문+숫자+특수문자를 포함해야 합니다." });
      return true;
    }

    // 아이디 중복 확인
    try {
      const { data: existUser } = await supabase
        .from("users").select("id").eq("username", username).single();
      if (existUser) {
        sendJson(res, 409, { message: "이미 사용 중인 아이디입니다." });
        return true;
      }
    } catch (_error) {}

    // 닉네임(이름) 중복 확인
    try {
      const { data: existName } = await supabase
        .from("users").select("id").eq("name", name).single();
      if (existName) {
        sendJson(res, 409, { message: "이미 사용 중인 닉네임(이름)입니다." });
        return true;
      }
    } catch (_error) {}

    const result = await createUser(username, password, name, phone);
    if (result.success) {
      sendJson(res, 201, {
        message: "회원가입 성공",
        token: result.token,
        username: result.username,
      });
    } else {
      sendJson(res, 400, { message: result.message });
    }
    return true;
  }

  // 로그인
  if (pathname === "/api/auth/login" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { message: "잘못된 JSON 형식입니다." });
      return true;
    }

    const username = String(payload.username || "").trim().toLowerCase();
    const password = String(payload.password || "").trim();

    if (!username || !password) {
      sendJson(res, 400, { message: "아이디와 비밀번호는 필수입니다." });
      return true;
    }

    const result = await authenticateUser(username, password);
    if (result.success) {
      sendJson(res, 200, {
        message: "로그인 성공",
        token: result.token,
        username: result.username,
        name: result.name,
      });
    } else {
      sendJson(res, 401, { message: result.message, code: result.code });
    }
    return true;
  }

  // 전화번호로 비밀번호 재설정 인증
  if (pathname === "/api/auth/verify-phone" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { message: "잘못된 JSON 형식입니다." });
      return true;
    }

    const username = String(payload.username || "").trim().toLowerCase();
    const phone = String(payload.phone || "").trim();

    if (!username || !phone) {
      sendJson(res, 400, { message: "아이디와 전화번호는 필수입니다." });
      return true;
    }

    const result = await verifyPhoneForReset(username, phone);
    if (result.success) {
      sendJson(res, 200, { resetToken: result.resetToken });
    } else {
      sendJson(res, 400, { message: result.message });
    }
    return true;
  }

  // 비밀번호 재설정
  if (pathname === "/api/auth/reset-password" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { message: "잘못된 JSON 형식입니다." });
      return true;
    }

    const resetToken = String(payload.resetToken || "").trim();
    const newPassword = String(payload.newPassword || "").trim();

    if (!resetToken || !newPassword) {
      sendJson(res, 400, { message: "재설정 토큰과 새 비밀번호는 필수입니다." });
      return true;
    }

    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      sendJson(res, 400, { message: "비밀번호는 8자 이상, 영문+숫자+특수문자를 포함해야 합니다." });
      return true;
    }

    const result = await resetPassword(resetToken, newPassword);
    if (result.success) {
      sendJson(res, 200, { message: "비밀번호가 재설정되었습니다." });
    } else {
      sendJson(res, 400, { message: result.message });
    }
    return true;
  }

  // OAuth 사용자 동기화 (Google/GitHub → 우리 DB)
  if (pathname === "/api/auth/oauth/sync" && req.method === "POST") {
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const { provider, providerId, email, name } = payload;
    if (!provider || !providerId) { sendJson(res, 400, { message: "provider, providerId 필요" }); return true; }
    const result = await syncOAuthUser(provider, providerId, email, name);
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // 네이버 OAuth 시작
  if (pathname === "/api/auth/naver" && req.method === "GET") {
    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
    if (!NAVER_CLIENT_ID) { sendJson(res, 503, { message: "네이버 OAuth 미설정" }); return true; }
    const baseUrl = req.headers.origin || `http://localhost:${PORT}`;
    const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/callback/naver`);
    const state = crypto.randomBytes(16).toString("hex");
    const naverUrl = `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${NAVER_CLIENT_ID}&redirect_uri=${redirectUri}&state=${state}`;
    res.writeHead(302, { Location: naverUrl });
    res.end();
    return true;
  }

  // 네이버 OAuth 콜백
  if (pathname === "/api/auth/callback/naver" && req.method === "GET") {
    const NAVER_CLIENT_ID = process.env.NAVER_CLIENT_ID || "";
    const NAVER_CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || "";
    const code = requestUrl.searchParams.get("code") || "";
    const baseUrl = req.headers.origin || `http://localhost:${PORT}`;
    const redirectUri = encodeURIComponent(`${baseUrl}/api/auth/callback/naver`);

    if (!code) {
      res.writeHead(302, { Location: "/login.html?error=naver_auth_failed" }); res.end(); return true;
    }

    try {
      // 토큰 교환
      const tokenRes = await fetchWithTimeout(
        `https://nid.naver.com/oauth2.0/token?grant_type=authorization_code&client_id=${NAVER_CLIENT_ID}&client_secret=${NAVER_CLIENT_SECRET}&code=${code}&redirect_uri=${redirectUri}`,
        { method: "GET" }
      );
      const tokenData = await tokenRes.json();
      if (!tokenData.access_token) throw new Error("token_failed");

      // 사용자 정보 조회
      const profileRes = await fetchWithTimeout("https://openapi.naver.com/v1/nid/me", {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      const profileData = await profileRes.json();
      const nv = profileData.response || {};

      const result = await syncOAuthUser("naver", nv.id, nv.email, nv.name || nv.nickname);
      if (!result.success) throw new Error(result.message);

      // 메인으로 리다이렉트 (쿼리로 토큰 전달)
      res.writeHead(302, {
        Location: `/callback.html?token=${result.token}&username=${encodeURIComponent(result.username)}&name=${encodeURIComponent(result.name)}`,
      });
      res.end();
    } catch (err) {
      console.error("Naver OAuth error:", err.message);
      res.writeHead(302, { Location: "/login.html?error=naver_failed" });
      res.end();
    }
    return true;
  }

  // 사용자 프로필 조회
  if (pathname === "/api/user/profile" && req.method === "GET") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const result = await getUserProfile(token);
    sendJson(res, result.success ? 200 : 401, result);
    return true;
  }

  // 이름 변경
  if (pathname === "/api/user/profile" && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const name = String(payload.name || "").trim();
    if (!name) { sendJson(res, 400, { message: "이름을 입력해주세요." }); return true; }

    // 닉네임 중복 확인 (본인 제외)
    try {
      const { data: cur } = await supabase.from("users").select("id, name").eq("auth_token", token).single();
      if (cur && cur.name !== name) {
        const { data: existName } = await supabase.from("users").select("id").eq("name", name).single();
        if (existName) { sendJson(res, 409, { message: "이미 사용 중인 닉네임입니다." }); return true; }
      }
    } catch (_error) {}

    const result = await updateUserName(token, name);
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // 프로필 사진 변경
  if (pathname === "/api/user/avatar" && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const avatarUrl = String(payload.avatar_url || "").trim();
    if (!avatarUrl) { sendJson(res, 400, { message: "이미지 데이터가 없습니다." }); return true; }
    if (avatarUrl.length > 300000) { sendJson(res, 400, { message: "이미지 크기가 너무 큽니다. (최대 200KB)" }); return true; }
    try {
      const { error } = await supabase.from("users").update({ avatar_url: avatarUrl }).eq("auth_token", token);
      if (error) throw error;
      sendJson(res, 200, { success: true });
    } catch (_e) {
      sendJson(res, 500, { message: "프로필 사진 변경에 실패했습니다." });
    }
    return true;
  }

  // 비밀번호 변경
  if (pathname === "/api/user/password" && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const currentPassword = String(payload.currentPassword || "").trim();
    const newPassword = String(payload.newPassword || "").trim();
    if (!currentPassword || !newPassword) { sendJson(res, 400, { message: "비밀번호를 입력해주세요." }); return true; }
    if (newPassword.length < 8 || !/[a-zA-Z]/.test(newPassword) || !/[0-9]/.test(newPassword) || !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(newPassword)) {
      sendJson(res, 400, { message: "새 비밀번호는 8자 이상, 영문+숫자+특수문자를 포함해야 합니다." }); return true;
    }
    const result = await changePassword(token, currentPassword, newPassword);
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // 개인 플레이리스트 삭제
  if (pathname === "/api/user/playlists" && req.method === "DELETE") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 필요" }); return true; }
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
    const { error } = await supabase.from("playlists").delete().eq("id", payload.id).eq("user_id", user.id);
    sendJson(res, error ? 400 : 200, error ? { message: "삭제 실패" } : { success: true });
    return true;
  }

  // 내 플레이리스트 목록 조회
  if (pathname === "/api/user/playlists" && req.method === "GET") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const result = await getUserPlaylistsFromDb(token);
    sendJson(res, result.success ? 200 : 401, result);
    return true;
  }

  // 좋아요한 플레이리스트 조회
  if (pathname === "/api/user/likes" && req.method === "GET") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const result = await getLikedPlaylists(token);
    sendJson(res, result.success ? 200 : 401, result);
    return true;
  }

  // 좋아요 삭제
  if (pathname === "/api/user/likes" && req.method === "DELETE") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 필요" }); return true; }
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
    if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
    const { error } = await supabase.from("playlist_likes").delete().eq("id", payload.id).eq("user_id", user.id);
    sendJson(res, error ? 400 : 200, error ? { message: "삭제 실패" } : { success: true });
    return true;
  }

  // 좋아요 토글
  if (pathname === "/api/user/likes" && req.method === "POST") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const result = await toggleLikePlaylist(token, String(payload.playlistId || ""), String(payload.playlistName || ""), payload.playlistData || {});
    sendJson(res, result.success ? 200 : 400, result);
    return true;
  }

  // 내가 좋아요한 플레이리스트 ID 목록
  if (pathname === "/api/user/liked-ids" && req.method === "GET") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 200, { ids: [] }); return true; }
    const ids = await getUserLikedIds(token);
    sendJson(res, 200, { ids });
    return true;
  }

  // 플레이리스트 저장 (인증 필요)
  if (pathname === "/api/user/playlists" && req.method === "POST") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) {
      sendJson(res, 401, { message: "인증 토큰이 필요합니다." });
      return true;
    }

    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { message: "잘못된 JSON 형식입니다." });
      return true;
    }

    const playlistName = String(payload.name || "새 플레이리스트").slice(
      0,
      100,
    );
    const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];
    const preferences = payload.preferences || {};

    const result = await saveUserPlaylist(
      token,
      playlistName,
      tracks,
      preferences,
    );
    if (result.success) {
      sendJson(res, 201, result);
    } else {
      sendJson(res, 401, { message: result.message });
    }
    return true;
  }

  // 커뮤니티 플레이리스트 커버 변경 (본인 소유만)
  if (pathname.startsWith("/api/playlists/") && pathname.endsWith("/cover") && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const playlistId = pathname.replace("/api/playlists/", "").replace("/cover", "");
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const coverImage = payload.cover_image;
    if (!coverImage?.type || !coverImage?.value) { sendJson(res, 400, { message: "cover_image 형식 오류" }); return true; }
    if (coverImage.type === "upload" && coverImage.value.length > 300000) { sendJson(res, 400, { message: "이미지 크기가 너무 큽니다." }); return true; }
    try {
      const { data: user } = await supabase.from("users").select("username").eq("auth_token", token).single();
      if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
      const { error } = await supabase.from("community_playlists").update({ cover_image: coverImage }).eq("id", playlistId).eq("owner_username", user.username);
      if (error) throw error;
      sendJson(res, 200, { success: true });
    } catch (_e) {
      sendJson(res, 500, { message: "커버 변경 실패" });
    }
    return true;
  }

  // 커뮤니티 플레이리스트 장르 업데이트 (본인 소유만)
  if (pathname.startsWith("/api/playlists/") && pathname.endsWith("/genres") && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const playlistId = pathname.replace("/api/playlists/", "").replace("/genres", "");
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const genres = Array.isArray(payload.genres) ? payload.genres.slice(0, 3) : [];
    const VALID = ["kpop","jpop","pop","hiphop","rnb","band","edm","indie","ballad"];
    const clean = genres.filter(g => VALID.includes(g));
    try {
      const { data: user } = await supabase.from("users").select("username").eq("auth_token", token).single();
      if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
      const { error } = await supabase.from("community_playlists").update({ genres: clean }).eq("id", playlistId).eq("owner_username", user.username);
      if (error) throw error;
      sendJson(res, 200, { success: true, genres: clean });
    } catch (_e) {
      sendJson(res, 500, { message: "장르 업데이트 실패" });
    }
    return true;
  }

  // 개인 플레이리스트 이름 변경
  if (pathname.startsWith("/api/user/playlists/") && pathname.endsWith("/name") && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const playlistId = pathname.replace("/api/user/playlists/", "").replace("/name", "");
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const name = String(payload.name || "").trim().slice(0, 100);
    if (!name) { sendJson(res, 400, { message: "이름을 입력해주세요." }); return true; }
    try {
      const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
      if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
      const { error } = await supabase.from("playlists").update({ name }).eq("id", playlistId).eq("user_id", user.id);
      if (error) throw error;
      sendJson(res, 200, { success: true });
    } catch (_e) {
      sendJson(res, 500, { message: "이름 변경 실패" });
    }
    return true;
  }

  // 개인 플레이리스트 커버 변경
  if (pathname.startsWith("/api/user/playlists/") && pathname.endsWith("/cover") && req.method === "PUT") {
    const token = req.headers.authorization?.replace("Bearer ", "");
    if (!token) { sendJson(res, 401, { message: "인증 토큰이 필요합니다." }); return true; }
    const playlistId = pathname.replace("/api/user/playlists/", "").replace("/cover", "");
    let payload;
    try { payload = await readJsonBody(req); } catch (_e) { sendJson(res, 400, { message: "잘못된 요청" }); return true; }
    const coverImage = payload.cover_image;
    if (!coverImage || !coverImage.type || !coverImage.value) { sendJson(res, 400, { message: "cover_image 형식 오류" }); return true; }
    if (coverImage.type === "upload" && coverImage.value.length > 300000) { sendJson(res, 400, { message: "이미지 크기가 너무 큽니다." }); return true; }
    try {
      const { data: user } = await supabase.from("users").select("id").eq("auth_token", token).single();
      if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
      const { error } = await supabase.from("playlists").update({ cover_image: coverImage }).eq("id", playlistId).eq("user_id", user.id);
      if (error) throw error;
      // 공유된 커뮤니티 플레이리스트에도 동기화
      await supabase.from("community_playlists").update({ cover_image: coverImage }).eq("source_playlist_id", playlistId);
      sendJson(res, 200, { success: true });
    } catch (_e) {
      sendJson(res, 500, { message: "커버 변경 실패" });
    }
    return true;
  }

  if (pathname.startsWith("/api/playlists/") && req.method === "DELETE") {
    const playlistId = pathname.replace("/api/playlists/", "");
    const authToken = req.headers.authorization?.replace("Bearer ", "");
    if (!authToken) { sendJson(res, 401, { message: "인증 필요" }); return true; }
    try {
      const { data: user } = await supabase.from("users").select("username").eq("auth_token", authToken).single();
      if (!user) { sendJson(res, 401, { message: "인증 실패" }); return true; }
      const { data: pl } = await supabase.from("community_playlists").select("owner_username").eq("id", playlistId).single();
      if (!pl) { sendJson(res, 404, { message: "플레이리스트를 찾을 수 없습니다" }); return true; }
      if (pl.owner_username !== user.username) { sendJson(res, 403, { message: "삭제 권한이 없습니다" }); return true; }
      await supabase.from("community_playlists").delete().eq("id", playlistId);
      sendJson(res, 200, { success: true });
    } catch (err) {
      sendJson(res, 500, { message: "삭제 중 오류 발생" });
    }
    return true;
  }

  if (pathname === "/api/playlists/weekly-top" && req.method === "GET") {
    try {
      const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: weeklyLikes } = await supabase
        .from("playlist_likes").select("playlist_id").gte("created_at", oneWeekAgo);
      const countMap = {};
      (weeklyLikes || []).forEach((l) => { countMap[l.playlist_id] = (countMap[l.playlist_id] || 0) + 1; });
      let ranked = [];
      if (Object.keys(countMap).length > 0) {
        const { data: pls } = await supabase.from("community_playlists").select("*").in("id", Object.keys(countMap));
        ranked = (pls || [])
          .map((pl) => ({ ...toCommunityItem(pl), weeklyLikes: countMap[pl.id] || 0 }))
          .sort((a, b) => b.weeklyLikes - a.weeklyLikes)
          .slice(0, 5);
      }
      if (ranked.length === 0) {
        const { data: top } = await supabase.from("community_playlists").select("*").order("likes", { ascending: false }).limit(5);
        ranked = (top || []).map((pl) => ({ ...toCommunityItem(pl), weeklyLikes: 0 }));
      }
      sendJson(res, 200, { items: ranked });
    } catch (_error) {
      sendJson(res, 200, { items: [] });
    }
    return true;
  }

  if (pathname === "/api/playlists" && req.method === "GET") {
    try {
      const genre = String(requestUrl.searchParams.get("genre") || "");
      const sort = String(requestUrl.searchParams.get("sort") || "recent");
      let query = supabase.from("community_playlists").select("*");
      if (genre && genre !== "all") query = query.contains("genres", [genre]);
      query = sort === "likes"
        ? query.order("likes", { ascending: false })
        : query.order("created_at", { ascending: false });
      const { data, error } = await query;
      if (error) throw error;
      sendJson(res, 200, { items: (data || []).map(toCommunityItem) });
    } catch (_error) {
      sendJson(res, 200, { items: [] });
    }
    return true;
  }

  if (pathname === "/api/playlists" && req.method === "POST") {
    let payload;
    try { payload = await readJsonBody(req); } catch (_error) {
      sendJson(res, 400, { error: "잘못된 JSON 형식입니다." }); return true;
    }
    if (!payload.name || !payload.owner) {
      sendJson(res, 400, { error: "name, owner는 필수입니다." }); return true;
    }
    const tracks = Array.isArray(payload.tracks) ? payload.tracks.slice(0, 20) : [];
    let ownerUsername = "";
    const authHeader = req.headers.authorization;
    if (authHeader) {
      try {
        const { data: u } = await supabase.from("users").select("username").eq("auth_token", authHeader.replace("Bearer ", "")).single();
        if (u) ownerUsername = u.username;
      } catch (_e) {}
    }
    const item = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      name: String(payload.name).slice(0, 80),
      owner: String(payload.owner).slice(0, 40),
      owner_username: ownerUsername,
      theme: String(payload.theme || "기본 테마").slice(0, 80),
      genres: Array.isArray(payload.genres) ? payload.genres : extractGenres(tracks),
      likes: 0,
      tracks,
      cover_image: payload.cover_image || null,
      source_playlist_id: payload.source_playlist_id ? String(payload.source_playlist_id) : null,
    };
    try {
      const { data, error } = await supabase.from("community_playlists").insert(item).select().single();
      if (error) throw error;
      sendJson(res, 201, { item: toCommunityItem(data) });
    } catch (_error) {
      sendJson(res, 500, { error: "저장 실패" });
    }
    return true;
  }

  if (pathname === "/api/feedback/events" && req.method === "GET") {
    const userId = String(requestUrl.searchParams.get("userId") || "").trim();
    const limitRaw = Number(requestUrl.searchParams.get("limit") || "120");
    const limit = Math.max(
      10,
      Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 120),
    );

    if (!userId) {
      sendJson(res, 400, { error: "userId가 필요합니다." });
      return true;
    }

    const db = await readFeedbackDb();
    const items = db.items
      .filter((item) => item.userId === userId)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, limit);
    sendJson(res, 200, { items });
    return true;
  }

  if (pathname === "/api/feedback/profile" && req.method === "GET") {
    const userId = String(requestUrl.searchParams.get("userId") || "").trim();
    if (!userId) {
      sendJson(res, 400, { error: "userId가 필요합니다." });
      return true;
    }

    const db = await readFeedbackDb();
    const userEvents = db.items.filter((item) => item.userId === userId);
    const profile = buildFeedbackProfile(userEvents);
    sendJson(res, 200, { profile, eventCount: userEvents.length });
    return true;
  }

  if (pathname === "/api/feedback/events" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { error: "잘못된 JSON 형식입니다." });
      return true;
    }

    const userId = String(payload.userId || "").trim();
    const sentiment = String(payload.sentiment || "").toLowerCase();
    const eventType = String(payload.eventType || "feedback").toLowerCase();
    const track =
      payload.track && typeof payload.track === "object" ? payload.track : null;

    if (!userId || !track || !track.title || !track.artist) {
      sendJson(res, 400, {
        error: "userId, track.title, track.artist는 필수입니다.",
      });
      return true;
    }

    const db = await readFeedbackDb();
    const event = {
      id: `${Date.now()}-${Math.floor(Math.random() * 10000)}`,
      userId,
      eventType,
      sentiment,
      track: {
        title: String(track.title).slice(0, 120),
        artist: String(track.artist).slice(0, 120),
        genre: String(track.genre || "").slice(0, 60),
        source: String(track.source || "").slice(0, 30),
      },
      createdAt: new Date().toISOString(),
    };

    db.items.push(event);
    if (db.items.length > 5000) {
      db.items = db.items.slice(db.items.length - 5000);
    }
    await writeFeedbackDb(db);

    const userEvents = db.items.filter((item) => item.userId === userId);
    const profile = buildFeedbackProfile(userEvents);
    sendJson(res, 201, { event, profile, eventCount: userEvents.length });
    return true;
  }

  if (pathname === "/api/spotify/playlist" && req.method === "GET") {
    const sourceUrl = requestUrl.searchParams.get("url") || "";
    const playlistId = parseSpotifyPlaylistId(sourceUrl);
    if (!playlistId) {
      sendJson(res, 200, {
        ...buildMinimalPlaylistFallback("unknown", sourceUrl),
        error: "유효한 Spotify 플레이리스트 URL이 아닙니다.",
      });
      return true;
    }

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      try {
        const fallback = await fetchSpotifyPlaylistOEmbedFallback(playlistId);
        sendJson(res, 200, {
          ...fallback,
          warning: "Spotify API 키 미설정 - oEmbed 대체 사용",
        });
      } catch (_error) {
        sendJson(res, 200, {
          ...buildMinimalPlaylistFallback(playlistId, sourceUrl),
          warning: "Spotify API 키 미설정 - 최소 데이터 모드",
        });
      }
      return true;
    }

    try {
      const data = await fetchSpotifyPlaylist(playlistId);
      sendJson(res, 200, data);
    } catch (error) {
      try {
        const fallback = await fetchSpotifyPlaylistOEmbedFallback(playlistId);
        sendJson(res, 200, fallback);
      } catch (_fallbackError) {
        sendJson(res, 200, {
          ...buildMinimalPlaylistFallback(playlistId, sourceUrl),
          warning: "Spotify 플레이리스트 조회 실패 - 최소 데이터 모드",
          detail: error.message || "unknown",
        });
      }
    }

    return true;
  }

  if (pathname === "/api/search" && req.method === "GET") {
    const q = String(requestUrl.searchParams.get("q") || "").trim();
    if (!q) { sendJson(res, 400, { error: "검색어를 입력하세요." }); return true; }
    const cacheKey = q.toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
      sendJson(res, 200, { tracks: cached.tracks }); return true;
    }
    try {
      const url = `https://itunes.apple.com/search?term=${encodeURIComponent(q)}&media=music&entity=song&limit=20&country=KR`;
      const itunesRes = await fetchWithTimeout(url);
      if (!itunesRes.ok) throw new Error(`itunes-search-failed:${itunesRes.status}`);
      const data = await itunesRes.json();
      const items = (data.results || []).map(t => ({
        title: t.trackName || "Unknown",
        artist: t.artistName || "Unknown",
        coverUrl: (t.artworkUrl100 || "").replace("100x100", "300x300"),
        source: "itunes",
        spotifyUrl: t.trackViewUrl || "",
        previewUrl: t.previewUrl || "",
      }));
      searchCache.set(cacheKey, { tracks: items, ts: Date.now() });
      sendJson(res, 200, { tracks: items });
    } catch (e) {
      console.error("[/api/search]", e?.message || e);
      sendJson(res, 500, { error: "검색 실패: " + (e?.message || "알 수 없는 오류") });
    }
    return true;
  }

  if (pathname === "/api/spotify/token" && req.method === "GET") {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      sendJson(res, 503, { error: "Spotify 미설정" }); return true;
    }
    try {
      const token = await getSpotifyAccessToken();
      sendJson(res, 200, { token });
    } catch (e) {
      sendJson(res, 500, { error: e?.message || "토큰 발급 실패" });
    }
    return true;
  }

  if (pathname === "/api/spotify/cover" && req.method === "GET") {
    const title = requestUrl.searchParams.get("title") || "";
    const artist = requestUrl.searchParams.get("artist") || "";

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      sendJson(res, 200, {
        coverUrl: "",
        spotifyUrl: "",
        previewUrl: "",
        warning: "Spotify API 키 미설정",
      });
      return true;
    }

    try {
      const data = await fetchSpotifyCover(title, artist);
      sendJson(res, 200, data);
    } catch (error) {
      sendJson(res, 200, {
        coverUrl: "",
        spotifyUrl: "",
        previewUrl: "",
        error: "Spotify 커버 조회 실패",
        detail: error.message || "unknown",
      });
    }

    return true;
  }

  if (pathname === "/api/spotify/candidates" && req.method === "GET") {
    const termsRaw = requestUrl.searchParams.get("terms") || "";
    const terms = termsRaw
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);
    if (terms.length === 0) {
      sendJson(res, 200, { tracks: [], error: "검색어(terms)가 필요합니다." });
      return true;
    }

    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      sendJson(res, 200, { tracks: [], warning: "Spotify API 키 미설정" });
      return true;
    }

    const origin = requestUrl.searchParams.get("origin") || "all";
    const market =
      origin === "domestic" ? "KR" : origin === "japan" ? "JP" : "US";
    const limit = Number(requestUrl.searchParams.get("limit") || "120");

    try {
      const tracks = await fetchSpotifyCandidates(terms, {
        market,
        origin,
        limit,
      });
      sendJson(res, 200, { tracks });
    } catch (error) {
      sendJson(res, 200, {
        tracks: [],
        error: "Spotify 후보군 조회 실패",
        detail: error.message || "unknown",
      });
    }

    return true;
  }

  if (pathname === "/api/youtube/candidates" && req.method === "GET") {
    const termsRaw = requestUrl.searchParams.get("terms") || "";
    const terms = termsRaw
      .split(",")
      .map((term) => term.trim())
      .filter(Boolean);

    if (terms.length === 0) {
      sendJson(res, 200, { tracks: [], error: "검색어(terms)가 필요합니다." });
      return true;
    }

    if (!YOUTUBE_API_KEY) {
      sendJson(res, 200, { tracks: [], warning: "YouTube API 키 미설정" });
      return true;
    }

    const origin = requestUrl.searchParams.get("origin") || "all";
    const limit = Number(requestUrl.searchParams.get("limit") || "120");

    try {
      const tracks = await fetchYouTubeCandidates(terms, { origin, limit });
      sendJson(res, 200, { tracks });
    } catch (error) {
      sendJson(res, 200, {
        tracks: [],
        error: "YouTube 후보군 조회 실패",
        detail: error.message || "unknown",
      });
    }

    return true;
  }

  if (pathname === "/api/ai/filter-tracks" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { error: "잘못된 JSON 형식입니다." });
      return true;
    }

    if (!OPENAI_API_KEY) {
      sendJson(res, 200, { scores: [], fallback: true });
      return true;
    }

    const context = payload.context || {};
    const tracks = Array.isArray(payload.tracks) ? payload.tracks : [];

    if (tracks.length === 0) {
      sendJson(res, 200, { scores: [], fallback: true });
      return true;
    }

    try {
      const result = await aiFilterTracks(context, tracks);
      sendJson(res, 200, { ...result, fallback: false });
    } catch (error) {
      console.error("AI filter error:", error.message);
      sendJson(res, 200, { scores: [], fallback: true, error: error.message || "unknown" });
    }
    return true;
  }

  if (pathname === "/api/ai/suggest-terms" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { error: "잘못된 JSON 형식입니다." });
      return true;
    }

    if (!OPENAI_API_KEY) {
      sendJson(res, 200, { searchTerms: [], vibeDescription: "", suggestedArtists: [], fallback: true });
      return true;
    }

    try {
      const result = await generateAiSearchTerms(payload);
      sendJson(res, 200, { ...result, fallback: false });
    } catch (error) {
      sendJson(res, 200, {
        searchTerms: [],
        vibeDescription: "",
        suggestedArtists: [],
        fallback: true,
        error: error.message || "unknown",
      });
    }
    return true;
  }

  if (pathname === "/api/ai/rerank" && req.method === "POST") {
    let payload;
    try {
      payload = await readJsonBody(req);
    } catch (_error) {
      sendJson(res, 400, { error: "잘못된 JSON 형식입니다." });
      return true;
    }

    const context =
      payload && typeof payload.context === "object" ? payload.context : {};
    const tracks = Array.isArray(payload && payload.tracks)
      ? payload.tracks
      : [];
    const requestedLimitRaw = Number(
      payload && payload.limit ? payload.limit : tracks.length || 20,
    );
    const requestedLimit = Math.max(
      1,
      Math.min(
        AI_RERANK_MAX_ITEMS,
        Number.isFinite(requestedLimitRaw) ? requestedLimitRaw : 20,
      ),
    );

    if (tracks.length === 0) {
      sendJson(res, 200, {
        tracks: [],
        provider: "none",
        fallback: true,
        warning: "재정렬할 트랙이 없습니다.",
      });
      return true;
    }

    try {
      const result = await rerankTracks(context, tracks, requestedLimit);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 200, {
        tracks: tracks.slice(0, requestedLimit),
        provider: "none",
        fallback: true,
        error: "AI 재정렬 실패",
        detail: error.message || "unknown",
      });
    }

    return true;
  }

  return false;
}

async function serveStatic(req, res) {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);
  const reqPath =
    requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = path.normalize(reqPath).replace(/^([.][.][/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const ext = path.extname(filePath).toLowerCase();
    const contentType = CONTENT_TYPES[ext] || "application/octet-stream";
    const content = await fs.readFile(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(content);
  } catch (_error) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  }
}

async function requestHandler(req, res) {
  try {
    const handled = await handleApi(req, res);
    if (handled) return;
    await serveStatic(req, res);
  } catch (_error) {
    sendJson(res, 500, { error: "서버 내부 오류" });
  }
}

// 로컬 개발 환경에서만 서버 시작
if (require.main === module) {
  const server = http.createServer(requestHandler);
  server.listen(PORT, async () => {
    await ensureDbFiles();
    console.log(`Audiya server running at http://localhost:${PORT}`);
  });
}

// Vercel 서버리스 함수 export
module.exports = requestHandler;
