const token = localStorage.getItem("authToken");
const authName = localStorage.getItem("authName") || localStorage.getItem("authUsername") || "";

if (!token) { alert("로그인이 필요한 페이지입니다."); window.location.href = "/login.html"; }
if (authName) { const pl = document.getElementById("profileLink"); if (pl) pl.style.display = ""; }

// ── 상태 ─────────────────────────────────────────────
let currentGenre = "all";
let communityPlaylists = [];
let likedIds = new Set();
let modalPlaylist = null;

// ── 장르 상수 ─────────────────────────────────────────
const GENRE_LIST = [
  { value: "kpop", label: "K-POP" }, { value: "jpop", label: "J-POP" },
  { value: "pop", label: "POP" }, { value: "hiphop", label: "힙합" },
  { value: "rnb", label: "R&B" }, { value: "band", label: "밴드" },
  { value: "edm", label: "EDM" }, { value: "indie", label: "인디" },
  { value: "ballad", label: "발라드" },
];
const GENRE_LABEL = Object.fromEntries(GENRE_LIST.map(g => [g.value, g.label]));

function buildGenreChips(container, initial = [], maxSelect = 3) {
  const selected = new Set(initial);
  container.innerHTML = GENRE_LIST.map(g =>
    `<button type="button" class="genre-chip${selected.has(g.value) ? " selected" : ""}" data-value="${g.value}">${g.label}</button>`
  ).join("");
  container.querySelectorAll(".genre-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      if (chip.classList.contains("selected")) {
        chip.classList.remove("selected");
        selected.delete(chip.dataset.value);
      } else {
        if (selected.size >= maxSelect) return;
        chip.classList.add("selected");
        selected.add(chip.dataset.value);
      }
    });
  });
  return { getSelected: () => [...selected] };
}

// ── 공유 모달 (저장 목록 공유) ────────────────────────
let shareModalPl = null;
let shareModalGenrePicker = null;

function closeShareModal() {
  document.getElementById("shareModal").classList.remove("open");
  document.getElementById("shareModalName").style.display = "";
  document.getElementById("shareModalName").previousElementSibling.style.display = "";
  shareModalPl = null; genreEditPl = null;
}
document.getElementById("shareModalClose").addEventListener("click", closeShareModal);
document.getElementById("shareModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeShareModal();
});

function openShareModal(pl) {
  shareModalPl = pl;
  document.getElementById("shareModalTitle").textContent = "공유하기";
  document.getElementById("shareModalName").style.display = "";
  document.getElementById("shareModalName").previousElementSibling.style.display = "";
  document.getElementById("shareModalName").value = pl.name;
  document.getElementById("shareModalConfirm").textContent = "공유하기";
  const chipsEl = document.getElementById("shareModalGenreChips");
  shareModalGenrePicker = buildGenreChips(chipsEl, []);
  document.getElementById("shareModalConfirm").onclick = async () => {
    const name = document.getElementById("shareModalName").value.trim();
    if (!name) return;
    const genres = shareModalGenrePicker?.getSelected() || [];
    const btn = document.getElementById("shareModalConfirm");
    btn.disabled = true; btn.textContent = "공유 중...";
    const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const { ok } = await apiFetch("POST", "/api/playlists", {
      name, owner: authName || "익명", theme: "내 플레이리스트", tracks,
      genres: genres.length > 0 ? genres : extractGenres(tracks),
      cover_image: pl.cover_image || null,
      source_playlist_id: pl.id,
    });
    btn.disabled = false; btn.textContent = "공유하기";
    if (ok) {
      closeShareModal();
      showAlert("savedShareError", "savedShareSuccess", true, `"${name}" 공유 완료!`);
      setTimeout(() => loadCommunity(), 800);
    } else {
      showAlert("savedShareError", "savedShareSuccess", false, "공유 실패");
    }
  };
  document.getElementById("shareModal").classList.add("open");
}

// ── 헬퍼 ─────────────────────────────────────────────
async function apiFetch(method, url, body) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  return { ok: res.ok, status: res.status, data: await res.json() };
}

