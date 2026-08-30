// ===================================================================
// PL ELITE — script.js
// Usado apenas por index.html (dashboard).
// Protege a rota (isAuthorized), busca campanhas, publicações e
// métricas no Realtime Database e renderiza os cards.
// ===================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get, push, set, update } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

const gatePending = document.getElementById("gatePending");
const gateBlocked = document.getElementById("gateBlocked");
const dashboardContent = document.getElementById("dashboardContent");

const metricRewards = document.getElementById("metricRewards");
const metricBonusFund = document.getElementById("metricBonusFund");
const metricActiveUsers = document.getElementById("metricActiveUsers");
const metricActiveCampaigns = document.getElementById("metricActiveCampaigns");

const raffleInfoEl = document.getElementById("raffleInfo");
const postsGridEl = document.getElementById("postsGrid");
const postsCountEl = document.getElementById("postsCount");

const activeCampaignsEl = document.getElementById("activeCampaigns");
const andamentoCampaignsEl = document.getElementById("andamentoCampaigns");
const completedCampaignsEl = document.getElementById("completedCampaigns");
const activeCountEl = document.getElementById("activeCount");
const andamentoCountEl = document.getElementById("andamentoCount");
const completedCountEl = document.getElementById("completedCount");

const STATUS_LABELS = {
  ativa: "Ativa",
  andamento: "Em andamento",
  concluida: "Meta atingida",
  cancelada: "Cancelada"
};

const STATUS_CLASSES = {
  ativa: "status-ativa",
  andamento: "status-andamento",
  concluida: "status-concluida",
  cancelada: "status-cancelada"
};

const POST_CATEGORY_LABELS = {
  destaque: "Campanhas em Destaque",
  oportunidades: "Oportunidades",
  andamento: "Em Andamento",
  concluidas: "Concluídas"
};

const GENERIC_WHATSAPP_URL = "https://wa.me/5568999503477?text=vim%20pelo%20o%20site%20tenho%20interesse%20em%20saber%20mais%20informa%C3%A7%C3%B5es%20sobre%20a%20plataforma";

let currentUser = null;
let currentUserName = "";
let currentUserReferredBy = null;

/* ---------- Sidebar (navegação entre "páginas" + gaveta no mobile) ---------- */

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

document.querySelectorAll(".sidebar-link[data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".sidebar-link[data-view]").forEach((b) => b.classList.remove("is-active"));
    document.querySelectorAll(".app-view").forEach((v) => v.classList.remove("is-active"));
    btn.classList.add("is-active");
    document.getElementById(`view-${btn.dataset.view}`).classList.add("is-active");
    closeSidebar();
  });
});

/* ---------- Guarda de rota ---------- */

logoutBtn.addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "login.html";
    return;
  }

  const userSnap = await get(ref(db, `users/${user.uid}`));
  const userData = userSnap.exists() ? userSnap.val() : null;

  if (!userData || userData.isBlocked) {
    show(gateBlocked);
    return;
  }

  if (!userData.isAuthorized) {
    show(gatePending);
    return;
  }

  currentUser = user;
  currentUserName = userData.name || user.email;
  currentUserReferredBy = userData.referredBy || null;
  userNameEl.textContent = currentUserName;
  show(dashboardContent);
  loadDashboard();
  loadPosts();
  loadRaffleInfo();
  loadNotifications();
  loadMyAccount(userData);
});

function show(panel) {
  [gatePending, gateBlocked, dashboardContent].forEach((p) => p.classList.add("is-hidden"));
  panel.classList.remove("is-hidden");
}

/* ---------- Carregamento dos dados ---------- */

async function loadDashboard() {
  const [campaignsSnap, metricsSnap] = await Promise.all([
    get(ref(db, "campaigns")),
    get(ref(db, "metrics"))
  ]);

  renderMetrics(metricsSnap.exists() ? metricsSnap.val() : {}, campaignsSnap.exists() ? campaignsSnap.val() : {});
  renderCampaigns(campaignsSnap.exists() ? campaignsSnap.val() : {});
}

