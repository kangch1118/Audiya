const token = localStorage.getItem("authToken");
if (!token) { window.location.href = "/login.html"; }

// ── 로그아웃 ─────────────────────────────────────────
document.getElementById("logoutBtn").addEventListener("click", () => {
  ["authToken", "authUsername", "authName"].forEach((k) => localStorage.removeItem(k));
  window.location.href = "/";
});

// ── 탭 전환 ──────────────────────────────────────────
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(btn.dataset.panel).classList.add("active");
  });
});

// ── 헬퍼 ─────────────────────────────────────────────
async function api(method, url, body) {
  const opts = { method, headers: { Authorization: `Bearer ${token}` } };
  if (body) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  const res = await fetch(url, opts);
  return { ok: res.ok, data: await res.json() };
}

function showMsg(errorId, successId, ok, msg) {
  const err = document.getElementById(errorId);
  const suc = document.getElementById(successId);
  err.classList.remove("show"); suc.classList.remove("show");
  if (ok) { suc.textContent = msg; suc.classList.add("show"); }
  else { err.textContent = msg; err.classList.add("show"); }
}

function setBtn(id, loading, label) {
  const btn = document.getElementById(id);
  btn.disabled = loading;
  btn.textContent = loading ? "처리 중..." : label;
}

function validatePassword(p) {
  if (!p || p.length < 8) return "8자 이상이어야 합니다";
  if (!/[a-zA-Z]/.test(p)) return "영문자를 포함해야 합니다";
  if (!/[0-9]/.test(p)) return "숫자를 포함해야 합니다";
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(p)) return "특수문자를 포함해야 합니다";
  return null;
}

// ── 프로필 로드 ──────────────────────────────────────
async function loadProfile() {
  const { ok, data } = await api("GET", "/api/user/profile");
  if (!ok) { window.location.href = "/login.html"; return; }

  const { username, name, phone, avatar_url } = data.user;
  const initial = (name || username || "U").charAt(0).toUpperCase();

  setAvatarDisplay(avatar_url, initial);
  document.getElementById("heroName").textContent = name || username;
  document.getElementById("heroId").textContent = "@" + username;
  document.getElementById("infoUsername").textContent = username;
  document.getElementById("infoPhone").textContent = phone || "—";
  document.getElementById("editName").value = name || "";
}

function setAvatarDisplay(avatarUrl, initial) {
  const heroEl = document.getElementById("heroAvatar");
  if (avatarUrl) {
    heroEl.innerHTML = `<img src="${avatarUrl}" alt="프로필 사진" />`;
  } else {
    heroEl.textContent = initial;
  }

  const wrap = document.getElementById("photoPreviewWrap");
  if (wrap) {
    wrap.innerHTML = avatarUrl
      ? `<img class="avatar-preview" src="${avatarUrl}" alt="프로필 사진" />`
      : `<div class="avatar-preview-fallback">${initial}</div>`;
  }

  const navSm = document.getElementById("navAvatarSm");
  if (navSm) {
    navSm.innerHTML = avatarUrl
      ? `<img src="${avatarUrl}" alt="프로필" />`
      : initial;
  }
}

// ── 프로필 사진 변경 ─────────────────────────────────
document.getElementById("photoChangeBtn").addEventListener("click", () => {
  document.getElementById("avatarInput").click();
});

document.getElementById("avatarInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return;

  const btn = document.getElementById("photoChangeBtn");
  btn.disabled = true;
  btn.textContent = "업로드 중...";

  try {
    const dataUrl = await resizeImage(file, 200);
    const { ok, data } = await api("PUT", "/api/user/avatar", { avatar_url: dataUrl });
    if (ok) {
      const initial = (document.getElementById("heroName").textContent || "U").charAt(0).toUpperCase();
      setAvatarDisplay(dataUrl, initial);
      localStorage.setItem("authAvatarUrl", dataUrl);
      showMsg("photoError", "photoSuccess", true, "프로필 사진이 변경되었습니다");
    } else {
      showMsg("photoError", "photoSuccess", false, data?.message || "사진 변경에 실패했습니다");
    }
  } catch (_e) {
    showMsg("photoError", "photoSuccess", false, "이미지 처리 중 오류가 발생했습니다");
  }

  btn.disabled = false;
  btn.textContent = "📷 사진 변경";
  e.target.value = "";
});