function showAlert(errorId, successId, ok, msg) {
  document.getElementById(errorId).classList.remove("show");
  document.getElementById(successId).classList.remove("show");
  const el = document.getElementById(ok ? successId : errorId);
  el.textContent = msg; el.classList.add("show");
}

function setBtn(id, loading, label) {
  const b = document.getElementById(id); if (!b) return;
  b.disabled = loading; b.textContent = loading ? "처리 중..." : label;
}

// ── 탭 전환 ──────────────────────────────────────────
document.getElementById("tabPending").addEventListener("click", () => {
  document.getElementById("tabPending").classList.add("active");
  document.getElementById("tabSaved").classList.remove("active");
  document.getElementById("panelPending").style.display = "";
  document.getElementById("panelSaved").style.display = "none";
});

document.getElementById("tabSaved").addEventListener("click", () => {
  document.getElementById("tabSaved").classList.add("active");
  document.getElementById("tabPending").classList.remove("active");
  document.getElementById("panelSaved").style.display = "";
  document.getElementById("panelPending").style.display = "none";
  loadSavedPlaylists();
});

// ── 현재 추천 공유 ────────────────────────────────────
const pending = (() => { try { return JSON.parse(localStorage.getItem("pendingShare") || "null"); } catch (_) { return null; } })();

function renderPendingPanel() {
  const wrap = document.getElementById("pendingContent");
  if (!pending || !pending.tracks || pending.tracks.length === 0) {
    wrap.innerHTML = `<div style="text-align:center;padding:20px;color:#bbb;font-size:13px;">
      공유할 추천 목록이 없습니다.<br>
      <a href="/" style="color:#667eea;font-weight:600;">메인에서 추천 생성</a> 후 다시 오세요.
    </div>`;
    return;
  }
  const preview = pending.tracks.slice(0, 8).map((t, i) => `
    <div class="track-row">
      <span class="t-num">${i + 1}</span>
      ${t.coverUrl ? `<img class="t-cover" src="${t.coverUrl}" alt="" />` : `<div class="t-cover"></div>`}
      <div><div class="t-title">${t.title}</div><div class="t-artist">${t.artist}</div></div>
    </div>`).join("");

  wrap.innerHTML = `
    <div class="track-preview">${preview}</div>
    <form id="shareForm">
      <div class="field">
        <label>플레이리스트 이름</label>
        <input id="shareName" type="text" placeholder="예: 봄날 드라이브" value="${authName ? authName + "의 " + (pending.theme || "추천") + " 플레이리스트" : ""}" />
      </div>
      <div class="field">
        <label>닉네임</label>
        <input id="shareOwner" type="text" placeholder="표시될 닉네임" value="${authName}" />
      </div>
      <div class="genre-picker">
        <label>장르 선택 <span style="color:var(--sub);font-weight:400;">(최대 3개)</span></label>
        <div class="genre-chips" id="pendingGenreChips"></div>
      </div>
      <button type="submit" class="btn-primary" id="shareSubmitBtn" style="margin-top:14px;">커뮤니티에 공유하기 🤝</button>
    </form>`;

  const pendingGenrePicker = buildGenreChips(document.getElementById("pendingGenreChips"), extractGenres(pending.tracks));

  document.getElementById("shareForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("shareName").value.trim();
    const owner = document.getElementById("shareOwner").value.trim() || authName || "익명";
    if (!name) return showAlert("shareError", "shareSuccess", false, "플레이리스트 이름을 입력해주세요");
    setBtn("shareSubmitBtn", true, "공유하기");
    const selected = pendingGenrePicker.getSelected();
    const genres = selected.length > 0 ? selected : extractGenres(pending.tracks);
    const { ok } = await apiFetch("POST", "/api/playlists", {
      name, owner, theme: pending.theme || "추천 플레이리스트",
      tracks: pending.tracks.slice(0, 20), genres,
    });
    if (ok) {
      showAlert("shareError", "shareSuccess", true, "공유 완료! 커뮤니티에 등록되었습니다 🎉");
      localStorage.removeItem("pendingShare");
      document.getElementById("shareForm").reset();
      setTimeout(() => loadCommunity(), 800);
    } else {
      showAlert("shareError", "shareSuccess", false, "공유 중 오류가 발생했습니다");
    }
    setBtn("shareSubmitBtn", false, "커뮤니티에 공유하기 🤝");
  });
}

