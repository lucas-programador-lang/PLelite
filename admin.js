// ===================================================================
// PL ELITE — admin.js
// Usado apenas por admin.html.
// Protege a rota (role === "admin") e implementa o CRUD do painel:
// usuários, campanhas, publicações, validações e bonificação/sorteio.
// Tudo em tempo real via onValue() — a tela atualiza sozinha assim
// que o dado muda no banco, sem precisar recarregar a página.
// ===================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref, onValue, get, set, update, remove, push
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const sidebarUserNameEl = document.getElementById("sidebarUserName");
const sidebarAvatarEl = document.getElementById("sidebarAvatar");
const logoutBtn = document.getElementById("logoutBtn");
const gateDenied = document.getElementById("gateDenied");
const adminContent = document.getElementById("adminContent");

logoutBtn.addEventListener("click", () => signOut(auth));

let currentAdminName = "";
let listenersAttached = false;
let raffleFormPrefilled = false;

// Caches locais alimentados pelos listeners onValue.
let usersCache = {};
let campaignsCache = {};
let metricsCache = {};
let postsCache = {};
let validationsCache = {};
let raffleCache = {};
let raffleEntriesCache = {};
let notifsCache = {};
let auditCache = {};

let editingUid = null;
let editingCampaignId = null;
let editingPostId = null;

/* ---------- Guarda de rota (somente admin, em tempo real) ---------- */

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  onValue(ref(db, `users/${user.uid}`), (snap) => {
    const userData = snap.exists() ? snap.val() : null;

    if (!userData || userData.role !== "admin") {
      gateDenied.classList.remove("is-hidden");
      adminContent.classList.add("is-hidden");
      return;
    }

    currentAdminName = userData.name || user.email;
    sidebarUserNameEl.textContent = currentAdminName;
    sidebarAvatarEl.textContent = currentAdminName.trim().charAt(0).toUpperCase();
    gateDenied.classList.add("is-hidden");
    adminContent.classList.remove("is-hidden");

    if (!listenersAttached) {
      initTabs();
      bindUserSearch();
      bindEditUserModal();
      bindEditCampaignModal();
      bindEditPostModal();
      attachRealtimeListeners();
      listenersAttached = true;
    }
  });
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
      closeSidebar();
    });
  });
}

/* ---------- Sidebar (gaveta no mobile) ---------- */

const sidebarEl = document.getElementById("sidebar");
const sidebarOverlayEl = document.getElementById("sidebarOverlay");
const sidebarToggleEl = document.getElementById("sidebarToggle");
const sidebarCloseEl = document.getElementById("sidebarClose");

function openSidebar() {
  sidebarEl.classList.add("is-open");
  sidebarOverlayEl.classList.add("is-open");
}

function closeSidebar() {
  sidebarEl.classList.remove("is-open");
  sidebarOverlayEl.classList.remove("is-open");
}

sidebarToggleEl.addEventListener("click", openSidebar);
sidebarCloseEl.addEventListener("click", closeSidebar);
sidebarOverlayEl.addEventListener("click", closeSidebar);

/* ---------- Listeners em tempo real ---------- */

function attachRealtimeListeners() {
  onValue(ref(db, "users"), (snap) => {
    usersCache = snap.exists() ? snap.val() : {};
    renderUsersTable();
    populateNotifTargets();
    populateVisibilityOptions();
    renderOverview();
    renderFinanceiro();
    renderHistoryTable();
  });

  onValue(ref(db, "campaigns"), (snap) => {
    campaignsCache = snap.exists() ? snap.val() : {};
    renderCampaignsTable();
    renderOverview();
    renderFinanceiro();
    renderHistoryTable();
  });

  onValue(ref(db, "metrics"), (snap) => {
    metricsCache = snap.exists() ? snap.val() : {};
    renderOverview();
  });

  onValue(ref(db, "posts"), (snap) => {
    postsCache = snap.exists() ? snap.val() : {};
    renderPostsTable();
  });

  onValue(ref(db, "validations"), (snap) => {
    validationsCache = snap.exists() ? snap.val() : {};
    renderValidationsTable();
    renderHistoryTable();
  });

  onValue(ref(db, "raffle"), (snap) => {
    raffleCache = snap.exists() ? snap.val() : {};
    renderRaffleAdmin();
    renderFinanceiro();
  });

  onValue(ref(db, "raffleEntries"), (snap) => {
    raffleEntriesCache = snap.exists() ? snap.val() : {};
    renderRaffleAdmin();
  });

  onValue(ref(db, "notifications"), (snap) => {
    notifsCache = snap.exists() ? snap.val() : {};
    renderNotifsTable();
  });

  onValue(ref(db, "auditLog"), (snap) => {
    auditCache = snap.exists() ? snap.val() : {};
    renderAuditTable();
  });
}