function resizeImage(file, maxPx) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (ev) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── 이름 변경 ────────────────────────────────────────
document.getElementById("nameForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const name = document.getElementById("editName").value.trim();
  if (!name) return showMsg("nameError", "nameSuccess", false, "이름을 입력해주세요");

  setBtn("nameSaveBtn", true, "저장");
  const { ok, data } = await api("PUT", "/api/user/profile", { name });
  showMsg("nameError", "nameSuccess", ok, ok ? "이름이 변경되었습니다" : data.message);
  if (ok) {
    localStorage.setItem("authName", name);
    document.getElementById("heroName").textContent = name;
    const avatarEl = document.getElementById("heroAvatar");
    if (!avatarEl.querySelector("img")) {
      avatarEl.textContent = name.charAt(0).toUpperCase();
    }
  }
  setBtn("nameSaveBtn", false, "저장");
});

// ── 비밀번호 변경 ────────────────────────────────────
document.getElementById("pwForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const currentPw = document.getElementById("currentPw").value.trim();
  const newPw = document.getElementById("newPw").value.trim();
  const confirm = document.getElementById("newPwConfirm").value.trim();

  const err = validatePassword(newPw);
  if (err) return showMsg("pwError", "pwSuccess", false, "새 비밀번호: " + err);
  if (newPw !== confirm) return showMsg("pwError", "pwSuccess", false, "비밀번호가 일치하지 않습니다");

  setBtn("pwSaveBtn", true, "비밀번호 변경");
  const { ok, data } = await api("PUT", "/api/user/password", { currentPassword: currentPw, newPassword: newPw });
  showMsg("pwError", "pwSuccess", ok, ok ? "비밀번호가 변경되었습니다" : data.message);
  if (ok) document.getElementById("pwForm").reset();
  setBtn("pwSaveBtn", false, "비밀번호 변경");
});

// ── 모달 ─────────────────────────────────────────────
let modalTarget = null; // { type: "playlist"|"like", id, name, tracks }

const PALETTES = [
  { label: "바이올렛", value: "linear-gradient(135deg,#6366f1,#8b5cf6)" },
  { label: "선셋", value: "linear-gradient(135deg,#f97316,#ec4899)" },
  { label: "오션", value: "linear-gradient(135deg,#0ea5e9,#6366f1)" },
  { label: "포레스트", value: "linear-gradient(135deg,#22c55e,#0ea5e9)" },
  { label: "미드나잇", value: "linear-gradient(135deg,#1e1b4b,#312e81)" },
  { label: "로즈", value: "linear-gradient(135deg,#f43f5e,#ec4899)" },
  { label: "골드", value: "linear-gradient(135deg,#f59e0b,#f97316)" },
  { label: "모노", value: "linear-gradient(135deg,#374151,#6b7280)" },
];

let selectedCover = null; // { type: "album"|"color"|"upload", value: "..." }
let activeUploadDataUrl = null;

function showTrackPanel() {
  document.getElementById("modalTracks").style.display = "";
  document.getElementById("modalFoot").style.display = "";
  document.getElementById("coverPanel").classList.remove("active");
  document.getElementById("coverBackBtn").style.display = "none";
  document.getElementById("modalTitle").textContent = modalTarget?.name || "";
  document.getElementById("btnEditName").style.display = modalTarget?.type === "playlist" ? "" : "none";
}

function showCoverPanel() {
  document.getElementById("modalTracks").style.display = "none";
  document.getElementById("modalFoot").style.display = "none";
  document.getElementById("coverPanel").classList.add("active");
  document.getElementById("coverBackBtn").style.display = "";
  document.getElementById("modalTitleWrap").style.display = "";
  document.getElementById("modalNameEdit").classList.remove("active");
  document.getElementById("btnEditName").style.display = "none";
  document.getElementById("modalTitle").textContent = "표지 변경";
  selectedCover = null;
  activeUploadDataUrl = null;
  buildAlbumTab();
  buildColorTab();
  resetUploadTab();
  activateCoverTab("album");
}

