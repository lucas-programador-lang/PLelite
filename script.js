// ===================================================================
// PL ELITE — script.js
// Usado apenas por index.html (dashboard).
// Protege a rota (isAuthorized), busca campanhas e métricas no
// Realtime Database e renderiza os cards.
// ===================================================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const userNameEl = document.getElementById("userName");
const logoutBtn = document.getElementById("logoutBtn");

const gatePending = document.getElementById("gatePending");
const gateBlocked = document.getElementById("gateBlocked");
const dashboardContent = document.getElementById("dashboardContent");

const metricRewards = document.getElementById("metricRewards");
const metricBonusFund = document.getElementById("metricBonusFund");
const metricActiveUsers = document.getElementById("metricActiveUsers");
const metricActiveCampaigns = document.getElementById("metricActiveCampaigns");

const activeCampaignsEl = document.getElementById("activeCampaigns");
const completedCampaignsEl = document.getElementById("completedCampaigns");
const activeCountEl = document.getElementById("activeCount");
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

  userNameEl.textContent = userData.name || user.email;
  show(dashboardContent);
  loadDashboard();
});

function show(panel) {
  [gatePending, gateBlocked, dashboardContent].forEach((p) => p.classList.add("is-hidden"));
  panel.classList.remove("is-hidden");
}

/* ---------- Carregamento dos dados ---------- */

async function loadDashboard() {
  const [campaignsSnap, metricsSnap, usersSnap] = await Promise.all([
    get(ref(db, "campaigns")),
    get(ref(db, "metrics")),
    get(ref(db, "users"))
  ]);

  renderMetrics(metricsSnap.exists() ? metricsSnap.val() : {}, usersSnap.exists() ? usersSnap.val() : {});
  renderCampaigns(campaignsSnap.exists() ? campaignsSnap.val() : {});
}

function renderMetrics(metrics, users) {
  const activeUsers = Object.values(users).filter((u) => u.isAuthorized && !u.isBlocked).length;

  metricRewards.textContent = formatCurrency(metrics.totalRewardsDistributed || 0);
  metricBonusFund.textContent = formatCurrency(metrics.bonusFund || 0);
  metricActiveUsers.textContent = activeUsers;
}

function renderCampaigns(campaignsObj) {
  const campaigns = Object.entries(campaignsObj).map(([id, c]) => ({ id, ...c }));

  const active = campaigns.filter((c) => c.status === "ativa" || c.status === "andamento");
  const completed = campaigns.filter((c) => c.status === "concluida" || c.status === "cancelada");

  metricActiveCampaigns.textContent = active.length;
  activeCountEl.textContent = `${active.length} campanha${active.length === 1 ? "" : "s"}`;
  completedCountEl.textContent = `${completed.length} campanha${completed.length === 1 ? "" : "s"}`;

  renderGrid(activeCampaignsEl, active, "Nenhuma campanha ativa no momento.");
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

  const filled = c.filledSlots || 0;
  const max = c.maxSlots || 3;
  const pct = Math.min(100, Math.round((filled / max) * 100));

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
  `;

  return card;
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