/* ---------- Visão geral ---------- */

function renderOverview() {
  const users = Object.values(usersCache);
  const campaigns = Object.values(campaignsCache);

  const activeUsers = users.filter((u) => u.isAuthorized && !u.isBlocked).length;
  const finished = campaigns.filter((c) => c.status === "concluida" || c.status === "cancelada");
  const successRate = finished.length
    ? Math.round((finished.filter((c) => c.status === "concluida").length / finished.length) * 100)
    : 0;

  document.getElementById("ovRewards").textContent = formatCurrency(metricsCache.totalRewardsDistributed || 0);
  document.getElementById("ovBonusFund").textContent = formatCurrency(metricsCache.bonusFund || 0);
  document.getElementById("ovActiveUsers").textContent = activeUsers;
  document.getElementById("ovCompletionRate").textContent = `${successRate}%`;
}

/**
 * Dashboard financeiro separado, com os números que o briefing pede:
 * total pago em patrocínios, total arrecadado pra sorteios, total de
 * participantes, total de oportunidades e a contagem por status.
 */
function renderFinanceiro() {
  const campaigns = Object.values(campaignsCache);

  const totalPago = campaigns
    .filter((c) => c.result)
    .reduce((sum, c) => sum + (c.budget || 0), 0);

  const participantUids = new Set();
  campaigns.forEach((c) => {
    if (c.participants) Object.keys(c.participants).forEach((uid) => participantUids.add(uid));
  });

  const finalizadas = campaigns.filter((c) => c.status === "concluida" || c.status === "cancelada").length;
  const andamento = campaigns.filter((c) => c.status === "ativa" || c.status === "andamento").length;

  document.getElementById("fTotalPago").textContent = formatCurrency(totalPago);
  document.getElementById("fTotalSorteios").textContent = formatCurrency(raffleCache.fund || 0);
  document.getElementById("fTotalParticipantes").textContent = participantUids.size;
  document.getElementById("fTotalOportunidades").textContent = campaigns.length;
  document.getElementById("fFinalizadas").textContent = finalizadas;
  document.getElementById("fAndamento").textContent = andamento;
}

/* ---------- Usuários ---------- */

function bindUserSearch() {
  document.getElementById("userSearch").addEventListener("input", renderUsersTable);
}

/**
 * Popula os <select multiple> de "visível só para" (criar e editar
 * campanha) com os usuários autorizados e não bloqueados.
 */
function populateVisibilityOptions() {
  const authorizedUsers = Object.entries(usersCache).filter(([, u]) => u.isAuthorized && !u.isBlocked);
  const optionsHtml = authorizedUsers
    .map(([uid, u]) => `<option value="${uid}">${escapeHtml(u.name || u.email)}</option>`)
    .join("");
  const cSelect = document.getElementById("cVisibleTo");
  const ecSelect = document.getElementById("ecVisibleTo");
  if (cSelect) cSelect.innerHTML = optionsHtml;
  if (ecSelect) ecSelect.innerHTML = optionsHtml;
}

function readVisibleTo(selectEl) {
  const selected = Array.from(selectEl.selectedOptions).map((o) => o.value);
  if (selected.length === 0) return null;
  const obj = {};
  selected.forEach((uid) => { obj[uid] = true; });
  return obj;
}