function buildAlbumTab() {
  const tracks = (modalTarget?.tracks || []).filter(t => t.coverUrl);
  const el = document.getElementById("ctabAlbum");
  if (tracks.length === 0) {
    el.innerHTML = '<p style="color:var(--sub);font-size:13px;text-align:center;padding:24px 0;">이 플레이리스트에 앨범 표지가 없습니다.</p>';
    return;
  }
  const seen = new Set();
  const unique = tracks.filter(t => { if (seen.has(t.coverUrl)) return false; seen.add(t.coverUrl); return true; });
  el.innerHTML = `<div class="cover-album-grid">${unique.map(t => `
    <div class="cover-album-item" data-url="${t.coverUrl}" title="${t.title}">
      <img src="${t.coverUrl}" alt="${t.title}" loading="lazy" />
    </div>`).join("")}</div>`;
  el.querySelectorAll(".cover-album-item").forEach(item => {
    item.addEventListener("click", () => {
      el.querySelectorAll(".cover-album-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      selectedCover = { type: "album", value: item.dataset.url };
    });
  });
}

function buildColorTab() {
  const el = document.getElementById("ctabColor");
  el.innerHTML = `<div class="cover-palette-grid">${PALETTES.map(p => `
    <div class="cover-palette-item" data-gradient="${p.value}" title="${p.label}" style="background:${p.value};"></div>`).join("")}</div>`;
  el.querySelectorAll(".cover-palette-item").forEach(item => {
    item.addEventListener("click", () => {
      el.querySelectorAll(".cover-palette-item").forEach(i => i.classList.remove("selected"));
      item.classList.add("selected");
      selectedCover = { type: "color", value: item.dataset.gradient };
    });
  });
}

function resetUploadTab() {
  document.getElementById("coverUploadZone").textContent = "📁 클릭해서 이미지 선택";
  document.getElementById("coverUploadPreview").style.display = "none";
  document.getElementById("coverUploadPreview").src = "";
  activeUploadDataUrl = null;
}

function activateCoverTab(name) {
  document.querySelectorAll(".cover-tab").forEach(t => t.classList.toggle("active", t.dataset.ctab === name));
  ["album", "color", "upload"].forEach(n => {
    const el = document.getElementById("ctab" + n.charAt(0).toUpperCase() + n.slice(1));
    if (el) el.style.display = n === name ? "" : "none";
  });
  if (name !== "upload") { selectedCover = null; activeUploadDataUrl = null; }
}

document.querySelectorAll(".cover-tab").forEach(tab => {
  tab.addEventListener("click", () => activateCoverTab(tab.dataset.ctab));
});

document.getElementById("coverUploadZone").addEventListener("click", () => {
  document.getElementById("coverFileInput").click();
});

document.getElementById("coverFileInput").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const dataUrl = await resizeImage(file, 400);
    activeUploadDataUrl = dataUrl;
    selectedCover = { type: "upload", value: dataUrl };
    const preview = document.getElementById("coverUploadPreview");
    preview.src = dataUrl;
    preview.style.display = "block";
    document.getElementById("coverUploadZone").textContent = "✅ " + file.name;
  } catch (_e) {
    alert("이미지 처리 중 오류가 발생했습니다.");
  }
  e.target.value = "";
});

document.getElementById("coverApplyBtn").addEventListener("click", async () => {
  if (!selectedCover) { alert("표지를 선택해주세요."); return; }
  if (!modalTarget || modalTarget.type !== "playlist") return;

  const btn = document.getElementById("coverApplyBtn");
  btn.disabled = true;
  btn.textContent = "저장 중...";
  const { ok } = await api("PUT", `/api/user/playlists/${modalTarget.id}/cover`, { cover_image: selectedCover });
  btn.disabled = false;
  btn.textContent = "적용하기";

  if (ok) {
    modalTarget.coverImage = selectedCover;
    updatePlaylistCardCover(modalTarget.id, selectedCover);
    showTrackPanel();
  } else {
    alert("표지 변경에 실패했습니다.\n(Supabase playlists 테이블에 cover_image 컬럼이 있는지 확인하세요)");
  }
});

