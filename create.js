const token = localStorage.getItem("authToken");
if (!token) { window.location.href = "/login.html"; }

let builtTracks = [];
let selectedCover = null;
let selectedGenres = new Set();
let dragSrcIndex = null;
let pendingCover = null;
let uploadedDataUrl = null;

const PALETTES = [
  { label: "바이올렛", value: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
  { label: "선셋",     value: "linear-gradient(135deg,#f97316,#ec4899)" },
  { label: "오션",     value: "linear-gradient(135deg,#0ea5e9,#6366f1)" },
  { label: "포레스트", value: "linear-gradient(135deg,#22c55e,#0ea5e9)" },
  { label: "미드나잇", value: "linear-gradient(135deg,#1e1b4b,#312e81)" },
  { label: "로즈",     value: "linear-gradient(135deg,#f43f5e,#ec4899)" },
  { label: "골드",     value: "linear-gradient(135deg,#f59e0b,#f97316)" },
  { label: "모노",     value: "linear-gradient(135deg,#374151,#6b7280)" },
];

const GENRE_LIST = [
  {value:"kpop",label:"K-POP"},{value:"jpop",label:"J-POP"},{value:"pop",label:"POP"},
  {value:"hiphop",label:"힙합"},{value:"rnb",label:"R&B"},{value:"band",label:"밴드"},
  {value:"edm",label:"EDM"},{value:"indie",label:"인디"},{value:"ballad",label:"발라드"}
];

// ── DOM refs ──────────────────────────────────────────
const plSelect     = document.getElementById("plSelect");
const plTrackList  = document.getElementById("plTrackList");
const searchInput  = document.getElementById("searchInput");
const searchBtn    = document.getElementById("searchBtn");
const searchResults= document.getElementById("searchResults");
const dropZone     = document.getElementById("dropZone");
const dropPlaceholder = document.getElementById("dropPlaceholder");
const buildList    = document.getElementById("buildList");
const trackCountBadge = document.getElementById("trackCountBadge");
const plNameInput  = document.getElementById("plNameInput");
const genreChips   = document.getElementById("genreChips");
const coverPreview = document.getElementById("coverPreview");
const pickCoverBtn = document.getElementById("pickCoverBtn");
const saveBtn      = document.getElementById("saveBtn");
const coverModal   = document.getElementById("coverModal");
const modalClose   = document.getElementById("modalClose");
const applyBtn     = document.getElementById("applyBtn");
const albumGrid    = document.getElementById("albumGrid");
const paletteGrid  = document.getElementById("paletteGrid");
const uploadZone   = document.getElementById("uploadZone");
const uploadInput  = document.getElementById("uploadInput");
const uploadPreview= document.getElementById("uploadPreview");
const toast        = document.getElementById("toast");

// ── Toast ─────────────────────────────────────────────
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 3000);
}

// ── Genre chips ───────────────────────────────────────
function initGenreChips() {
  GENRE_LIST.forEach(g => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "genre-chip";
    btn.textContent = g.label;
    btn.dataset.value = g.value;
    btn.addEventListener("click", () => {
      if (selectedGenres.has(g.value)) {
        selectedGenres.delete(g.value);
        btn.classList.remove("active");
      } else {
        if (selectedGenres.size >= 3) { showToast("장르는 최대 3개까지 선택할 수 있어요"); return; }
        selectedGenres.add(g.value);
        btn.classList.add("active");
      }
    });
    genreChips.appendChild(btn);
  });
}

// ── Cover preview update ──────────────────────────────
function updateCoverPreview() {
  coverPreview.innerHTML = "";
  if (!selectedCover) {
    coverPreview.textContent = "🎵";
    return;
  }
  if (selectedCover.type === "album") {
    const img = document.createElement("img");
    img.src = selectedCover.value;
    img.alt = "";
    coverPreview.appendChild(img);
  } else if (selectedCover.type === "color") {
    coverPreview.style.background = selectedCover.value;
  } else if (selectedCover.type === "upload") {
    const img = document.createElement("img");
    img.src = selectedCover.value;
    img.alt = "";
    coverPreview.appendChild(img);
  }
}