function renderUsersTable() {
  const term = document.getElementById("userSearch").value.trim().toLowerCase();
  const users = term
    ? Object.fromEntries(
        Object.entries(usersCache).filter(([, u]) =>
          (u.name || "").toLowerCase().includes(term) || (u.email || "").toLowerCase().includes(term)
        )
      )
    : usersCache;

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

  try {
    if (action === "authorize") {
      await update(ref(db, `users/${uid}`), { isAuthorized: true });
      logAction(`Autorizou o usuário ${label}`);
      showToast(`${label} foi autorizado.`, "success");
    }
    if (action === "deauthorize") {
      await update(ref(db, `users/${uid}`), { isAuthorized: false });
      logAction(`Removeu a autorização de ${label}`);
      showToast(`Autorização de ${label} removida.`, "success");
    }
    if (action === "block") {
      await update(ref(db, `users/${uid}`), { isBlocked: true });
      logAction(`Bloqueou o usuário ${label}`);
      showToast(`${label} foi bloqueado.`, "success");
    }
    if (action === "unblock") {
      await update(ref(db, `users/${uid}`), { isBlocked: false });
      logAction(`Desbloqueou o usuário ${label}`);
      showToast(`${label} foi desbloqueado.`, "success");
    }
    if (action === "ban") {
      if (!(await showConfirm(`Banir ${label}? A conta fica bloqueada e marcada como banida, mas o histórico é mantido.`))) return;
      await update(ref(db, `users/${uid}`), { isBlocked: true, isBanned: true });
      logAction(`Baniu o usuário ${label}`);
      showToast(`${label} foi banido.`, "success");
    }
    if (action === "delete-user") {
      if (!(await showConfirm(`Excluir ${label} de vez? Isso remove o cadastro, os comprovantes enviados por ele e as participações em campanhas. Não dá pra desfazer.`))) return;
      await deleteUserCompletely(uid, label);
      showToast(`${label} foi excluído.`, "success");
    }
  } catch (err) {
    showToast("Não foi possível concluir a ação. Tente novamente.", "error");
  }
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
      showToast("Usuário atualizado!", "success");
    } catch (err) {
      showToast("Não foi possível salvar. Tente novamente.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Campanhas ---------- */

document.getElementById("campaignForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("campaignSubmit");
  submitBtn.disabled = true;

  const newRef = push(ref(db, "campaigns"));
  const titleValue = document.getElementById("cTitle").value.trim();
  await set(newRef, {
    title: titleValue,
    requiredPlan: document.getElementById("cPlan").value.trim(),
    machines: document.getElementById("cMachines").value.trim(),
    description: document.getElementById("cDesc").value.trim(),
    budget: Number(document.getElementById("cBudget").value) || 0,
    maxSlots: Number(document.getElementById("cMaxSlots").value) || 3,
    filledSlots: 0,
    startDate: document.getElementById("cStart").value,
    endDate: document.getElementById("cEnd").value,
    whatsappNumber: document.getElementById("cWhats").value.trim(),
    whatsappMessage: document.getElementById("cWhatsMsg").value.trim(),
    visibleTo: readVisibleTo(document.getElementById("cVisibleTo")),
    status: "ativa",
    createdAt: Date.now()
  });
  logAction(`Criou a campanha "${titleValue}"`);
  showToast("Campanha criada!", "success");

  e.target.reset();
  submitBtn.disabled = false;
});

function renderCampaignsTable() {
  const body = document.getElementById("campaignsTableBody");
  const entries = Object.entries(campaignsCache);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="6">Nenhuma campanha cadastrada.</td></tr>`;
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
      <td>${escapeHtml(c.title || "—")}${c.machines ? `<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">🛠️ ${escapeHtml(c.machines)}</div>` : ""}${c.visibleTo ? `<div style="font-size:10.5px;color:var(--gold);margin-top:4px;">🔒 Visível só p/ ${Object.keys(c.visibleTo).length} usuário(s)</div>` : ""}</td>
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
      showToast("Status atualizado.", "success");
    });
  });

  body.querySelectorAll("select[data-action='result']").forEach((sel) => {
    sel.addEventListener("change", async () => {
      const c = campaignsCache[sel.dataset.id];
      const updates = { result: sel.value };
      // Registrar um resultado significa que a campanha acabou — move ela
      // pra "concluída" automaticamente, senão o Resultado fica "preso"
      // numa campanha que continua marcada como ativa/andamento.
      if (sel.value && c.status !== "concluida" && c.status !== "cancelada") {
        updates.status = "concluida";
      }
      await update(ref(db, `campaigns/${sel.dataset.id}`), updates);
      if (sel.value) await finalizeParticipants(sel.dataset.id);
      logAction(`Registrou resultado da campanha "${c.title}": ${sel.value || "—"}`);
      showToast("Resultado registrado — campanha movida para Concluídas.", "success");
    });
  });

  body.querySelectorAll("button[data-action='edit-campaign']").forEach((btn) => {
    btn.addEventListener("click", () => openEditCampaignModal(btn.dataset.id));
  });

  body.querySelectorAll("button[data-action='expand']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = campaignsCache[btn.dataset.id];
      await update(ref(db, `campaigns/${btn.dataset.id}`), { maxSlots: (c.maxSlots || 3) + 1 });
      showToast("Vaga adicionada.", "success");
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
      showToast(`Vaga extra concedida a ${u.name || u.email}.`, "success");
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
      showToast(`${u.name || u.email} adicionado como participante.`, "success");
    });
  });

  body.querySelectorAll("button[data-action='remove-participant']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await remove(ref(db, `campaigns/${btn.dataset.id}/participants/${btn.dataset.uid}`));
      showToast("Participante removido.", "success");
    });
  });

  body.querySelectorAll("button[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!(await showConfirm("Excluir esta campanha?"))) return;
      const c = campaignsCache[btn.dataset.id];
      await remove(ref(db, `campaigns/${btn.dataset.id}`));
      logAction(`Excluiu a campanha "${c.title}"`);
      showToast("Campanha excluída.", "success");
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
      if (v.userId) updates[`users/${v.userId}/myValidations/${id}/participantFinalized`] = true;
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
  document.getElementById("ecMachines").value = c.machines || "";
  document.getElementById("ecDesc").value = c.description || "";
  document.getElementById("ecBudget").value = c.budget || 0;
  document.getElementById("ecMaxSlots").value = c.maxSlots || 3;
  document.getElementById("ecStart").value = c.startDate || "";
  document.getElementById("ecEnd").value = c.endDate || "";
  document.getElementById("ecWhats").value = c.whatsappNumber || "";
  document.getElementById("ecWhatsMsg").value = c.whatsappMessage || "";

  const ecSelect = document.getElementById("ecVisibleTo");
  Array.from(ecSelect.options).forEach((opt) => {
    opt.selected = !!(c.visibleTo && c.visibleTo[opt.value]);
  });

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
        machines: document.getElementById("ecMachines").value.trim(),
        description: document.getElementById("ecDesc").value.trim(),
        budget: Number(document.getElementById("ecBudget").value) || 0,
        maxSlots: Number(document.getElementById("ecMaxSlots").value) || 3,
        startDate: document.getElementById("ecStart").value,
        endDate: document.getElementById("ecEnd").value,
        whatsappNumber: document.getElementById("ecWhats").value.trim(),
        whatsappMessage: document.getElementById("ecWhatsMsg").value.trim(),
        visibleTo: readVisibleTo(document.getElementById("ecVisibleTo"))
      });
      logAction(`Editou a campanha "${titleValue}"`);
      editCampaignModal.classList.add("is-hidden");
      showToast("Campanha atualizada!", "success");
    } catch (err) {
      showToast("Não foi possível salvar. Tente novamente.", "error");
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
    status: document.getElementById("pStatus").value
  });

  e.target.reset();
  submitBtn.disabled = false;
  showToast("Publicação criada!", "success");
});