function updatePlaylistCardCover(id, coverImage) {
  const card = document.querySelector(`.pl-card[data-id="${id}"]`);
  if (!card) return;
  const thumb = card.querySelector(".pl-thumb");
  if (!thumb) return;
  if (coverImage.type === "color") {
    thumb.style.background = coverImage.value;
    thumb.innerHTML = "";
  } else {
    thumb.style.background = "";
    thumb.innerHTML = `<img src="${coverImage.value}" alt="" loading="lazy" />`;
  }
}

document.getElementById("coverBackBtn").addEventListener("click", showTrackPanel);

document.getElementById("modalCoverBtn").addEventListener("click", () => {
  if (modalTarget?.type === "playlist") showCoverPanel();
});

// ── 플레이리스트 이름 변경 ────────────────────────────
function openNameEdit() {
  const input = document.getElementById("modalNameInput");
  input.value = modalTarget?.name || "";
  document.getElementById("modalTitleWrap").style.display = "none";
  document.getElementById("modalNameEdit").classList.add("active");
  input.focus();
  input.select();
}

function closeNameEdit() {
  document.getElementById("modalTitleWrap").style.display = "";
  document.getElementById("modalNameEdit").classList.remove("active");
}

document.getElementById("btnEditName").addEventListener("click", openNameEdit);
document.getElementById("btnNameCancel").addEventListener("click", closeNameEdit);

document.getElementById("modalNameInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") document.getElementById("btnNameConfirm").click();
  if (e.key === "Escape") closeNameEdit();
});

document.getElementById("btnNameConfirm").addEventListener("click", async () => {
  const newName = document.getElementById("modalNameInput").value.trim();
  if (!newName) return;
  if (newName === modalTarget?.name) { closeNameEdit(); return; }

  const btn = document.getElementById("btnNameConfirm");
  btn.disabled = true;
  btn.textContent = "...";

  const { ok } = await api("PUT", `/api/user/playlists/${modalTarget.id}/name`, { name: newName });

  btn.disabled = false;
  btn.textContent = "저장";

  if (ok) {
    modalTarget.name = newName;
    document.getElementById("modalTitle").textContent = newName;
    const card = document.querySelector(`.pl-card[data-id="${modalTarget.id}"] .pl-name`);
    if (card) card.textContent = newName;
    closeNameEdit();
  } else {
    alert("이름 변경에 실패했습니다.");
  }
});

function openModal(type, id, name, tracks, coverImage) {
  modalTarget = { type, id, name, tracks, coverImage };
  document.getElementById("modalTitle").textContent = name;
  document.getElementById("modalTracks").innerHTML = tracks.length === 0
    ? '<p style="color:var(--sub); text-align:center; padding:20px;">곡 정보가 없습니다</p>'
    : tracks.map((t, i) => `
        <div style="display:flex; align-items:center; gap:10px; padding:8px 0; border-bottom:1px solid var(--divider);">
          <span style="color:var(--sub); font-size:12px; width:22px;">${i + 1}</span>
          ${t.coverUrl ? `<img src="${t.coverUrl}" style="width:36px;height:36px;border-radius:4px;object-fit:cover;" alt="" />` : `<div style="width:36px;height:36px;border-radius:4px;background:var(--input-border);"></div>`}
          <div>
            <div style="font-size:13px; font-weight:600; color:var(--text);">${t.title}</div>
            <div style="font-size:11px; color:var(--sub);">${t.artist}</div>
          </div>
        </div>`).join("");
  document.getElementById("modalCoverBtn").style.display = type === "playlist" ? "" : "none";
  document.getElementById("btnEditName").style.display = type === "playlist" ? "" : "none";
  closeNameEdit();
  showTrackPanel();
  document.getElementById("trackModal").style.display = "flex";
}

document.getElementById("modalClose").addEventListener("click", () => {
  document.getElementById("trackModal").style.display = "none";
  modalTarget = null;
});

document.getElementById("trackModal").addEventListener("click", (e) => {
  if (e.target === e.currentTarget) {
    e.currentTarget.style.display = "none";
    modalTarget = null;
  }
});