function renderMetrics(metrics, campaignsObj) {
  const campaigns = Object.values(campaignsObj);

  // Total pago em patrocínios: soma do orçamento das campanhas já finalizadas
  // (com resultado registrado, 🟢 ou 🔴) — dinheiro que já foi de fato pago.
  const totalPago = campaigns
    .filter((c) => c.result)
    .reduce((sum, c) => sum + (c.budget || 0), 0);

  // Usuários participantes: contagem de pessoas distintas presentes em
  // "participants" de qualquer campanha (dado real, não estimado).
  const participantUids = new Set();
  campaigns.forEach((c) => {
    if (c.participants) Object.keys(c.participants).forEach((uid) => participantUids.add(uid));
  });

  metricRewards.textContent = formatCurrency(totalPago);
  metricBonusFund.textContent = formatCurrency(metrics.bonusFund || 0);
  metricActiveUsers.textContent = participantUids.size;
}

function renderCampaigns(campaignsObj) {
  const campaigns = Object.entries(campaignsObj)
    .map(([id, c]) => ({ id, ...c }))
    // Esconde campanhas restritas a um grupo específico de usuários (definido
    // pelo admin em "Visível só para") de quem não está na lista. Isso é
    // filtro de interface, não trava de banco — ver aviso no chat.
    .filter((c) => !c.visibleTo || c.visibleTo[currentUser.uid]);

  const active = campaigns.filter((c) => c.status === "ativa");
  const andamento = campaigns.filter((c) => c.status === "andamento");
  const completed = campaigns.filter((c) => c.status === "concluida" || c.status === "cancelada");

  metricActiveCampaigns.textContent = active.length + andamento.length;
  activeCountEl.textContent = `${active.length} campanha${active.length === 1 ? "" : "s"}`;
  andamentoCountEl.textContent = `${andamento.length} campanha${andamento.length === 1 ? "" : "s"}`;
  completedCountEl.textContent = `${completed.length} campanha${completed.length === 1 ? "" : "s"}`;

  renderGrid(activeCampaignsEl, active, "Nenhuma campanha ativa no momento.");
  renderGrid(andamentoCampaignsEl, andamento, "Nenhuma campanha em andamento no momento.");
  renderGrid(completedCampaignsEl, completed, "Nenhuma campanha concluída ainda.");
}

