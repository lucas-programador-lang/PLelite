// ===================================================================
// PL ELITE — admin.js
// Usado apenas por admin.html.
// Protege a rota (role === "admin") e implementa o CRUD do painel:
// usuários, campanhas, publicações, validações e bonificação/sorteio.
// ===================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, get, set, update, remove, push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");
const gateDenied = document.getElementById("gateDenied");
const adminContent = document.getElementById("adminContent");

logoutBtn.addEventListener("click", () => signOut(auth));

/* ---------- Guarda de rota (somente admin) ---------- */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userSnap = await get(ref(db, `users/${user.uid}`));
  const userData = userSnap.exists() ? userSnap.val() : null;

  if (!userData || userData.role !== "admin") {
    gateDenied.classList.remove("is-hidden");
    return;
  }

  userNameEl.textContent = userData.name || user.email;
  currentAdminName = userData.name || user.email;
  adminContent.classList.remove("is-hidden");

  initTabs();
  bindUserSearch();
  bindEditUserModal();
  bindEditCampaignModal();
  bindEditPostModal();
  loadOverview();
  await loadUsers();
  loadCampaigns();
  loadPosts();
  loadValidations();
  loadHistory();
  loadRaffle();
  loadNotifications();
  loadAuditLog();
});

/* ---------- Abas ---------- */

function initTabs() {
  const tabs = document.querySelectorAll(".admin-tab");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("is-active"));
      document.querySelectorAll(".admin-section").forEach((s) => s.classList.remove("is-active"));
      tab.classList.add("is-active");
      document.getElementById(`tab-${tab.dataset.tab}`).classList.add("is-active");
    });
  });
}

/* ---------- Visão geral ---------- */

async function loadOverview() {
  const [metricsSnap, usersSnap, campaignsSnap] = await Promise.all([
    get(ref(db, "metrics")),
    get(ref(db, "users")),
    get(ref(db, "campaigns"))
  ]);

  const metrics = metricsSnap.exists() ? metricsSnap.val() : {};
  const users = usersSnap.exists() ? usersSnap.val() : {};
  const campaigns = campaignsSnap.exists() ? Object.values(campaignsSnap.val()) : [];

  const activeUsers = Object.values(users).filter((u) => u.isAuthorized && !u.isBlocked).length;
  const finished = campaigns.filter((c) => c.status === "concluida" || c.status === "cancelada");
  const successRate = finished.length
    ? Math.round((finished.filter((c) => c.status === "concluida").length / finished.length) * 100)
    : 0;

  document.getElementById("ovRewards").textContent = formatCurrency(metrics.totalRewardsDistributed || 0);
  document.getElementById("ovBonusFund").textContent = formatCurrency(metrics.bonusFund || 0);
  document.getElementById("ovActiveUsers").textContent = activeUsers;
  document.getElementById("ovCompletionRate").textContent = `${successRate}%`;

  if (campaignsSnap.exists()) window.__campaigns = campaignsSnap.val();
}

/* ---------- Usuários ---------- */

let usersCache = {};
let editingUid = null;

function bindUserSearch() {
  document.getElementById("userSearch").addEventListener("input", (e) => {
    const term = e.target.value.trim().toLowerCase();
    const filtered = Object.fromEntries(
      Object.entries(usersCache).filter(([, u]) =>
        (u.name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term)
      )
    );
    renderUsers(filtered);
  });
}

async function loadUsers() {
  const snap = await get(ref(db, "users"));
  usersCache = snap.exists() ? snap.val() : {};
  renderUsers(usersCache);
  populateNotifTargets();
}