function renderPostsTable() {
  const body = document.getElementById("postsTableBody");
  const entries = Object.entries(postsCache).sort((a, b) => (b[1].date || 0) - (a[1].date || 0));

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="5">Nenhuma publicação ainda.</td></tr>`;
    return;
  }

  const STATUS_LABELS = { publicado: "Publicado", rascunho: "Rascunho", arquivado: "Arquivado" };

  body.innerHTML = entries.map(([id, p]) => `
    <tr>
      <td>${escapeHtml(p.title || "—")}</td>
      <td>${escapeHtml(p.category || "—")}</td>
      <td>${escapeHtml(STATUS_LABELS[p.status] || p.status || "Publicado")}</td>
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
      if (!(await showConfirm("Excluir esta publicação?"))) return;
      await remove(ref(db, `posts/${btn.dataset.id}`));
      showToast("Publicação excluída.", "success");
    });
  });
}

/* ---------- Modal: editar publicação ---------- */

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
  document.getElementById("epStatus").value = p.status || "publicado";
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
        redirectLink: document.getElementById("epLink").value.trim(),
        status: document.getElementById("epStatus").value
      });
      editPostModal.classList.add("is-hidden");
      showToast("Publicação atualizada!", "success");
    } catch (err) {
      showToast("Não foi possível salvar. Tente novamente.", "error");
    } finally {
      submitBtn.disabled = false;
    }
  });
}