document.getElementById("modalDeleteBtn").addEventListener("click", async () => {
  if (!modalTarget) return;
  if (!confirm(`"${modalTarget.name}"을(를) 삭제하시겠습니까?`)) return;

  const url = modalTarget.type === "playlist" ? "/api/user/playlists" : "/api/user/likes";
  const { ok } = await api("DELETE", url, { id: modalTarget.id });

  if (ok) {
    document.getElementById("trackModal").style.display = "none";
    modalTarget = null;
    loadPlaylists();
    loadLikes();
  } else {
    alert("삭제 중 오류가 발생했습니다");
  }
});

// ── 내 플레이리스트 ──────────────────────────────────
async function loadPlaylists() {
  const { ok, data } = await api("GET", "/api/user/playlists");
  document.getElementById("plLoading").style.display = "none";

  const grid = document.getElementById("plGrid");
  if (!ok || !data.playlists || data.playlists.length === 0) {
    document.getElementById("plEmpty").style.display = "block";
    grid.style.display = "none";
    return;
  }

  document.getElementById("plEmpty").style.display = "none";
  grid.style.display = "grid";
  grid.innerHTML = data.playlists.map((pl) => {
    const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
    const ci = pl.cover_image;
    let thumbContent, thumbStyle = "";
    if (ci?.type === "color") {
      thumbStyle = `style="background:${ci.value};"`;
      thumbContent = "";
    } else if (ci?.type === "album" || ci?.type === "upload") {
      thumbContent = `<img src="${ci.value}" alt="" loading="lazy" />`;
    } else {
      thumbContent = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" loading="lazy" />` : "🎵";
    }
    const date = pl.created_at ? new Date(pl.created_at).toLocaleDateString("ko-KR") : "";
    return `
      <div class="pl-card" data-id="${pl.id}" data-type="playlist" style="cursor:pointer;">
        <div class="pl-thumb" ${thumbStyle}>${thumbContent}</div>
        <div class="pl-info">
          <div class="pl-name">${pl.name}</div>
          <div class="pl-meta">${tracks.length}곡 · ${date}</div>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".pl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const pl = data.playlists.find((p) => p.id === card.dataset.id);
      if (pl) openModal("playlist", pl.id, pl.name, Array.isArray(pl.tracks) ? pl.tracks : [], pl.cover_image);
    });
  });
}

// ── 좋아요한 플레이리스트 ────────────────────────────
async function loadLikes() {
  const { ok, data } = await api("GET", "/api/user/likes");
  document.getElementById("likeLoading").style.display = "none";

  const grid = document.getElementById("likeGrid");
  if (!ok || !data.likes || data.likes.length === 0) {
    document.getElementById("likeEmpty").style.display = "block";
    grid.style.display = "none";
    return;
  }

  document.getElementById("likeEmpty").style.display = "none";
  grid.style.display = "grid";
  grid.innerHTML = data.likes.map((like) => {
    const pd = like.playlist_data || {};
    const tracks = Array.isArray(pd.tracks) ? pd.tracks : [];
    const thumb = tracks[0]?.coverUrl ? `<img src="${tracks[0].coverUrl}" alt="" loading="lazy" />` : "💜";
    const date = like.created_at ? new Date(like.created_at).toLocaleDateString("ko-KR") : "";
    return `
      <div class="pl-card" data-id="${like.id}" data-type="like" style="cursor:pointer;">
        <div class="pl-thumb">${thumb}</div>
        <div class="pl-info">
          <div class="pl-name">${like.playlist_name || "플레이리스트"}</div>
          <div class="pl-meta">${tracks.length}곡 · ${date}</div>
        </div>
      </div>`;
  }).join("");

  grid.querySelectorAll(".pl-card").forEach((card) => {
    card.addEventListener("click", () => {
      const like = data.likes.find((l) => l.id === card.dataset.id);
      if (like) {
        const pd = like.playlist_data || {};
        openModal("like", like.id, like.playlist_name || "플레이리스트", Array.isArray(pd.tracks) ? pd.tracks : []);
      }
    });
  });
}

// ── 초기 실행 ────────────────────────────────────────
loadProfile();
loadPlaylists();
loadLikes();