function renderUsers(users) {
  const body = document.getElementById("usersTableBody");
  const entries = Object.entries(users);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="5">Nenhum usuário encontrado.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([uid, u]) => {
    const statusTag = u.isBanned
      ? `<span class="status-tag status-cancelada">Banido</span>`
      : u.isBlocked
      ? `<span class="status-tag status-cancelada">Bloqueado</span>`
      : u.isAuthorized
      ? `<span class="status-tag status-ativa">Autorizado</span>`
      : `<span class="status-tag status-andamento">Pendente</span>`;

    return `
      <tr>
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${statusTag}</td>
        <td>${u.role === "admin" ? "Administrador" : "Usuário"}${u.referredBy ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">via link: ${escapeHtml(u.referredBy)}</div>` : ""}</td>
        <td>
          <div class="row-actions">
            <button class="btn-mini" data-action="edit" data-uid="${uid}">Editar</button>
            ${!u.isAuthorized
              ? `<button class="btn-mini success" data-action="authorize" data-uid="${uid}">Autorizar</button>`
              : `<button class="btn-mini" data-action="deauthorize" data-uid="${uid}">Remover autorização</button>`}
            ${!u.isBlocked
              ? `<button class="btn-mini" data-action="block" data-uid="${uid}">Bloquear</button>`
              : `<button class="btn-mini success" data-action="unblock" data-uid="${uid}">Desbloquear</button>`}
            ${!u.isBanned
              ? `<button class="btn-mini danger" data-action="ban" data-uid="${uid}">Banir</button>`
              : ""}
            <button class="btn-mini danger" data-action="delete-user" data-uid="${uid}">Excluir</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleUserAction(btn.dataset.action, btn.dataset.uid));
  });
}

async function handleUserAction(action, uid) {
  if (action === "edit") {
    openEditUserModal(uid);
    return;
  }
  const u = usersCache[uid];
  const label = (u && (u.name || u.email)) || uid;
  if (action === "authorize") {
    await update(ref(db, `users/${uid}`), { isAuthorized: true });
    logAction(`Autorizou o usuário ${label}`);
  }
  if (action === "deauthorize") {
    await update(ref(db, `users/${uid}`), { isAuthorized: false });
    logAction(`Removeu a autorização de ${label}`);
  }
  if (action === "block") {
    await update(ref(db, `users/${uid}`), { isBlocked: true });
    logAction(`Bloqueou o usuário ${label}`);
  }
  if (action === "unblock") {
    await update(ref(db, `users/${uid}`), { isBlocked: false });
    logAction(`Desbloqueou o usuário ${label}`);
  }
  if (action === "ban") {
    if (!confirm(`Banir ${label}? A conta fica bloqueada e marcada como banida, mas o histórico é mantido.`)) return;
    await update(ref(db, `users/${uid}`), { isBlocked: true, isBanned: true });
    logAction(`Baniu o usuário ${label}`);
  }
  if (action === "delete-user") {
    if (!confirm(`Excluir ${label} de vez? Isso remove o cadastro, os comprovantes enviados por ele e as participações em campanhas. Não dá pra desfazer.`)) return;
    await deleteUserCompletely(uid, label);
  }
  loadUsers();
}

/**
 * Remove o registro do usuário e todo o rastro dele no banco:
 * comprovantes enviados, participações e vagas extras em campanhas.
 * Não apaga a conta de login no Firebase Auth (isso exige Admin SDK
 * via backend/Worker, fora do alcance do client SDK).
 */
async function deleteUserCompletely(uid, label) {
  const [validationsSnap, campaignsSnap] = await Promise.all([
    get(ref(db, "validations")),
    get(ref(db, "campaigns"))
  ]);

  const updates = {};

  if (validationsSnap.exists()) {
    Object.entries(validationsSnap.val()).forEach(([id, v]) => {
      if (v.userId === uid) updates[`validations/${id}`] = null;
    });
  }

  if (campaignsSnap.exists()) {
    Object.keys(campaignsSnap.val()).forEach((campaignId) => {
      updates[`campaigns/${campaignId}/participants/${uid}`] = null;
      updates[`campaigns/${campaignId}/extraSlots/${uid}`] = null;
    });
  }

  updates[`users/${uid}`] = null;

  await update(ref(db), updates);
  logAction(`Excluiu o usuário ${label} e todos os dados relacionados`);
}

/* ---------- Modal: editar usuário ---------- */

const editUserModal = document.getElementById("editUserModal");
const editUserForm = document.getElementById("editUserForm");
const editUserFeedback = document.getElementById("editUserFeedback");