function renderGrid(container, campaigns, emptyMessage) {
  container.innerHTML = "";

  if (campaigns.length === 0) {
    container.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  campaigns.forEach((c) => container.appendChild(buildCampaignCard(c)));
}

function buildCampaignCard(c) {
  const card = document.createElement("article");
  card.className = "campaign-card";

  const filled = c.participants ? Object.keys(c.participants).length : (c.filledSlots || 0);
  const max = c.maxSlots || 3;
  const pct = Math.min(100, Math.round((filled / max) * 100));
  const isActive = c.status === "ativa" || c.status === "andamento";

  const statusClass = STATUS_CLASSES[c.status] || "status-ativa";
  const statusLabel = STATUS_LABELS[c.status] || c.status;

  const whatsappHref = c.whatsappNumber
    ? `https://wa.me/${c.whatsappNumber}?text=${encodeURIComponent(c.whatsappMessage || "Tenho interesse nesta campanha")}`
    : c.redirectLink || "#";

  card.innerHTML = `
    <div class="campaign-top">
      <div>
        <span class="campaign-category">${escapeHtml(c.category || "CAMPANHA")}</span>
        <h3 class="campaign-title">${escapeHtml(c.title || "Sem título")}</h3>
      </div>
      <span class="status-tag ${statusClass}">${escapeHtml(statusLabel)}</span>
    </div>

    <p class="campaign-desc">${escapeHtml(c.description || "")}</p>
    ${c.machines ? `<p style="font-size:11.5px;color:var(--text-muted);margin:-4px 0 0;">🛠️ Máquinas/planos: ${escapeHtml(c.machines)}</p>` : ""}

    <div class="campaign-progress">
      <div class="campaign-progress-bar" style="width:${pct}%"></div>
    </div>
    <div class="campaign-meta">
      <span>${filled}/${max} vagas</span>
      <span>${formatDateRange(c.startDate, c.endDate)}</span>
    </div>

    <div class="campaign-actions">
      <a class="btn-whatsapp" href="${whatsappHref}" target="_blank" rel="noopener">Participar via WhatsApp</a>
    </div>
    ${isActive ? `<button type="button" class="btn-mini btn-block" data-action="send-proof" data-id="${c.id}" data-title="${escapeHtml(c.title || "")}">Enviar comprovante</button>` : ""}
  `;

  return card;
}

/* ---------- Sorteio ---------- */

async function loadRaffleInfo() {
  const [raffleSnap, entriesSnap, campaignsSnap] = await Promise.all([
    get(ref(db, "raffle")),
    get(ref(db, "raffleEntries")),
    get(ref(db, "campaigns"))
  ]);

  const raffle = raffleSnap.exists() ? raffleSnap.val() : {};
  const entriesObj = entriesSnap.exists() ? entriesSnap.val() : {};
  const entries = Object.values(entriesObj);
  const isEligible = !!currentUserReferredBy;
  const alreadyEntered = !!entriesObj[currentUser.uid];

  // "Quem participou do sorteio" (raffleEntries) é diferente de "quem foi
  // patrocinado" (participants em qualquer campaign) — dados distintos.
  const campaigns = campaignsSnap.exists() ? Object.values(campaignsSnap.val()) : [];
  const patrocinadosSet = new Set();
  campaigns.forEach((c) => {
    if (c.participants) Object.values(c.participants).forEach((name) => patrocinadosSet.add(name));
  });
  const patrocinadosList = patrocinadosSet.size
    ? [...patrocinadosSet].map((n) => escapeHtml(n)).join(", ")
    : "Ninguém patrocinado ainda.";

  const participantsList = entries.length
    ? entries.map((u) => escapeHtml(u.name || u.email || "—")).join(", ")
    : "Ninguém participando do sorteio ainda.";

  const joinButton = alreadyEntered
    ? `<span class="status-tag status-ativa" style="display:inline-block;margin-top:8px;">Você já está participando</span>`
    : isEligible
    ? `<button type="button" class="btn-mini success" id="raffleJoinBtn" style="margin-top:8px;">Participar do sorteio</button>`
    : "";

  raffleInfoEl.innerHTML = `
    <div class="metric-card">
      <span class="metric-label">VALOR ARRECADADO</span>
      <span class="metric-value">${formatCurrency(raffle.fund || 0)}</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">DATA DO SORTEIO</span>
      <span class="metric-value" style="font-size:19px;">${raffle.date ? new Date(raffle.date).toLocaleDateString("pt-BR") : "A definir"}</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">RESULTADO</span>
      <span class="metric-value" style="font-size:19px;">${raffle.winner ? escapeHtml(raffle.winner) : "Ainda não realizado"}</span>
    </div>
    <div class="metric-card">
      <span class="metric-label">SUA ELEGIBILIDADE</span>
      <span class="status-tag ${isEligible ? "status-ativa" : "status-cancelada"}" style="display:inline-block;">
        ${isEligible ? "Elegível" : "Não elegível"}
      </span>
      ${!isEligible ? `<p style="font-size:11px;color:var(--text-muted);margin:8px 0 0;">Somente quem entrou pelo link de indicação participa.</p>` : ""}
      ${joinButton}
    </div>
    <div class="metric-card" style="grid-column:1 / -1;">
      <span class="metric-label">QUEM PARTICIPOU DO SORTEIO</span>
      <span style="font-size:12.5px;color:var(--text-muted);display:block;margin-top:6px;">${participantsList}</span>
    </div>
    <div class="metric-card" style="grid-column:1 / -1;">
      <span class="metric-label">QUEM FOI PATROCINADO</span>
      <span style="font-size:12.5px;color:var(--text-muted);display:block;margin-top:6px;">${patrocinadosList}</span>
    </div>
    <div class="metric-card" style="grid-column:1 / -1;">
      <span class="metric-label">REGRAS</span>
      <span style="font-size:12.5px;color:var(--text-muted);display:block;margin-top:6px;">${raffle.rules ? escapeHtml(raffle.rules) : "A definir pelo administrador."}</span>
    </div>
  `;

  const joinBtn = document.getElementById("raffleJoinBtn");
  if (joinBtn) {
    joinBtn.addEventListener("click", async () => {
      joinBtn.disabled = true;
      try {
        await set(ref(db, `raffleEntries/${currentUser.uid}`), {
          name: currentUserName,
          email: currentUser.email,
          joinedAt: Date.now()
        });
        loadRaffleInfo();
      } catch (err) {
        joinBtn.disabled = false;
      }
    });
  }
}

/* ---------- Minha Conta ---------- */

function loadMyAccount(userData) {
  document.getElementById("accName").value = userData.name || "";
  document.getElementById("accEmail").value = userData.email || "";
  loadMyHistory();
}

document.getElementById("accountForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const feedback = document.getElementById("accountFeedback");
  const submitBtn = document.getElementById("accountSubmit");
  feedback.hidden = true;
  submitBtn.disabled = true;

  const newName = document.getElementById("accName").value.trim();
  const newEmail = document.getElementById("accEmail").value.trim();

  try {
    await update(ref(db, `users/${currentUser.uid}`), { name: newName, email: newEmail });
    currentUserName = newName;
    userNameEl.textContent = newName;
    feedback.textContent = "Dados atualizados!";
    feedback.hidden = false;
    feedback.classList.add("is-success");
  } catch (err) {
    feedback.textContent = "Não foi possível salvar. Tente novamente.";
    feedback.hidden = false;
    feedback.classList.remove("is-success");
  } finally {
    submitBtn.disabled = false;
  }
});