/* ---------- Validações (comprovantes) ---------- */

/* ---------- Modal: visualizar print ---------- */

const imageModal = document.getElementById("imageModal");
const imageModalImg = document.getElementById("imageModalImg");

function openImageModal(src) {
  imageModalImg.src = src;
  imageModal.classList.remove("is-hidden");
}

document.getElementById("imageModalClose").addEventListener("click", () => {
  imageModal.classList.add("is-hidden");
  imageModalImg.src = "";
});

function renderValidationsTable() {
  const body = document.getElementById("validationsTableBody");
  const entries = Object.entries(validationsCache);

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
        <td>${v.imageBase64 ? `<button type="button" class="btn-mini" data-action="view-print" data-id="${id}">Ver print</button>` : "—"}</td>
        <td>${statusTag}</td>
        <td>
          <div class="row-actions">
            <button class="btn-mini success" data-action="approve" data-id="${id}" data-name="${escapeHtml(v.userName || v.userId || "—")}" data-uid="${v.userId || ""}" data-campaign="${v.campaignId || ""}">Aprovar</button>
            <button class="btn-mini danger" data-action="reject" data-id="${id}" data-name="${escapeHtml(v.userName || v.userId || "—")}" data-uid="${v.userId || ""}" data-campaign="${v.campaignId || ""}">Rejeitar</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action='view-print']").forEach((btn) => {
    btn.addEventListener("click", () => {
      const v = validationsCache[btn.dataset.id];
      if (v && v.imageBase64) openImageModal(v.imageBase64);
    });
  });

  body.querySelectorAll("button[data-action='approve']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id, uid, campaign, name } = btn.dataset;
      const updates = { [`validations/${id}/status`]: "aprovado" };
      if (uid) updates[`users/${uid}/myValidations/${id}/status`] = "aprovado";
      // Aprovar o comprovante ocupa a vaga na campanha de verdade.
      if (uid && campaign) updates[`campaigns/${campaign}/participants/${uid}`] = name;
      await update(ref(db), updates);
      logAction(`Aprovou o comprovante de ${name}`);
      showToast("Comprovante aprovado! Vaga preenchida na campanha.", "success");
    });
  });

  body.querySelectorAll("button[data-action='reject']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const { id, uid, campaign, name } = btn.dataset;
      const updates = { [`validations/${id}/status`]: "rejeitado" };
      if (uid) updates[`users/${uid}/myValidations/${id}/status`] = "rejeitado";
      // Se essa pessoa já tinha sido aprovada antes (admin corrigindo), libera a vaga de volta.
      if (uid && campaign) updates[`campaigns/${campaign}/participants/${uid}`] = null;
      await update(ref(db), updates);
      logAction(`Rejeitou o comprovante de ${name}`);
      showToast("Comprovante rejeitado.", "success");
    });
  });
}

/* ---------- Histórico de participantes ---------- */