// ── Render built list ─────────────────────────────────
function renderBuiltList() {
  buildList.innerHTML = "";
  dropPlaceholder.style.display = builtTracks.length === 0 ? "flex" : "none";
  trackCountBadge.textContent = builtTracks.length + "곡";

  builtTracks.forEach((track, idx) => {
    const row = document.createElement("div");
    row.className = "built-track";
    row.draggable = true;
    row.dataset.index = idx;

    row.innerHTML = `
      <span class="drag-handle">☰</span>
      <img class="track-cover" src="${track.coverUrl || ""}" alt="" onerror="this.style.visibility='hidden'" />
      <div class="track-info">
        <div class="track-title">${escHtml(track.title)}</div>
        <div class="track-artist">${escHtml(track.artist)}</div>
      </div>
      <button class="remove-btn" type="button" title="제거">✕</button>
    `;

    row.querySelector(".remove-btn").addEventListener("click", () => {
      builtTracks.splice(idx, 1);
      renderBuiltList();
    });

    row.addEventListener("dragstart", e => {
      dragSrcIndex = idx;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("reorder", "1");
      setTimeout(() => row.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll(".built-track").forEach(r => {
        r.classList.remove("drag-over-top", "drag-over-bottom");
      });
    });
    row.addEventListener("dragover", e => {
      e.preventDefault();
      e.stopPropagation();
      if (dragSrcIndex === null) return;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      row.classList.remove("drag-over-top", "drag-over-bottom");
      row.classList.add(e.clientY < mid ? "drag-over-top" : "drag-over-bottom");
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", e => {
      e.preventDefault();
      e.stopPropagation();
      if (dragSrcIndex === null || !e.dataTransfer.getData("reorder")) return;
      const rect = row.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      let targetIdx = parseInt(row.dataset.index);
      if (e.clientY >= mid) targetIdx++;
      if (targetIdx > dragSrcIndex) targetIdx--;
      if (dragSrcIndex === targetIdx) { dragSrcIndex = null; renderBuiltList(); return; }
      const [moved] = builtTracks.splice(dragSrcIndex, 1);
      builtTracks.splice(targetIdx, 0, moved);
      dragSrcIndex = null;
      renderBuiltList();
    });

    buildList.appendChild(row);
  });

  if (document.getElementById("tabAlbum").classList.contains("active")) {
    renderAlbumTab();
  }
}

// ── Drop zone (receive new tracks) ───────────────────
dropZone.addEventListener("dragover", e => {
  if (e.dataTransfer.getData && !e.dataTransfer.types.includes("reorder")) {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  } else {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  }
});
dropZone.addEventListener("dragleave", e => {
  if (!dropZone.contains(e.relatedTarget)) {
    dropZone.classList.remove("drag-over");
  }
});
dropZone.addEventListener("drop", e => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  const reorder = e.dataTransfer.getData("reorder");
  if (reorder) return;
  const raw = e.dataTransfer.getData("track");
  if (!raw) return;
  try {
    const track = JSON.parse(raw);
    if (builtTracks.some(t => t.title === track.title && t.artist === track.artist)) {
      showToast("이미 추가된 곡입니다");
      return;
    }
    builtTracks.push(track);
    renderBuiltList();
  } catch {}
});

// ── Source track row ──────────────────────────────────
function escHtml(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}

function renderSourceTrack(track, container) {
  const row = document.createElement("div");
  row.className = "track-row";
  row.draggable = true;
  row.dataset.track = JSON.stringify(track);

  row.innerHTML = `
    <img class="track-cover" src="${track.coverUrl || ""}" alt="" onerror="this.style.visibility='hidden'" />
    <div class="track-info">
      <div class="track-title">${escHtml(track.title)}</div>
      <div class="track-artist">${escHtml(track.artist)}</div>
    </div>
  `;

  row.addEventListener("dragstart", e => {
    e.dataTransfer.setData("track", JSON.stringify(track));
    e.dataTransfer.effectAllowed = "copy";
    setTimeout(() => row.classList.add("dragging"), 0);
  });
  row.addEventListener("dragend", () => row.classList.remove("dragging"));

  row.addEventListener("click", () => {
    if (builtTracks.some(t => t.title === track.title && t.artist === track.artist)) {
      showToast("이미 추가된 곡입니다");
      return;
    }
    builtTracks.push(track);
    renderBuiltList();
    showToast(`"${track.title}" 추가됨`);
  });

  container.appendChild(row);
}

