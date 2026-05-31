const token = localStorage.getItem("authToken");
const authName = localStorage.getItem("authName") || localStorage.getItem("authUsername") || "";

if (!token) { alert("로그인이 필요한 페이지입니다."); window.location.href = "/login.html"; }
if (authName) { const pl = document.getElementById("profileLink"); if (pl) pl.style.display = ""; }

// ── 상태 ─────────────────────────────────────────────
let currentGenre = "all";
let communityPlaylists = [];
let likedIds = new Set();
let modalPlaylist = null;

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
      <button type="submit" class="btn-primary" id="shareSubmitBtn">커뮤니티에 공유하기 🤝</button>
    </form>`;

  document.getElementById("shareForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("shareName").value.trim();
    const owner = document.getElementById("shareOwner").value.trim() || authName || "익명";
    if (!name) return showAlert("shareError", "shareSuccess", false, "플레이리스트 이름을 입력해주세요");
    setBtn("shareSubmitBtn", true, "공유하기");
    const genres = extractGenres(pending.tracks);
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
    btn.addEventListener("click", async () => {
      const pl = data.playlists.find((p) => p.id === btn.dataset.id);
      if (!pl) return;
      const name = prompt("공유할 이름을 입력하세요:", pl.name);
      if (!name) return;
      btn.disabled = true; btn.textContent = "...";
      const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
      const genres = extractGenres(tracks);
      const { ok } = await apiFetch("POST", "/api/playlists", {
        name: name.trim() || pl.name, owner: authName || "익명",
        theme: "내 플레이리스트", tracks, genres,
      });
      if (ok) {
        showAlert("savedShareError", "savedShareSuccess", true, `"${name}" 공유 완료!`);
        setTimeout(() => loadCommunity(), 800);
      } else {
        showAlert("savedShareError", "savedShareSuccess", false, "공유 실패");
      }
      btn.disabled = false; btn.textContent = "공유";
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
    const thumb = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" loading="lazy" />` : "🎵";
    const isLiked = likedIds.has(String(pl.id));
    const isOwner = myUsername && pl.ownerUsername === myUsername;
    return `
      <div class="pl-card" data-id="${pl.id}">
        <div class="pl-thumb">${thumb}</div>
        <div class="pl-body">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-owner">@${pl.owner}${isOwner ? " <span style='color:var(--primary);font-size:10px;'>내 글</span>" : ""}</div>
          <div class="pl-foot">
            <span class="pl-meta">${tracks.length}곡</span>
            <div style="display:flex;align-items:center;gap:4px;">
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

  // 카드 클릭 → 모달
  grid.querySelectorAll(".pl-card").forEach((card) => {
    card.addEventListener("click", (e) => {
      if (e.target.closest(".like-btn")) return;
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