async function loadMyHistory() {
  const snap = await get(ref(db, `users/${currentUser.uid}/myValidations`));
  const validations = snap.exists() ? snap.val() : {};
  const listEl = document.getElementById("myHistoryList");

  const mine = Object.values(validations).sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));

  if (mine.length === 0) {
    listEl.innerHTML = `<p class="empty-state">Você ainda não enviou nenhum comprovante.</p>`;
    return;
  }

  const STATUS_LABELS = {
    aprovado: `<span class="status-tag status-ativa">Aprovado</span>`,
    rejeitado: `<span class="status-tag status-cancelada">Rejeitado</span>`,
    pendente: `<span class="status-tag status-andamento">Pendente</span>`
  };

  listEl.innerHTML = mine.map((v) => `
    <div class="campaign-card" style="margin-bottom:10px;">
      <div class="campaign-top">
        <h3 class="campaign-title" style="font-size:15px;">${escapeHtml(v.campaignTitle || "—")}</h3>
        ${v.participantFinalized
          ? `<span class="status-tag status-concluida">✅ FINALIZADO</span>`
          : (STATUS_LABELS[v.status] || STATUS_LABELS.pendente)}
      </div>
      <div class="campaign-meta">
        <span>${v.startDate ? new Date(v.startDate).toLocaleDateString("pt-BR") : "—"} — ${v.endDate ? new Date(v.endDate).toLocaleDateString("pt-BR") : "—"}</span>
        <span>${v.withdrawalDone ? "Saque feito" : "Saque pendente"}</span>
      </div>
    </div>
  `).join("");
}

/* ---------- Publicações ---------- */

async function loadPosts() {
  const snap = await get(ref(db, "posts"));
  const posts = snap.exists() ? snap.val() : {};
  const entries = Object.entries(posts)
    .map(([id, p]) => ({ id, ...p }))
    .filter((p) => !p.status || p.status === "publicado")
    .sort((a, b) => (b.date || 0) - (a.date || 0));

  postsCountEl.textContent = `${entries.length} publicaç${entries.length === 1 ? "ão" : "ões"}`;
  postsGridEl.innerHTML = "";

  if (entries.length === 0) {
    postsGridEl.innerHTML = `<p class="empty-state">Nenhuma publicação por enquanto.</p>`;
    return;
  }

  entries.forEach((p) => postsGridEl.appendChild(buildPostCard(p)));
}