// ── Load saved playlists ──────────────────────────────
async function loadSavedPlaylists() {
  try {
    const res = await fetch("/api/user/playlists", {
      headers: { Authorization: "Bearer " + token }
    });
    if (!res.ok) return;
    const data = await res.json();
    const playlists = data.playlists || data || [];
    playlists.forEach(pl => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify(pl.tracks || []);
      opt.textContent = pl.name || "이름 없음";
      plSelect.appendChild(opt);
    });
  } catch {}
}

plSelect.addEventListener("change", () => {
  if (!plSelect.value) {
    plTrackList.innerHTML = "<p class='state-msg'>플레이리스트를 선택하세요</p>";
    return;
  }
  const tracks = JSON.parse(plSelect.value);
  plTrackList.innerHTML = "";
  if (!tracks.length) {
    plTrackList.innerHTML = "<p class='state-msg'>곡이 없습니다</p>";
    return;
  }
  tracks.forEach(t => renderSourceTrack(t, plTrackList));
});

// ── Search ────────────────────────────────────────────
async function searchTracks() {
  const q = searchInput.value.trim();
  if (!q) return;
  searchBtn.disabled = true;
  searchResults.innerHTML = "<p class='state-msg'>검색 중...</p>";
  try {
    const res = await fetch("/api/search?q=" + encodeURIComponent(q), {
      headers: { Authorization: "Bearer " + token }
    });
    const data = await res.json();
    if (!res.ok) {
      searchResults.innerHTML = `<p class='state-msg'>${escHtml(data.error || "검색 실패")}</p>`;
      return;
    }
    const tracks = data.tracks || [];
    searchResults.innerHTML = "";
    if (!tracks.length) {
      searchResults.innerHTML = "<p class='state-msg'>결과가 없습니다</p>";
      return;
    }
    tracks.forEach(t => renderSourceTrack(t, searchResults));
  } catch (e) {
    searchResults.innerHTML = `<p class='state-msg'>검색 중 오류: ${escHtml(e.message)}</p>`;
  } finally {
    searchBtn.disabled = false;
  }
}

searchBtn.addEventListener("click", searchTracks);
searchInput.addEventListener("keydown", e => { if (e.key === "Enter") searchTracks(); });

// ── Cover modal ───────────────────────────────────────
function openCoverModal() {
  pendingCover = selectedCover ? { ...selectedCover } : null;
  uploadedDataUrl = null;
  renderAlbumTab();
  renderPaletteTab();
  syncModalSelections();
  coverModal.classList.add("open");
}

function closeModal() {
  coverModal.classList.remove("open");
  uploadPreview.style.display = "none";
  uploadPreview.src = "";
}

pickCoverBtn.addEventListener("click", openCoverModal);
modalClose.addEventListener("click", closeModal);
coverModal.addEventListener("click", e => { if (e.target === coverModal) closeModal(); });

document.querySelectorAll(".cover-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".cover-tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".cover-tab-pane").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById("tab" + capitalize(tab.dataset.tab)).classList.add("active");
    if (tab.dataset.tab === "album") renderAlbumTab();
  });
});

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