function extractGenres(tracks) {
  const counts = {};
  (tracks || []).forEach((t) => { if (t.genre) counts[t.genre] = (counts[t.genre] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([g]) => g);
}

// ── 내 저장 플레이리스트 공유 ────────────────────────
async function loadSavedPlaylists() {
  const list = document.getElementById("savedPlList");
  list.innerHTML = '<p style="color:#bbb;font-size:13px;text-align:center;padding:20px;">불러오는 중...</p>';
  const { ok, data } = await apiFetch("GET", "/api/user/playlists");
  if (!ok || !data.playlists || data.playlists.length === 0) {
    list.innerHTML = '<p style="color:#bbb;font-size:13px;text-align:center;padding:20px;">저장된 플레이리스트가 없습니다.<br>메인에서 추천 후 저장해보세요!</p>';
    return;
  }
  list.innerHTML = data.playlists.map((pl) => {
    const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const thumb = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" />` : "🎵";
    return `
      <div class="saved-pl-item">
        <div class="saved-thumb">${thumb}</div>
        <div class="saved-info">
          <div class="saved-name">${pl.name}</div>
          <div class="saved-meta">${tracks.length}곡</div>
        </div>
        <button class="btn-share-small" data-id="${pl.id}">공유</button>
      </div>`;
  }).join("");

  list.querySelectorAll(".btn-share-small").forEach((btn) => {
    btn.addEventListener("click", () => {
      const pl = data.playlists.find((p) => p.id === btn.dataset.id);
      if (pl) openShareModal(pl);
    });
  });
}

// ── 커뮤니티 플레이리스트 로드 ────────────────────────
async function loadCommunity() {
  document.getElementById("communityLoading").style.display = "block";
  document.getElementById("communityGrid").style.display = "none";
  document.getElementById("communityEmpty").style.display = "none";

  const params = new URLSearchParams({ sort: "likes" });
  if (currentGenre !== "all") params.set("genre", currentGenre);

  try {
    const res = await fetch("/api/playlists?" + params.toString());
    const data = await res.json();
    communityPlaylists = data.items || [];
    renderCommunity();
  } catch (_e) {
    document.getElementById("communityLoading").textContent = "불러오기 실패";
  }
}

function renderCommunity() {
  document.getElementById("communityLoading").style.display = "none";
  const grid = document.getElementById("communityGrid");
  const empty = document.getElementById("communityEmpty");

  if (communityPlaylists.length === 0) { empty.style.display = "block"; return; }
  grid.style.display = "grid";

  const myUsername = localStorage.getItem("authUsername") || "";

  grid.innerHTML = communityPlaylists.map((pl) => {
    const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const ci = pl.coverImage;
    let thumbHtml, thumbStyle = "";
    if (ci?.type === "color") {
      thumbStyle = `style="background:${ci.value};"`;
      thumbHtml = "";
    } else if (ci?.type === "album" || ci?.type === "upload") {
      thumbHtml = `<img src="${ci.value}" alt="" loading="lazy" />`;
    } else {
      thumbHtml = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" loading="lazy" />` : "🎵";
    }
    const isLiked = likedIds.has(String(pl.id));
    const isOwner = myUsername && pl.ownerUsername === myUsername;
    const genreTags = (Array.isArray(pl.genres) ? pl.genres : [])
      .filter(g => GENRE_LABEL[g])
      .map(g => `<span class="pl-genre-tag">${GENRE_LABEL[g]}</span>`).join("");
    return `
      <div class="pl-card" data-id="${pl.id}">
        <div class="pl-thumb" ${thumbStyle}>${thumbHtml}</div>
        <div class="pl-body">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-owner">@${pl.owner}${isOwner ? " <span style='color:var(--primary);font-size:10px;'>내 글</span>" : ""}</div>
          <div class="pl-genres">
            ${genreTags || `<span style="color:var(--sub);font-size:10px;">장르 미설정</span>`}
            ${isOwner ? `<button class="btn-edit-genre" data-id="${pl.id}" title="장르 편집">✏️</button>` : ""}
          </div>
          <div class="pl-foot">
            <span class="pl-meta">${tracks.length}곡</span>
            <div style="display:flex;align-items:center;gap:4px;">
              ${isOwner ? `<button class="btn-edit-genre" data-id="${pl.id}" title="편집">✏️</button>` : ""}
              ${isOwner ? `<button class="del-btn" data-id="${pl.id}" title="공유 취소">🗑</button>` : ""}
              <button class="like-btn" data-id="${pl.id}" title="${isLiked ? "좋아요 취소" : "좋아요"}">${isLiked ? "💜" : "🤍"} ${pl.likes || 0}</button>
            </div>
          </div>
        </div>
      </div>`;
  }).join("");

  // 삭제 버튼
  grid.querySelectorAll(".del-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const pl = communityPlaylists.find((p) => String(p.id) === btn.dataset.id);
      if (!pl) return;
      if (!confirm(`"${pl.name}" 공유를 취소하시겠습니까?`)) return;
      const res = await fetch(`/api/playlists/${pl.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        communityPlaylists = communityPlaylists.filter((p) => p.id !== pl.id);
        renderCommunity();
      } else {
        alert("삭제에 실패했습니다");
      }
    });
  });

  // 편집 버튼 (장르 + 표지 통합)
  grid.querySelectorAll(".btn-edit-genre").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const pl = communityPlaylists.find((p) => String(p.id) === btn.dataset.id);
      if (pl) openEditModal(pl, "genre");
    });
  });

  // 카드 클릭 → 트랙 모달
  grid.querySelectorAll(".pl-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".like-btn") || e.target.closest(".del-btn") || e.target.closest(".btn-edit-genre")) return;
      const pl = communityPlaylists.find((p) => String(p.id) === card.dataset.id);
      if (pl) openModal(pl);
    });
  });

  // 좋아요 버튼
  grid.querySelectorAll(".like-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const pl = communityPlaylists.find((p) => String(p.id) === btn.dataset.id);
      if (!pl) return;
      const { ok, data } = await apiFetch("POST", "/api/user/likes", {
        playlistId: pl.id, playlistName: pl.name, playlistData: pl,
      });
      if (ok) {
        if (data.liked) { likedIds.add(String(pl.id)); pl.likes = (pl.likes || 0) + 1; }
        else { likedIds.delete(String(pl.id)); pl.likes = Math.max(0, (pl.likes || 0) - 1); }
        btn.textContent = `${data.liked ? "💜" : "🤍"} ${pl.likes}`;
        btn.title = data.liked ? "좋아요 취소" : "좋아요";
        if (modalPlaylist?.id === pl.id) updateModalLikeBtn();
      }
    });
  });
}

// ── 모달 ─────────────────────────────────────────────
function openModal(pl) {
  modalPlaylist = pl;
  document.getElementById("modalTitle").textContent = pl.name;
  const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
  document.getElementById("modalTracks").innerHTML = tracks.length === 0
    ? '<p style="color:#bbb;text-align:center;padding:20px;">곡 정보가 없습니다</p>'
    : tracks.map((t, i) => `
      <div class="modal-track">
        <span class="modal-num">${i + 1}</span>
        ${t.coverUrl ? `<img class="modal-cover" src="${t.coverUrl}" alt="" />` : `<div class="modal-cover"></div>`}
        <div class="modal-info">
          <div class="mt">${t.title}</div>
          <div class="ma">${t.artist}</div>
        </div>
      </div>`).join("");
  updateModalLikeBtn();
  document.getElementById("trackModal").classList.add("open");
}

function updateModalLikeBtn() {
  const btn = document.getElementById("modalLikeBtn");
  if (!modalPlaylist) return;
  const isLiked = likedIds.has(String(modalPlaylist.id));
  btn.textContent = isLiked ? "💜 좋아요 취소" : "🤍 좋아요";
  btn.style.background = isLiked ? "#764ba2" : "#f8f0ff";
  btn.style.color = isLiked ? "#fff" : "#764ba2";
}

document.getElementById("modalClose").addEventListener("click", () => {
  document.getElementById("trackModal").classList.remove("open");
  modalPlaylist = null;
});
document.getElementById("trackModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) { e.currentTarget.classList.remove("open"); modalPlaylist = null; }
});
document.getElementById("modalLikeBtn").addEventListener("click", async () => {
  if (!modalPlaylist) return;
  const { ok, data } = await apiFetch("POST", "/api/user/likes", {
    playlistId: modalPlaylist.id, playlistName: modalPlaylist.name, playlistData: modalPlaylist,
  });
  if (ok) {
    if (data.liked) { likedIds.add(String(modalPlaylist.id)); modalPlaylist.likes = (modalPlaylist.likes || 0) + 1; }
    else { likedIds.delete(String(modalPlaylist.id)); modalPlaylist.likes = Math.max(0, (modalPlaylist.likes || 0) - 1); }
    updateModalLikeBtn();
    renderCommunity();
  }
});

// ── 통합 편집 모달 (장르 + 표지) ─────────────────────
const CM_PALETTES = [
  { label: "바이올렛", value: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
  { label: "선셋",     value: "linear-gradient(135deg,#f97316,#ec4899)" },
  { label: "오션",     value: "linear-gradient(135deg,#0ea5e9,#6366f1)" },
  { label: "포레스트", value: "linear-gradient(135deg,#22c55e,#0ea5e9)" },
  { label: "미드나잇", value: "linear-gradient(135deg,#1e1b4b,#312e81)" },
  { label: "로즈",     value: "linear-gradient(135deg,#f43f5e,#ec4899)" },
  { label: "골드",     value: "linear-gradient(135deg,#f59e0b,#f97316)" },
  { label: "모노",     value: "linear-gradient(135deg,#374151,#6b7280)" },
];

let editModalPl = null;
let editGenrePicker = null;
let cmSelectedCover = null;

function closeEditModal() {
  document.getElementById("editModal").classList.remove("open");
  editModalPl = null; cmSelectedCover = null;
}

function activateEditTab(tab) {
  document.querySelectorAll("[data-etab]").forEach(t => t.classList.toggle("active", t.dataset.etab === tab));
  document.getElementById("etabGenre").style.display = tab === "genre" ? "" : "none";
  document.getElementById("etabCover").style.display = tab === "cover" ? "flex" : "none";
}

function cmActivateTab(name) {
  document.querySelectorAll("[data-ctab]").forEach(t => t.classList.toggle("active", t.dataset.ctab === name));
  ["album","color","upload"].forEach(n => {
    const el = document.getElementById("cmTab" + n.charAt(0).toUpperCase() + n.slice(1));
    if (el) el.style.display = n === name ? "" : "none";
  });
  if (name !== "upload") cmSelectedCover = null;
}

function openEditModal(pl, initialTab = "genre") {
  editModalPl = pl;
  cmSelectedCover = null;

  // 장르 탭 초기화
  editGenrePicker = buildGenreChips(document.getElementById("editGenreChips"), Array.isArray(pl.genres) ? pl.genres : []);

  // 커버 앨범 탭
  const albumEl = document.getElementById("cmTabAlbum");
  const tracks = (pl.tracks || []).filter(t => t.coverUrl);
  const seen = new Set();
  const unique = tracks.filter(t => { if (seen.has(t.coverUrl)) return false; seen.add(t.coverUrl); return true; });
  albumEl.innerHTML = unique.length === 0
    ? '<p style="color:var(--sub);font-size:13px;text-align:center;padding:20px 0;">앨범 표지가 없습니다.</p>'
    : `<div class="cover-album-grid">${unique.map(t =>
        `<div class="cover-album-item" data-url="${t.coverUrl}"><img src="${t.coverUrl}" alt="" loading="lazy" /></div>`
      ).join("")}</div>`;
  albumEl.querySelectorAll(".cover-album-item").forEach(item => {
    item.addEventListener("click", () => {
      albumEl.querySelectorAll(".cover-album-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      cmSelectedCover = { type: "album", value: item.dataset.url };
    });
  });

  // 커버 팔레트 탭
  const colorEl = document.getElementById("cmTabColor");
  colorEl.innerHTML = `<div class="cover-palette-grid">${CM_PALETTES.map(p =>
    `<div class="cover-palette-item" data-gradient="${p.value}" title="${p.label}" style="background:${p.value};"></div>`
  ).join("")}</div>`;
  colorEl.querySelectorAll(".cover-palette-item").forEach(item => {
    item.addEventListener("click", () => {
      colorEl.querySelectorAll(".cover-palette-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      cmSelectedCover = { type: "color", value: item.dataset.gradient };
    });
  });

  // 업로드 탭 리셋
  document.getElementById("cmUploadZone").textContent = "📁 클릭해서 이미지 선택";
  document.getElementById("cmUploadPreview").style.display = "none";
  document.getElementById("cmUploadPreview").src = "";
  cmActivateTab("album");

  activateEditTab(initialTab);
  document.getElementById("editModal").classList.add("open");
}

// 메인 탭 전환
document.querySelectorAll("[data-etab]").forEach(tab => {
  tab.addEventListener("click", () => activateEditTab(tab.dataset.etab));
});

// 커버 서브탭 전환
document.querySelectorAll("[data-ctab]").forEach(tab => {
  tab.addEventListener("click", () => cmActivateTab(tab.dataset.ctab));
});

// 업로드
document.getElementById("cmUploadZone").addEventListener("click", () => {
  document.getElementById("cmFileInput").click();
});
document.getElementById("cmFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImageCm(file, 400);
    cmSelectedCover = { type: "upload", value: dataUrl };
    const preview = document.getElementById("cmUploadPreview");
    preview.src = dataUrl; preview.style.display = "block";
    document.getElementById("cmUploadZone").textContent = "✅ " + file.name;
  } catch (_e) { alert("이미지 처리 중 오류가 발생했습니다."); }
  e.target.value = "";
});

function resizeImageCm(file, maxPx) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// 장르 저장
document.getElementById("editGenreSaveBtn").addEventListener("click", async () => {
  if (!editModalPl) return;
  const genres = editGenrePicker?.getSelected() || [];
  const btn = document.getElementById("editGenreSaveBtn");
  btn.disabled = true; btn.textContent = "저장 중...";
  const { ok, data } = await apiFetch("PUT", `/api/playlists/${editModalPl.id}/genres`, { genres });
  btn.disabled = false; btn.textContent = "저장";
  if (ok) {
    editModalPl.genres = data.genres || genres;
    const idx = communityPlaylists.findIndex(p => String(p.id) === String(editModalPl.id));
    if (idx !== -1) communityPlaylists[idx].genres = editModalPl.genres;
    closeEditModal();
    renderCommunity();
  } else { alert("장르 저장에 실패했습니다."); }
});

// 표지 적용
document.getElementById("cmApplyBtn").addEventListener("click", async () => {
  if (!cmSelectedCover) { alert("표지를 선택해주세요."); return; }
  const btn = document.getElementById("cmApplyBtn");
  btn.disabled = true; btn.textContent = "저장 중...";
  const { ok } = await apiFetch("PUT", `/api/playlists/${editModalPl.id}/cover`, { cover_image: cmSelectedCover });
  btn.disabled = false; btn.textContent = "적용하기";
  if (ok) {
    editModalPl.coverImage = cmSelectedCover;
    const idx = communityPlaylists.findIndex(p => String(p.id) === String(editModalPl.id));
    if (idx !== -1) communityPlaylists[idx].coverImage = cmSelectedCover;
    closeEditModal();
    renderCommunity();
  } else { alert("표지 변경에 실패했습니다."); }
});

document.getElementById("editModalClose").addEventListener("click", closeEditModal);
document.getElementById("editModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeEditModal();
});

// ── 장르 필터 ─────────────────────────────────────────
document.querySelectorAll(".genre-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".genre-btn").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentGenre = btn.dataset.genre;
    loadCommunity();
  });
});

// ── 좋아요한 ID 로드 ─────────────────────────────────
async function loadLikedIds() {
  const { ok, data } = await apiFetch("GET", "/api/user/liked-ids");
  if (ok) likedIds = new Set((data.ids || []).map(String));
}

// ── 초기화 ────────────────────────────────────────────
(async () => {
  await loadLikedIds();
  renderPendingPanel();
  loadCommunity();
})();