function buildPostCard(p) {
  const card = document.createElement("article");
  card.className = "campaign-card";

  const images = p.images || (p.imageUrl ? [p.imageUrl] : []);
  const categoryLabel = POST_CATEGORY_LABELS[p.category] || p.category || "PUBLICAÇÃO";
  const date = p.date ? new Date(p.date).toLocaleDateString("pt-BR") : "";

  card.innerHTML = `
    <div class="campaign-top">
      <div>
        <span class="campaign-category">${escapeHtml(categoryLabel)}</span>
        <h3 class="campaign-title">${escapeHtml(p.title || "Sem título")}</h3>
      </div>
    </div>

    ${images[0] ? `<img src="${escapeHtml(images[0])}" alt="${escapeHtml(p.title || "")}" style="width:100%;border-radius:var(--radius-md);display:block;">` : ""}

    <p class="campaign-desc">${escapeHtml(p.description || "")}</p>

    <div class="campaign-meta">
      <span>${date}</span>
    </div>

    <div class="campaign-actions">
      ${p.redirectLink ? `<a class="btn-whatsapp" href="${escapeHtml(p.redirectLink)}" target="_blank" rel="noopener">Ver plataforma</a>` : ""}
      <a class="btn-whatsapp" href="${GENERIC_WHATSAPP_URL}" target="_blank" rel="noopener">Chamar no WhatsApp</a>
    </div>
  `;

  return card;
}

/* ---------- Modal: enviar comprovante ---------- */

const proofModal = document.getElementById("proofModal");
const proofForm = document.getElementById("proofForm");
const proofCampaignTitle = document.getElementById("proofCampaignTitle");
const proofFeedback = document.getElementById("proofFeedback");
const proofCancel = document.getElementById("proofCancel");

let proofCampaignId = null;

document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action='send-proof']");
  if (!btn) return;
  proofCampaignId = btn.dataset.id;
  proofCampaignTitle.textContent = btn.dataset.title;
  hideProofFeedback();
  proofForm.reset();
  proofModal.classList.remove("is-hidden");
});

proofCancel.addEventListener("click", () => proofModal.classList.add("is-hidden"));

proofForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideProofFeedback();

  const submitBtn = document.getElementById("proofSubmit");
  const fileInput = document.getElementById("proofFile");
  const file = fileInput.files[0];

  if (!file) {
    showProofFeedback("Selecione uma imagem do comprovante.");
    return;
  }

  submitBtn.disabled = true;
  submitBtn.classList.add("is-loading");

  try {
    const imageBase64 = await fileToBase64(file);

    const newRef = push(ref(db, "validations"));
    const campaignTitleValue = proofCampaignTitle.textContent;
    const startDateValue = document.getElementById("proofStart").value;
    const endDateValue = document.getElementById("proofEnd").value;

    await set(newRef, {
      userId: currentUser.uid,
      userName: currentUserName,
      campaignId: proofCampaignId,
      campaignTitle: campaignTitleValue,
      startDate: startDateValue,
      endDate: endDateValue,
      notes: document.getElementById("proofNotes").value.trim(),
      imageBase64,
      status: "pendente",
      submittedAt: Date.now()
    });

    // Cópia mínima no próprio perfil do usuário — permite que ele veja seu
    // histórico sem precisar de acesso de leitura ao node /validations
    // inteiro (que é reservado ao admin nas Rules).
    await set(ref(db, `users/${currentUser.uid}/myValidations/${newRef.key}`), {
      campaignTitle: campaignTitleValue,
      startDate: startDateValue,
      endDate: endDateValue,
      status: "pendente",
      submittedAt: Date.now()
    });

    showProofFeedback("Comprovante enviado! Aguarde a validação do administrador.", "success");
    setTimeout(() => proofModal.classList.add("is-hidden"), 1400);
  } catch (err) {
    showProofFeedback("Não foi possível enviar o comprovante. Tente novamente.");
  } finally {
    submitBtn.disabled = false;
    submitBtn.classList.remove("is-loading");
  }
});