function renderAlbumTab() {
  albumGrid.innerHTML = "";
  const urls = [...new Set(builtTracks.map(t => t.coverUrl).filter(Boolean))];
  if (!urls.length) {
    albumGrid.innerHTML = "<p class='empty-album'>플레이리스트에 곡을 추가하면<br>앨범 표지를 선택할 수 있어요</p>";
    return;
  }
  urls.forEach(url => {
    const item = document.createElement("div");
    item.className = "cover-album-item";
    if (pendingCover && pendingCover.type === "album" && pendingCover.value === url) {
      item.classList.add("selected");
    }
    const img = document.createElement("img");
    img.src = url;
    img.alt = "";
    item.appendChild(img);
    item.addEventListener("click", () => {
      albumGrid.querySelectorAll(".cover-album-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      pendingCover = { type: "album", value: url };
    });
    albumGrid.appendChild(item);
  });
}

function renderPaletteTab() {
  paletteGrid.innerHTML = "";
  PALETTES.forEach(p => {
    const item = document.createElement("div");
    item.className = "cover-palette-item";
    item.style.background = p.value;
    if (pendingCover && pendingCover.type === "color" && pendingCover.value === p.value) {
      item.classList.add("selected");
    }
    const lbl = document.createElement("span");
    lbl.className = "cover-palette-label";
    lbl.textContent = p.label;
    item.appendChild(lbl);
    item.addEventListener("click", () => {
      paletteGrid.querySelectorAll(".cover-palette-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      pendingCover = { type: "color", value: p.value };
    });
    paletteGrid.appendChild(item);
  });
}

function syncModalSelections() {
  if (!pendingCover) return;
  if (pendingCover.type === "album") {
    albumGrid.querySelectorAll(".cover-album-item").forEach(item => {
      item.classList.toggle("selected", item.querySelector("img")?.src === pendingCover.value);
    });
  } else if (pendingCover.type === "color") {
    paletteGrid.querySelectorAll(".cover-palette-item").forEach((item, i) => {
      item.classList.toggle("selected", PALETTES[i]?.value === pendingCover.value);
    });
  }
}

// Upload
uploadZone.addEventListener("click", () => uploadInput.click());
uploadZone.addEventListener("dragover", e => { e.preventDefault(); uploadZone.style.borderColor = "var(--primary)"; });
uploadZone.addEventListener("dragleave", () => { uploadZone.style.borderColor = ""; });
uploadZone.addEventListener("drop", e => {
  e.preventDefault();
  uploadZone.style.borderColor = "";
  const file = e.dataTransfer.files[0];
  if (file) processUpload(file);
});
uploadInput.addEventListener("change", () => {
  const file = uploadInput.files[0];
  if (file) processUpload(file);
});

function processUpload(file) {
  if (file.size > 5 * 1024 * 1024) { showToast("파일 크기는 5MB 이하여야 합니다"); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    const dataUrl = ev.target.result;
    resizeImage(dataUrl, 400, result => {
      uploadedDataUrl = result;
      pendingCover = { type: "upload", value: result };
      uploadPreview.src = result;
      uploadPreview.style.display = "block";
    });
  };
  reader.readAsDataURL(file);
}

function resizeImage(dataUrl, maxSize, cb) {
  const img = new Image();
  img.onload = () => {
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d").drawImage(img, 0, 0, w, h);
    cb(canvas.toDataURL("image/jpeg", 0.88));
  };
  img.src = dataUrl;
}

applyBtn.addEventListener("click", () => {
  if (!pendingCover) { showToast("표지를 선택해 주세요"); return; }
  selectedCover = { ...pendingCover };
  updateCoverPreview();
  closeModal();
  showToast("표지가 적용되었습니다");
});

// ── Save ──────────────────────────────────────────────
saveBtn.addEventListener("click", async () => {
  const name = plNameInput.value.trim();
  if (!name) { showToast("플레이리스트 이름을 입력해 주세요"); plNameInput.focus(); return; }
  if (!builtTracks.length) { showToast("곡을 1개 이상 추가해 주세요"); return; }
  if (selectedGenres.size === 0) { showToast("장르를 1개 이상 선택해 주세요"); return; }

  saveBtn.disabled = true;
  saveBtn.textContent = "저장 중...";
  try {
    const res = await fetch("/api/user/playlists", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token
      },
      body: JSON.stringify({
        name,
        tracks: builtTracks,
        preferences: {
          genres: [...selectedGenres],
          cover_image: selectedCover
        }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      showToast(err.error || "저장에 실패했습니다");
      return;
    }
    showToast("플레이리스트가 저장되었습니다!");
    builtTracks = [];
    selectedCover = null;
    selectedGenres.clear();
    plNameInput.value = "";
    document.querySelectorAll(".genre-chip").forEach(c => c.classList.remove("active"));
    coverPreview.textContent = "🎵";
    coverPreview.style.background = "";
    renderBuiltList();
  } catch {
    showToast("저장 중 오류가 발생했습니다");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "저장하기";
  }
});

// ── Init ──────────────────────────────────────────────
initGenreChips();
renderBuiltList();
loadSavedPlaylists();