function openEditUserModal(uid) {
  const u = usersCache[uid];
  if (!u) return;
  editingUid = uid;
  document.getElementById("euName").value = u.name || "";
  document.getElementById("euEmail").value = u.email || "";
  hideFeedback(editUserFeedback);
  editUserModal.classList.remove("is-hidden");
}

function bindEditUserModal() {
  document.getElementById("euCancel").addEventListener("click", () => {
    editUserModal.classList.add("is-hidden");
  });

  editUserForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editingUid) return;

    const submitBtn = document.getElementById("euSubmit");
    submitBtn.disabled = true;

    try {
      await update(ref(db, `users/${editingUid}`), {
        name: document.getElementById("euName").value.trim(),
        email: document.getElementById("euEmail").value.trim()
      });
      editUserModal.classList.add("is-hidden");
      loadUsers();
    } catch (err) {
      showFeedback(editUserFeedback, "Não foi possível salvar. Tente novamente.");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Campanhas ---------- */

let campaignsCache = {};
let editingCampaignId = null;

document.getElementById("campaignForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("campaignSubmit");
  submitBtn.disabled = true;

  const newRef = push(ref(db, "campaigns"));
  const titleValue = document.getElementById("cTitle").value.trim();
  await set(newRef, {
    title: titleValue,
    requiredPlan: document.getElementById("cPlan").value.trim(),
    description: document.getElementById("cDesc").value.trim(),
    budget: Number(document.getElementById("cBudget").value) || 0,
    maxSlots: Number(document.getElementById("cMaxSlots").value) || 3,
    filledSlots: 0,
    startDate: document.getElementById("cStart").value,
    endDate: document.getElementById("cEnd").value,
    whatsappNumber: document.getElementById("cWhats").value.trim(),
    whatsappMessage: document.getElementById("cWhatsMsg").value.trim(),
    status: "ativa",
    createdAt: Date.now()
  });
  logAction(`Criou a campanha "${titleValue}"`);

  e.target.reset();
  submitBtn.disabled = false;
  loadCampaigns();
});