function showProofFeedback(message, type = "error") {
  proofFeedback.textContent = message;
  proofFeedback.hidden = false;
  proofFeedback.classList.toggle("is-success", type === "success");
}

function hideProofFeedback() {
  proofFeedback.hidden = true;
  proofFeedback.textContent = "";
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/* ---------- Notificações ---------- */

const notifBell = document.getElementById("notifBell");
const notifBadge = document.getElementById("notifBadge");
const notifPanel = document.getElementById("notifPanel");
const notifList = document.getElementById("notifList");

const NOTIF_TYPE_LABELS = {
  resgate: "Resgate de recompensa",
  plano: "Plano a utilizar",
  prazo: "Prazo de entrega",
  aviso: "Instrução do admin"
};

notifBell.addEventListener("click", () => {
  const willOpen = notifPanel.classList.contains("is-hidden");
  notifPanel.classList.toggle("is-hidden");
  if (willOpen) markAllAsRead();
});

document.addEventListener("click", (e) => {
  if (!notifPanel.contains(e.target) && !notifBell.contains(e.target) && !notifPanel.classList.contains("is-hidden")) {
    notifPanel.classList.add("is-hidden");
  }
});

async function loadNotifications() {
  const snap = await get(ref(db, "notifications"));
  const all = snap.exists() ? snap.val() : {};

  const mine = Object.entries(all)
    .filter(([, n]) => !n.targetUid || n.targetUid === currentUser.uid)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  renderNotifications(mine);
}

function renderNotifications(entries) {
  if (entries.length === 0) {
    notifList.innerHTML = `<p class="notif-empty">Nenhum aviso por enquanto.</p>`;
    updateBadge(0);
    return;
  }

  const unreadCount = entries.filter(([, n]) => !(n.readBy && n.readBy[currentUser.uid])).length;
  updateBadge(unreadCount);

  notifList.innerHTML = entries.map(([id, n]) => {
    const isUnread = !(n.readBy && n.readBy[currentUser.uid]);
    const date = n.createdAt ? new Date(n.createdAt).toLocaleDateString("pt-BR") : "";
    return `
      <div class="notif-item ${isUnread ? "is-unread" : ""}">
        <div class="notif-item-top">
          <span class="notif-item-title">${escapeHtml(NOTIF_TYPE_LABELS[n.type] || "Aviso")}: ${escapeHtml(n.title || "")}</span>
          <span class="notif-item-date">${date}</span>
        </div>
        <p class="notif-item-msg">${escapeHtml(n.message || "")}</p>
      </div>`;
  }).join("");

  window.__notifEntries = entries;
}

function updateBadge(count) {
  if (count > 0) {
    notifBadge.textContent = count > 9 ? "9+" : count;
    notifBadge.classList.remove("is-hidden");
  } else {
    notifBadge.classList.add("is-hidden");
  }
}

async function markAllAsRead() {
  const entries = window.__notifEntries || [];
  const unread = entries.filter(([, n]) => !(n.readBy && n.readBy[currentUser.uid]));
  if (unread.length === 0) return;

  await Promise.all(unread.map(([id]) => set(ref(db, `notifications/${id}/readBy/${currentUser.uid}`), true)));
  updateBadge(0);
  document.querySelectorAll(".notif-item.is-unread").forEach((el) => el.classList.remove("is-unread"));
}

/* ---------- Utilitários ---------- */

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function formatDateRange(start, end) {
  if (!start && !end) return "";
  const opts = { day: "2-digit", month: "2-digit" };
  const s = start ? new Date(start).toLocaleDateString("pt-BR", opts) : "?";
  const e = end ? new Date(end).toLocaleDateString("pt-BR", opts) : "?";
  return `${s} — ${e}`;
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
