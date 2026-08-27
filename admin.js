// URL do seu Cloudflare Worker (Definido no Prompt 4)
const WORKER_URL = "https://seu-worker.seu-subdominio.workers.dev";
// Token JWT do Admin (Para validação no Worker)
const ADMIN_TOKEN = "seu_token_jwt_de_admin_aqui";

// Headers padrão para comunicação com o Worker
const requestHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${ADMIN_TOKEN}`
};

// =====================================
// POSTAGENS
// =====================================
document.getElementById('form-post').addEventListener('submit', async (e) => {
  e.preventDefault();
  const titulo = document.getElementById('post-titulo').value;
  const foto = document.getElementById('post-foto').value;
  const categoria = document.getElementById('post-categoria').value;
  const formato = parseInt(document.getElementById('post-formato').value);
  const link = document.getElementById('post-link').value;

  try {
    const res = await fetch(`${WORKER_URL}/admin/create-post`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ titulo, foto, categoria, formato, link })
    });
    const data = await res.json();
    alert(data.message || "Ação concluída.");
  } catch (error) {
    alert("Erro ao criar post: " + error);
  }
});

// =====================================
// CRIAR PATROCÍNIO
// =====================================
document.getElementById('form-sponsor').addEventListener('submit', async (e) => {
  e.preventDefault();
  const projeto = document.getElementById('sponsor-projeto').value;
  const quandoSacar = document.getElementById('sponsor-sacar').value;
  const quantoDevolver = document.getElementById('sponsor-devolver').value;

  try {
    const res = await fetch(`${WORKER_URL}/admin/create-sponsorship`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ projeto, quandoSacar, quantoDevolver })
    });
    const data = await res.json();
    alert(data.message || "Patrocínio criado!");
  } catch (error) {
    alert("Erro ao criar patrocínio.");
  }
});

// =====================================
// BURLAR LIMITE DE VAGAS
// =====================================
document.getElementById('btn-override').addEventListener('click', async () => {
  const sponsorshipId = document.getElementById('override-id').value;
  const novoLimite = parseInt(document.getElementById('override-limit').value);

  if (!sponsorshipId || !novoLimite) return alert('Preencha ID e Novo Limite.');

  try {
    const res = await fetch(`${WORKER_URL}/admin/override-slots`, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify({ sponsorshipId, novoLimite })
    });
    const data = await res.json();
    alert(data.message || "Exceção aplicada com sucesso.");
  } catch (error) {
    alert("Erro ao aplicar exceção.");
  }
});