function renderHistoryTable() {
  const body = document.getElementById("historyTableBody");

  const entries = Object.entries(validationsCache)
    .map(([id, v]) => ({ id, ...v }))
    .filter((v) => v.status === "aprovado")
    .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="9">Nenhuma participação aprovada ainda.</td></tr>`;
    return;
  }

  // Conta quantas vezes cada userId aparece no histórico aprovado
  const countByUser = {};
  entries.forEach((v) => {
    countByUser[v.userId] = (countByUser[v.userId] || 0) + 1;
  });

  body.innerHTML = entries.map((v) => {
    const u = usersCache[v.userId];
    const c = campaignsCache[v.campaignId];
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
          : `<button class="btn-mini" data-action="toggle-withdrawal" data-id="${v.id}" data-uid="${v.userId || ""}">Marcar saque</button>`}</td>
        <td>${resultTag}</td>
        <td>${statusTag}</td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action='toggle-withdrawal']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await update(ref(db, `validations/${btn.dataset.id}`), { withdrawalDone: true });
      if (btn.dataset.uid) {
        await update(ref(db, `users/${btn.dataset.uid}/myValidations/${btn.dataset.id}`), { withdrawalDone: true });
      }
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
  showToast("Sorteio atualizado!", "success");
});

function renderRaffleAdmin() {
  // Só preenche o formulário na primeira vez, pra não apagar o que o
  // admin está digitando se o valor mudar em tempo real vindo de outro lugar.
  if (!raffleFormPrefilled) {
    document.getElementById("rFund").value = raffleCache.fund || "";
    document.getElementById("rDate").value = raffleCache.date || "";
    document.getElementById("rWinner").value = raffleCache.winner || "";
    document.getElementById("rRules").value = raffleCache.rules || "";
    raffleFormPrefilled = true;
  }

  const body = document.getElementById("raffleTableBody");
  const list = Object.entries(raffleEntriesCache);

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
  showToast("Aviso enviado!", "success");

  e.target.reset();
  submitBtn.disabled = false;
});

function renderNotifsTable() {
  const body = document.getElementById("notifsTableBody");
  const entries = Object.entries(notifsCache).sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

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
      if (!(await showConfirm("Excluir este aviso?"))) return;
      await remove(ref(db, `notifications/${btn.dataset.id}`));
      logAction(`Excluiu o aviso "${btn.dataset.title}"`);
      showToast("Aviso excluído.", "success");
    });
  });
}

/* ---------- Auditoria ---------- */

function logAction(action) {
  push(ref(db, "auditLog"), {
    adminUid: auth.currentUser.uid,
    adminName: currentAdminName,
    action,
    timestamp: Date.now()
  }).catch(() => {});
}

function renderAuditTable() {
  const body = document.getElementById("auditTableBody");

  const entries = Object.values(auditCache)
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

function hideFeedback(el) {
  el.hidden = true;
  el.textContent = "";
}

/* ---------- Toasts ---------- */

const toastContainer = document.getElementById("toastContainer");

function showToast(message, type = "success") {
  const iconId = type === "success" ? "icon-check-circle" : "icon-alert";

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <svg class="icon"><use href="#${iconId}"></use></svg>
    <span class="toast-message">${escapeHtml(message)}</span>
  `;

  toast.addEventListener("click", () => dismissToast(toast));
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("is-visible"));

  setTimeout(() => dismissToast(toast), 4000);
}

function dismissToast(toast) {
  if (!toast.isConnected) return;
  toast.classList.remove("is-visible");
  setTimeout(() => toast.remove(), 300);
}

/* ---------- Modal de confirmação (substitui o confirm() nativo) ---------- */

const confirmModal = document.getElementById("confirmModal");
const confirmModalMessage = document.getElementById("confirmModalMessage");
const confirmModalOk = document.getElementById("confirmModalOk");
const confirmModalCancel = document.getElementById("confirmModalCancel");

/**
 * Substitui window.confirm() por um modal no mesmo estilo visual do resto
 * do painel. Retorna uma Promise<boolean> — uso: if (!(await showConfirm("..."))) return;
 */
function showConfirm(message) {
  confirmModalMessage.textContent = message;
  confirmModal.classList.remove("is-hidden");

  return new Promise((resolve) => {
    const cleanup = (result) => {
      confirmModal.classList.add("is-hidden");
      confirmModalOk.removeEventListener("click", onOk);
      confirmModalCancel.removeEventListener("click", onCancel);
      resolve(result);
    };
    const onOk = () => cleanup(true);
    const onCancel = () => cleanup(false);

    confirmModalOk.addEventListener("click", onOk);
    confirmModalCancel.addEventListener("click", onCancel);
  });
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