async function loadCampaigns() {
  const snap = await get(ref(db, "campaigns"));
  campaignsCache = snap.exists() ? snap.val() : {};
  const body = document.getElementById("campaignsTableBody");
  const entries = Object.entries(campaignsCache);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="5">Nenhuma campanha cadastrada.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([id, c]) => {
    const extraNames = c.extraSlots ? Object.values(c.extraSlots).map((n) => escapeHtml(n)).join(", ") : "";
    const authorizedUsers = Object.entries(usersCache).filter(([, u]) => u.isAuthorized && !u.isBlocked);
    const participants = c.participants || {};
    const filledCount = Object.keys(participants).length || c.filledSlots || 0;

    const participantChips = Object.entries(participants).map(([uid, name]) => `
      <span class="status-tag status-ativa" style="display:inline-flex;align-items:center;gap:6px;margin:2px 4px 2px 0;">
        ${escapeHtml(name)}
        <button type="button" data-action="remove-participant" data-id="${id}" data-uid="${uid}" style="background:none;border:none;color:inherit;cursor:pointer;font-weight:700;padding:0;">×</button>
      </span>`).join("");

    return `
    <tr>
      <td>${escapeHtml(c.title || "—")}</td>
      <td>
        ${filledCount}/${c.maxSlots || 3}
        ${extraNames ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">Vaga extra: ${extraNames}</div>` : ""}
        ${participantChips ? `<div style="margin-top:6px;">${participantChips}</div>` : ""}
        <select class="btn-mini" data-action="add-participant" data-id="${id}" style="margin-top:6px;">
          <option value="">Adicionar participante…</option>
          ${authorizedUsers.filter(([uid]) => !participants[uid]).map(([uid, u]) => `<option value="${uid}">${escapeHtml(u.name || u.email)}</option>`).join("")}
        </select>
      </td>
      <td>
        <select class="btn-mini" data-action="status" data-id="${id}">
          ${["ativa", "andamento", "concluida", "cancelada"].map(
            (s) => `<option value="${s}" ${c.status === s ? "selected" : ""}>${s}</option>`
          ).join("")}
        </select>
      </td>
      <td>
        <select class="btn-mini" data-action="result" data-id="${id}">
          <option value="" ${!c.result ? "selected" : ""}>—</option>
          <option value="sucesso" ${c.result === "sucesso" ? "selected" : ""}>🟢 Sucesso</option>
          <option value="prejuizo" ${c.result === "prejuizo" ? "selected" : ""}>🔴 Prejuízo</option>
        </select>
      </td>
      <td>${formatDateRange(c.startDate, c.endDate)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-mini" data-action="edit-campaign" data-id="${id}">Editar</button>
          <button class="btn-mini" data-action="expand" data-id="${id}">+1 vaga</button>
          <select class="btn-mini" data-action="extra-slot-user" data-id="${id}">
            <option value="">Vaga extra p/…</option>
            ${authorizedUsers.map(([uid, u]) => `<option value="${uid}">${escapeHtml(u.name || u.email)}</option>`).join("")}
          </select>
          <button class="btn-mini danger" data-action="delete" data-id="${id}">Excluir</button>
        </div>
      </td>
    </tr>
  `;
  }).join("");

  body.querySelectorAll("select[data-action='status']").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const c = campaignsCache[sel.dataset.id];
      await update(ref(db, `campaigns/${sel.dataset.id}`), { status: sel.value });
      logAction(`Mudou status da campanha "${c.title}" para "${sel.value}"`);
    });
  });

  body.querySelectorAll("select[data-action='result']").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const c = campaignsCache[sel.dataset.id];
      await update(ref(db, `campaigns/${sel.dataset.id}`), { result: sel.value });
      if (sel.value) await finalizeParticipants(sel.dataset.id);
      logAction(`Registrou resultado da campanha "${c.title}": ${sel.value || "—"}`);
      loadHistory();
    });
  });

  body.querySelectorAll("button[data-action='edit-campaign']").forEach((btn) => {
    btn.addEventListener("click", () => openEditCampaignModal(btn.dataset.id));
  });

  body.querySelectorAll("button[data-action='expand']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = campaignsCache[btn.dataset.id];
      await update(ref(db, `campaigns/${btn.dataset.id}`), { maxSlots: (c.maxSlots || 3) + 1 });
      loadCampaigns();
    });
  });

  body.querySelectorAll("select[data-action='extra-slot-user']").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const uid = sel.value;
      if (!uid) return;
      const c = campaignsCache[sel.dataset.id];
      const u = usersCache[uid];
      await update(ref(db, `campaigns/${sel.dataset.id}`), {
        maxSlots: (c.maxSlots || 3) + 1,
        [`extraSlots/${uid}`]: u.name || u.email
      });
      loadCampaigns();
    });
  });

  body.querySelectorAll("select[data-action='add-participant']").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const uid = sel.value;
      if (!uid) return;
      const u = usersCache[uid];
      await update(ref(db, `campaigns/${sel.dataset.id}`), {
        [`participants/${uid}`]: u.name || u.email
      });
      loadCampaigns();
    });
  });

  body.querySelectorAll("button[data-action='remove-participant']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await remove(ref(db, `campaigns/${btn.dataset.id}/participants/${btn.dataset.uid}`));
      loadCampaigns();
    });
  });

  body.querySelectorAll("button[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esta campanha?")) return;
      const c = campaignsCache[btn.dataset.id];
      await remove(ref(db, `campaigns/${btn.dataset.id}`));
      logAction(`Excluiu a campanha "${c.title}"`);
      loadCampaigns();
    });
  });
}

/**
 * Marca como FINALIZADO (participantFinalized: true) todos os comprovantes
 * aprovados vinculados a uma campanha, assim que o admin registra o
 * resultado (sucesso ou prejuízo) dela.
 */
async function finalizeParticipants(campaignId) {
  const snap = await get(ref(db, "validations"));
  const validations = snap.exists() ? snap.val() : {};

  const updates = {};
  Object.entries(validations).forEach(([id, v]) => {
    if (v.campaignId === campaignId && v.status === "aprovado") {
      updates[`validations/${id}/participantFinalized`] = true;
    }
  });

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates);
  }
}

/* ---------- Modal: editar campanha ---------- */

const editCampaignModal = document.getElementById("editCampaignModal");
const editCampaignForm = document.getElementById("editCampaignForm");
const editCampaignFeedback = document.getElementById("editCampaignFeedback");

function openEditCampaignModal(id) {
  const c = campaignsCache[id];
  if (!c) return;
  editingCampaignId = id;
  document.getElementById("ecTitle").value = c.title || "";
  document.getElementById("ecPlan").value = c.requiredPlan || "";
  document.getElementById("ecDesc").value = c.description || "";
  document.getElementById("ecBudget").value = c.budget || 0;
  document.getElementById("ecMaxSlots").value = c.maxSlots || 3;
  document.getElementById("ecStart").value = c.startDate || "";
  document.getElementById("ecEnd").value = c.endDate || "";
  document.getElementById("ecWhats").value = c.whatsappNumber || "";
  document.getElementById("ecWhatsMsg").value = c.whatsappMessage || "";
  hideFeedback(editCampaignFeedback);
  editCampaignModal.classList.remove("is-hidden");
}

function bindEditCampaignModal() {
  document.getElementById("ecCancel").addEventListener("click", () => {
    editCampaignModal.classList.add("is-hidden");
  });

  editCampaignForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editingCampaignId) return;

    const submitBtn = document.getElementById("ecSubmit");
    submitBtn.disabled = true;

    try {
      const titleValue = document.getElementById("ecTitle").value.trim();
      await update(ref(db, `campaigns/${editingCampaignId}`), {
        title: titleValue,
        requiredPlan: document.getElementById("ecPlan").value.trim(),
        description: document.getElementById("ecDesc").value.trim(),
        budget: Number(document.getElementById("ecBudget").value) || 0,
        maxSlots: Number(document.getElementById("ecMaxSlots").value) || 3,
        startDate: document.getElementById("ecStart").value,
        endDate: document.getElementById("ecEnd").value,
        whatsappNumber: document.getElementById("ecWhats").value.trim(),
        whatsappMessage: document.getElementById("ecWhatsMsg").value.trim()
      });
      logAction(`Editou a campanha "${titleValue}"`);
      editCampaignModal.classList.add("is-hidden");
      loadCampaigns();
    } catch (err) {
      showFeedback(editCampaignFeedback, "Não foi possível salvar. Tente novamente.");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Publicações ---------- */

document.getElementById("postForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("postSubmit");
  submitBtn.disabled = true;

  const newRef = push(ref(db, "posts"));
  await set(newRef, {
    title: document.getElementById("pTitle").value.trim(),
    category: document.getElementById("pCategory").value.trim(),
    description: document.getElementById("pDesc").value.trim(),
    images: linesToArray(document.getElementById("pImages").value),
    redirectLink: document.getElementById("pLink").value.trim(),
    date: Date.now(),
    status: "publicado"
  });

  e.target.reset();
  submitBtn.disabled = false;
  loadPosts();
});

async function loadPosts() {
  const snap = await get(ref(db, "posts"));
  postsCache = snap.exists() ? snap.val() : {};
  const body = document.getElementById("postsTableBody");
  const entries = Object.entries(postsCache).sort((a, b) => (b[1].date || 0) - (a[1].date || 0));

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="4">Nenhuma publicação ainda.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([id, p]) => `
    <tr>
      <td>${escapeHtml(p.title || "—")}</td>
      <td>${escapeHtml(p.category || "—")}</td>
      <td>${p.date ? new Date(p.date).toLocaleDateString("pt-BR") : "—"}</td>
      <td>
        <div class="row-actions">
          <button class="btn-mini" data-action="edit-post" data-id="${id}">Editar</button>
          <button class="btn-mini danger" data-action="delete-post" data-id="${id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("button[data-action='edit-post']").forEach((btn) => {
    btn.addEventListener("click", () => openEditPostModal(btn.dataset.id));
  });

  body.querySelectorAll("button[data-action='delete-post']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esta publicação?")) return;
      await remove(ref(db, `posts/${btn.dataset.id}`));
      loadPosts();
    });
  });
}

