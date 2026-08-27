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
  adminContent.classList.remove("is-hidden");

  initTabs();
  bindUserSearch();
  loadOverview();
  loadUsers();
  loadCampaigns();
  loadPosts();
  loadValidations();
  loadRaffle();
  loadNotifications();
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
    const statusTag = u.isBlocked
      ? `<span class="status-tag status-cancelada">Bloqueado</span>`
      : u.isAuthorized
      ? `<span class="status-tag status-ativa">Autorizado</span>`
      : `<span class="status-tag status-andamento">Pendente</span>`;

    return `
      <tr>
        <td>${escapeHtml(u.name || "—")}</td>
        <td>${escapeHtml(u.email || "—")}</td>
        <td>${statusTag}</td>
        <td>${u.role === "admin" ? "Administrador" : "Usuário"}</td>
        <td>
          <div class="row-actions">
            ${!u.isAuthorized
              ? `<button class="btn-mini success" data-action="authorize" data-uid="${uid}">Autorizar</button>`
              : `<button class="btn-mini" data-action="deauthorize" data-uid="${uid}">Remover autorização</button>`}
            ${!u.isBlocked
              ? `<button class="btn-mini" data-action="block" data-uid="${uid}">Bloquear</button>`
              : `<button class="btn-mini success" data-action="unblock" data-uid="${uid}">Desbloquear</button>`}
            <button class="btn-mini danger" data-action="ban" data-uid="${uid}">Banir</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action]").forEach((btn) => {
    btn.addEventListener("click", () => handleUserAction(btn.dataset.action, btn.dataset.uid));
  });
}

async function handleUserAction(action, uid) {
  if (action === "authorize") await update(ref(db, `users/${uid}`), { isAuthorized: true });
  if (action === "deauthorize") await update(ref(db, `users/${uid}`), { isAuthorized: false });
  if (action === "block") await update(ref(db, `users/${uid}`), { isBlocked: true });
  if (action === "unblock") await update(ref(db, `users/${uid}`), { isBlocked: false });
  if (action === "ban") {
    if (!confirm("Banir este usuário remove o registro dele da plataforma. Confirmar?")) return;
    await remove(ref(db, `users/${uid}`));
  }
  loadUsers();
}

/* ---------- Campanhas ---------- */

document.getElementById("campaignForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById("campaignSubmit");
  submitBtn.disabled = true;

  const newRef = push(ref(db, "campaigns"));
  await set(newRef, {
    title: document.getElementById("cTitle").value.trim(),
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

  e.target.reset();
  submitBtn.disabled = false;
  loadCampaigns();
});

async function loadCampaigns() {
  const snap = await get(ref(db, "campaigns"));
  const campaigns = snap.exists() ? snap.val() : {};
  const body = document.getElementById("campaignsTableBody");
  const entries = Object.entries(campaigns);

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="5">Nenhuma campanha cadastrada.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([id, c]) => `
    <tr>
      <td>${escapeHtml(c.title || "—")}</td>
      <td>${c.filledSlots || 0}/${c.maxSlots || 3}</td>
      <td>
        <select class="btn-mini" data-action="status" data-id="${id}">
          ${["ativa", "andamento", "concluida", "cancelada"].map(
            (s) => `<option value="${s}" ${c.status === s ? "selected" : ""}>${s}</option>`
          ).join("")}
        </select>
      </td>
      <td>${formatDateRange(c.startDate, c.endDate)}</td>
      <td>
        <div class="row-actions">
          <button class="btn-mini" data-action="expand" data-id="${id}">+1 vaga</button>
          <button class="btn-mini danger" data-action="delete" data-id="${id}">Excluir</button>
        </div>
      </td>
    </tr>
  `).join("");

  body.querySelectorAll("select[data-action='status']").forEach((sel) => {
    sel.addEventListener("change", async () => {
      await update(ref(db, `campaigns/${sel.dataset.id}`), { status: sel.value });
    });
  });

  body.querySelectorAll("button[data-action='expand']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const c = campaigns[btn.dataset.id];
      await update(ref(db, `campaigns/${btn.dataset.id}`), { maxSlots: (c.maxSlots || 3) + 1 });
      loadCampaigns();
    });
  });

  body.querySelectorAll("button[data-action='delete']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esta campanha?")) return;
      await remove(ref(db, `campaigns/${btn.dataset.id}`));
      loadCampaigns();
    });
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
    category: document.getElementById("pCategory").value,
    description: document.getElementById("pDesc").value.trim(),
    imageUrl: document.getElementById("pImage").value.trim(),
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
  const posts = snap.exists() ? snap.val() : {};
  const body = document.getElementById("postsTableBody");
  const entries = Object.entries(posts).sort((a, b) => (b[1].date || 0) - (a[1].date || 0));

  if (entries.length === 0) {
    body.innerHTML = `<tr><td colspan="4">Nenhuma publicação ainda.</td></tr>`;
    return;
  }

  body.innerHTML = entries.map(([id, p]) => `
    <tr>
      <td>${escapeHtml(p.title || "—")}</td>
      <td>${escapeHtml(p.category || "—")}</td>
      <td>${p.date ? new Date(p.date).toLocaleDateString("pt-BR") : "—"}</td>
      <td><button class="btn-mini danger" data-action="delete-post" data-id="${id}">Excluir</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("button[data-action='delete-post']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir esta publicação?")) return;
      await remove(ref(db, `posts/${btn.dataset.id}`));
      loadPosts();
    });
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
            <button class="btn-mini success" data-action="approve" data-id="${id}">Aprovar</button>
            <button class="btn-mini danger" data-action="reject" data-id="${id}">Rejeitar</button>
          </div>
        </td>
      </tr>`;
  }).join("");

  body.querySelectorAll("button[data-action='approve']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await update(ref(db, `validations/${btn.dataset.id}`), { status: "aprovado" });
      loadValidations();
    });
  });

  body.querySelectorAll("button[data-action='reject']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      await update(ref(db, `validations/${btn.dataset.id}`), { status: "rejeitado" });
      loadValidations();
    });
  });
}

/* ---------- Bonificação / sorteio ---------- */

document.getElementById("raffleForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  await update(ref(db, "raffle"), {
    fund: Number(document.getElementById("rFund").value) || 0,
    date: document.getElementById("rDate").value,
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
  const newRef = push(ref(db, "notifications"));
  await set(newRef, {
    title: document.getElementById("nTitle").value.trim(),
    type: document.getElementById("nType").value,
    message: document.getElementById("nMessage").value.trim(),
    targetUid: target === "all" ? null : target,
    targetName: target === "all" ? "Todos" : (usersCache[target]?.name || usersCache[target]?.email || "—"),
    createdAt: Date.now()
  });

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
      <td><button class="btn-mini danger" data-action="delete-notif" data-id="${id}">Excluir</button></td>
    </tr>
  `).join("");

  body.querySelectorAll("button[data-action='delete-notif']").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!confirm("Excluir este aviso?")) return;
      await remove(ref(db, `notifications/${btn.dataset.id}`));
      loadNotifications();
    });
  });
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

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}