/* ---------- Modal: editar publicação ---------- */

let postsCache = {};
let editingPostId = null;

const editPostModal = document.getElementById("editPostModal");
const editPostForm = document.getElementById("editPostForm");
const editPostFeedback = document.getElementById("editPostFeedback");

function openEditPostModal(id) {
  const p = postsCache[id];
  if (!p) return;
  editingPostId = id;
  document.getElementById("epTitle").value = p.title || "";
  document.getElementById("epCategory").value = p.category || "";
  document.getElementById("epDesc").value = p.description || "";
  document.getElementById("epImages").value = (p.images || (p.imageUrl ? [p.imageUrl] : [])).join("\n");
  document.getElementById("epLink").value = p.redirectLink || "";
  hideFeedback(editPostFeedback);
  editPostModal.classList.remove("is-hidden");
}

function bindEditPostModal() {
  document.getElementById("epCancel").addEventListener("click", () => {
    editPostModal.classList.add("is-hidden");
  });

  editPostForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!editingPostId) return;

    const submitBtn = document.getElementById("epSubmit");
    submitBtn.disabled = true;

    try {
      await update(ref(db, `posts/${editingPostId}`), {
        title: document.getElementById("epTitle").value.trim(),
        category: document.getElementById("epCategory").value.trim(),
        description: document.getElementById("epDesc").value.trim(),
        images: linesToArray(document.getElementById("epImages").value),
        redirectLink: document.getElementById("epLink").value.trim()
      });
      editPostModal.classList.add("is-hidden");
      loadPosts();
    } catch (err) {
      showFeedback(editPostFeedback, "Não foi possível salvar. Tente novamente.");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Validações (comprovantes) ---------- */

async function loadValidations() {
  const snap = await get(ref(db, "validations"));
  const validations = snap.exists() ? snap.val() : {};
  const body = document.getElementById("validationsTableBody");
  const entries = Object.entries(validations);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="7">Nenhum comprovante enviado ainda.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([id, v]) => {
    const statusTag = v.status === "aprovado"
      ? `<span class="status-tag status-ativa">Aprovado</span>`
      : v.status === "rejeitado"
      ? `<span class="status-tag status-cancelada">Rejeitado</span>`
      : `<span class="status-tag status-andamento">Pendente</span>`;

    return `
      <tr>
        <td>${escapeHtml(v.userName || v.userId || "—")}</td>
        <td>${escapeHtml(v.campaignTitle || "—")}</td>
        <td>${formatDateRange(v.startDate, v.endDate)}</td>
        <td>${escapeHtml(v.notes || "—")}</td>
        <td>${v.imageBase64 ? `<a href="${v.imageBase64}" target="_blank" rel="noopener">Ver print</a>` : "—"}</td>
        <td>${statusTag}</td>
        <td>
          <div class="row-actions">
            <button class="btn-mini success" data-action="approve" data-id="${id}" data-name="${escapeHtml(v.userName || v.userId || "—")}">Aprovar</button>
            <button class="btn-mini danger" data-action="reject" data-id="${id}" data-name="${escapeHtml(v.userName || v.userId || "—")}">Rejeitar</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action='approve']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await update(ref(db, `validations/${btn.dataset.id}`), { status: "aprovado" });
      logAction(`Aprovou o comprovante de ${btn.dataset.name}`);
      loadValidations();
      loadHistory();
    });
  });

  body.querySelectorAll("button[data-action='reject']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await update(ref(db, `validations/${btn.dataset.id}`), { status: "rejeitado" });
      logAction(`Rejeitou o comprovante de ${btn.dataset.name}`);
      loadValidations();
      loadHistory();
    });
  });
}

/* ---------- Histórico de participantes ---------- */

async function loadHistory() {
  const [validationsSnap, usersSnap, campaignsSnap] = await Promise.all([
    get(ref(db, "validations")),
    get(ref(db, "users")),
    get(ref(db, "campaigns"))
  ]);

  const validations = validationsSnap.exists() ? validationsSnap.val() : {};
  const users = usersSnap.exists() ? usersSnap.val() : {};
  const campaigns = campaignsSnap.exists() ? campaignsSnap.val() : {};
  const body = document.getElementById("historyTableBody");

  const entries = Object.entries(validations)
    .map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.status === "aprovado")
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="8">Nenhuma participação aprovada ainda.</td></tr>`;
    return;
  }

  // Conta quantas vezes cada userId aparece no histórico aprovado
  const countByUser = {};
  entries.forEach((v) => {
    countByUser[v.userId] = (countByUser[v.userId] || 0) + 1;
  });

  body.innerHTML = entries.map((v) => {
    const u = users[v.userId];
    const c = campaigns[v.campaignId];
    const userName = (u && u.name) || v.userName || "—";
    const value = c && c.budget ? formatCurrency(c.budget) : "—";
    const timesParticipated = countByUser[v.userId] || 1;

    const statusTag = v.participantFinalized
      ? `<span class="status-tag status-concluida">✅ FINALIZADO</span>`
      : v.status === "aprovado"
      ? `<span class="status-tag status-ativa">Aprovado</span>`
      : v.status === "rejeitado"
      ? `<span class="status-tag status-cancelada">Rejeitado</span>`
      : `<span class="status-tag status-andamento">Pendente</span>`;

    const resultTag = !c || !c.result
      ? "—"
      : c.result === "sucesso"
      ? `<span class="status-tag status-ativa">🟢 Sucesso</span>`
      : `<span class="status-tag status-cancelada">🔴 Prejuízo</span>`;

    return `
      <tr>
        <td>${escapeHtml(userName)}</td>
        <td>${escapeHtml(v.campaignTitle || "—")}</td>
        <td>${timesParticipated}x</td>
        <td>${value}</td>
        <td>${v.startDate ? new Date(v.startDate).toLocaleDateString("pt-BR") : "—"}</td>
        <td>${v.endDate ? new Date(v.endDate).toLocaleDateString("pt-BR") : "—"}</td>
        <td>${v.withdrawalDone
          ? `<span class="status-tag status-ativa">Sim</span>`
          : `<button class="btn-mini" data-action="toggle-withdrawal" data-id="${v.id}">Marcar saque</button>`}</td>
        <td>${resultTag}</td>
        <td>${statusTag}</td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action='toggle-withdrawal']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await update(ref(db, `validations/${btn.dataset.id}`), { withdrawalDone: true });
      loadHistory();
    });
  });
}

/* ---------- Bonificação / sorteio ---------- */

document.getElementById("raffleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await update(ref(db, "raffle"), {
    fund: Number(document.getElementById("rFund").value) || 0,
    date: document.getElementById("rDate").value,
    winner: document.getElementById("rWinner").value.trim(),
    rules: document.getElementById("rRules").value.trim()
  });
  await update(ref(db, "metrics"), { bonusFund: Number(document.getElementById("rFund").value) || 0 });
});

async function loadRaffle() {
  const [raffleSnap, entriesSnap] = await Promise.all([
    get(ref(db, "raffle")),
    get(ref(db, "raffleEntries"))
  ]);

  const raffle = raffleSnap.exists() ? raffleSnap.val() : {};
  document.getElementById("rFund").value = raffle.fund || "";
  document.getElementById("rDate").value = raffle.date || "";
  document.getElementById("rWinner").value = raffle.winner || "";
  document.getElementById("rRules").value = raffle.rules || "";

  const entries = entriesSnap.exists() ? entriesSnap.val() : {};
  const body = document.getElementById("raffleTableBody");
  const list = Object.entries(entries);

  if (list.length === 0) {
    body.innerHTML = `<tr><td colspan="3">Nenhum usuário qualificado ainda.</td></tr>`;
    return;
  }

  body.innerHTML = list.map(([id, u]) => `
    <tr>
      <td>${escapeHtml(u.name || "—")}</td>
      <td>${escapeHtml(u.email || "—")}</td>
      <td><button class="btn-mini danger" data-action="remove-entry" data-id="${id}">Remover</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("button[data-action='remove-entry']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await remove(ref(db, `raffleEntries/${btn.dataset.id}`));
      loadRaffle();
    });
  });
}

/* ---------- Avisos / notificações ---------- */

function populateNotifTargets() {
  const select = document.getElementById("nTarget");
  const options = Object.entries(usersCache)
    .map(([uid, u]) => `<option value="${uid}">${escapeHtml(u.name || u.email)}</option>`)
    .join("");
  select.innerHTML = `<option value="all">Todos os usuários</option>${options}`;
}

document.getElementById("notifForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("notifSubmit");
  submitBtn.disabled = true;

  const target = document.getElementById("nTarget").value;
  const titleValue = document.getElementById("nTitle").value.trim();
  const newRef = push(ref(db, "notifications"));
  await set(newRef, {
    title: titleValue,
    type: document.getElementById("nType").value,
    message: document.getElementById("nMessage").value.trim(),
    targetUid: target === "all" ? null : target,
    targetName: target === "all" ? "Todos" : (usersCache[target]?.name || usersCache[target]?.email || "—"),
    createdAt: Date.now()
  });
  logAction(`Enviou o aviso "${titleValue}"`);

  e.target.reset();
  submitBtn.disabled = false;
  loadNotifications();
});

async function loadNotifications() {
  const snap = await get(ref(db, "notifications"));
  const notifs = snap.exists() ? snap.val() : {};
  const body = document.getElementById("notifsTableBody");
  const entries = Object.entries(notifs).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  const TYPE_LABELS = { resgate: "Resgate", plano: "Plano", prazo: "Prazo", aviso: "Instrução" };

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="5">Nenhum aviso enviado ainda.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([id, n]) => `
    <tr>
      <td>${escapeHtml(n.title || "—")}</td>
      <td>${TYPE_LABELS[n.type] || "—"}</td>
      <td>${escapeHtml(n.targetName || "Todos")}</td>
      <td>${n.createdAt ? new Date(n.createdAt).toLocaleDateString("pt-BR") : "—"}</td>
      <td><button class="btn-mini danger" data-action="delete-notif" data-id="${id}" data-title="${escapeHtml(n.title || "—")}">Excluir</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("button[data-action='delete-notif']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este aviso?")) return;
      await remove(ref(db, `notifications/${btn.dataset.id}`));
      logAction(`Excluiu o aviso "${btn.dataset.title}"`);
      loadNotifications();
    });
  });
}

/* ---------- Auditoria ---------- */

let currentAdminName = "";

function logAction(action) {
  push(ref(db, "auditLog"), {
    adminUid: auth.currentUser.uid,
    adminName: currentAdminName,
    action,
    timestamp: Date.now()
  }).catch(() => {});
}

async function loadAuditLog() {
  const snap = await get(ref(db, "auditLog"));
  const log = snap.exists() ? snap.val() : {};
  const body = document.getElementById("auditTableBody");

  const entries = Object.values(log)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
    .slice(0, 100);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="3">Nenhuma ação registrada ainda.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map((e) => `
    <tr>
      <td>${e.timestamp ? new Date(e.timestamp).toLocaleString("pt-BR") : "—"}</td>
      <td>${escapeHtml(e.adminName || "—")}</td>
      <td>${escapeHtml(e.action || "—")}</td>
    </tr>
  `).join("");
}

/* ---------- Utilitários ---------- */

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateRange(start, end) {
  if (!start && !end) return "—";
  const opts = { day: "2-digit", month: "2-digit" };
  const s = start ? new Date(start).toLocaleDateString("pt-BR", opts) : "?";
  const e = end ? new Date(end).toLocaleDateString("pt-BR", opts) : "?";
  return `${s} — ${e}`;
}

function showFeedback(el, message) {
  el.textContent = message;
  el.hidden = false;
}

function hideFeedback(el) {
  el.hidden = true;
  el.textContent = "";
}

function linesToArray(text) {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
