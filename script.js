import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  ref,
  get,
  push,
  set,
  onValue
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// -----------------------------------------------------
// CONFIGURAÇÃO
// -----------------------------------------------------
// Número usado no botão "Chame no WhatsApp" (post tipo "somente texto").
const WHATSAPP_CONTATO_LINK =
  "https://wa.me/5568999503477?text=vim%20pelo%20o%20site%20tenho%20interesse%20em%20saber%20mais%20informa%C3%A7%C3%B5es%20sobre%20a%20plataforma%20";

// Categoria padrão criada automaticamente se o nó "categories" estiver vazio.
const CATEGORIA_PADRAO = "Pirâmides pagante";

// -----------------------------------------------------
// ESTADO LOCAL
// -----------------------------------------------------
let categorias = {};      // { categoriaId: nome }
let posts = {};           // { postId: postData }
let categoriaAtiva = "todas";
let usuarioEhAdmin = false;

// -----------------------------------------------------
// ELEMENTOS DO DOM (podem não existir em todas as páginas)
// -----------------------------------------------------
const feedEl = document.getElementById('feed');
const feedPlaceholder = document.getElementById('feed-placeholder');
const tabsEl = document.getElementById('category-tabs');
const btnNewPost = document.getElementById('btn-new-post');
const modal = document.getElementById('post-modal');
const postForm = document.getElementById('post-form');
const campoTipo = document.getElementById('post-type');
const campoCategoria = document.getElementById('post-category');
const campoNovaCategoriaWrap = document.getElementById('post-new-category-wrap');
const campoNovaCategoria = document.getElementById('post-new-category');
const campoLinkWrap = document.getElementById('post-link-wrap');
const btnFecharModal = document.getElementById('close-post-modal');
const postFormMessage = document.getElementById('post-form-message');

// Se a página não tem feed, não faz nada (evita erro em login.html/register.html).
if (feedEl) {
  iniciarFeed();
}

function iniciarFeed() {
  carregarCategorias();
  carregarPosts();
  verificarAdmin();

  if (tabsEl) {
    tabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-categoria]');
      if (!btn) return;
      categoriaAtiva = btn.dataset.categoria;
      renderizarTabs();
      renderizarFeed();
    });
  }

  if (btnNewPost) {
    btnNewPost.addEventListener('click', abrirModalNovoPost);
  }

  if (btnFecharModal) {
    btnFecharModal.addEventListener('click', fecharModal);
  }

  if (campoTipo) {
    campoTipo.addEventListener('change', atualizarCamposFormulario);
  }

  if (campoCategoria) {
    campoCategoria.addEventListener('change', () => {
      const ehNova = campoCategoria.value === '__nova__';
      if (campoNovaCategoriaWrap) {
        campoNovaCategoriaWrap.style.display = ehNova ? '' : 'none';
      }
    });
  }

  if (postForm) {
    postForm.addEventListener('submit', publicarPost);
  }
}

// -----------------------------------------------------
// CARREGAR DADOS DO FIREBASE
// -----------------------------------------------------
function carregarCategorias() {
  const categoriasRef = ref(db, 'categories');
  onValue(categoriasRef, (snapshot) => {
    categorias = snapshot.exists() ? snapshot.val() : {};

    // Cria a categoria padrão automaticamente na primeira vez.
    if (Object.keys(categorias).length === 0) {
      const novaRef = push(categoriasRef);
      set(novaRef, CATEGORIA_PADRAO);
      return; // onValue será chamado de novo com o dado atualizado.
    }

    renderizarTabs();
    preencherSelectCategorias();
  });
}

function carregarPosts() {
  const postsRef = ref(db, 'posts');
  onValue(postsRef, (snapshot) => {
    posts = snapshot.exists() ? snapshot.val() : {};
    renderizarFeed();
  });
}

function verificarAdmin() {
  onAuthStateChanged(auth, async (user) => {
    usuarioEhAdmin = false;

    if (user) {
      try {
        const snapshot = await get(ref(db, `users/${user.uid}/role`));
        usuarioEhAdmin = snapshot.exists() && snapshot.val() === 'admin';
      } catch (error) {
        console.error('Erro ao verificar permissão de admin:', error);
      }
    }

    if (btnNewPost) {
      btnNewPost.style.display = usuarioEhAdmin ? '' : 'none';
    }
  });
}

// -----------------------------------------------------
// RENDERIZAÇÃO
// -----------------------------------------------------
function renderizarTabs() {
  if (!tabsEl) return;

  const botoes = [
    `<button type="button" data-categoria="todas" class="category-tab${categoriaAtiva === 'todas' ? ' active' : ''}">Todas</button>`
  ];

  Object.entries(categorias).forEach(([id, nome]) => {
    botoes.push(
      `<button type="button" data-categoria="${id}" class="category-tab${categoriaAtiva === id ? ' active' : ''}">${escapeHtml(nome)}</button>`
    );
  });

  tabsEl.innerHTML = botoes.join('');
}

function preencherSelectCategorias() {
  if (!campoCategoria) return;

  const opcoes = Object.entries(categorias)
    .map(([id, nome]) => `<option value="${id}">${escapeHtml(nome)}</option>`)
    .join('');

  campoCategoria.innerHTML = opcoes + `<option value="__nova__">+ Nova categoria...</option>`;
}

function renderizarFeed() {
  if (!feedEl) return;

  const lista = Object.entries(posts)
    .filter(([, post]) => categoriaAtiva === 'todas' || post.categoriaId === categoriaAtiva)
    .sort((a, b) => (b[1].createdAt || 0) - (a[1].createdAt || 0));

  if (feedPlaceholder) feedPlaceholder.remove();

  if (lista.length === 0) {
    feedEl.innerHTML = `<p class="feed-placeholder">Nenhuma postagem nesta categoria ainda.</p>`;
    return;
  }

  feedEl.innerHTML = lista.map(([id, post]) => criarCardHtml(post)).join('');
}

function criarCardHtml(post) {
  const nomeCategoria = categorias[post.categoriaId] || 'Sem categoria';
  const imagens = Array.isArray(post.imagens) ? post.imagens : [];

  const imagensHtml = imagens.length
    ? `<div class="post-images">${imagens.map(url => `<img src="${escapeAttr(url)}" alt="" loading="lazy">`).join('')}</div>`
    : '';

  let botoesHtml = '';

  if (post.tipo === 'link') {
    const linkSite = post.link ? escapeAttr(post.link) : '#';
    const textoWa = encodeURIComponent(`Olá! Vi a postagem "${post.titulo || ''}" no site e quero mais informações.`);
    botoesHtml = `
      <div class="post-actions">
        <a href="${linkSite}" target="_blank" rel="noopener noreferrer" class="btn-primary">Visitar site</a>
        <a href="https://wa.me/5568999503477?text=${textoWa}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn">Falar no WhatsApp</a>
      </div>`;
  } else {
    botoesHtml = `
      <div class="post-actions">
        <a href="${WHATSAPP_CONTATO_LINK}" target="_blank" rel="noopener noreferrer" class="whatsapp-btn">Chame no WhatsApp para receber o link</a>
      </div>`;
  }

  return `
    <article class="post-card">
      <span class="post-category-tag">${escapeHtml(nomeCategoria)}</span>
      ${post.titulo ? `<h3>${escapeHtml(post.titulo)}</h3>` : ''}
      ${imagensHtml}
      ${post.texto ? `<p class="post-text">${escapeHtml(post.texto)}</p>` : ''}
      ${botoesHtml}
    </article>`;
}

// -----------------------------------------------------
// MODAL DE NOVA POSTAGEM (só visível pra admin)
// -----------------------------------------------------
function abrirModalNovoPost() {
  if (!modal) return;
  if (postForm) postForm.reset();
  if (postFormMessage) postFormMessage.textContent = '';
  atualizarCamposFormulario();
  if (campoNovaCategoriaWrap) campoNovaCategoriaWrap.style.display = 'none';
  modal.style.display = 'flex';
}

function fecharModal() {
  if (modal) modal.style.display = 'none';
}

function atualizarCamposFormulario() {
  if (!campoTipo || !campoLinkWrap) return;
  campoLinkWrap.style.display = campoTipo.value === 'link' ? '' : 'none';
}

async function publicarPost(e) {
  e.preventDefault();
  if (!usuarioEhAdmin) {
    if (postFormMessage) postFormMessage.textContent = 'Apenas administradores podem publicar.';
    return;
  }

  const tipo = campoTipo.value;
  const titulo = document.getElementById('post-title').value.trim();
  const texto = document.getElementById('post-text').value.trim();
  const link = document.getElementById('post-link').value.trim();
  const imagensRaw = document.getElementById('post-images').value.trim();
  const imagens = imagensRaw
    ? imagensRaw.split('\n').map(l => l.trim()).filter(Boolean)
    : [];

  let categoriaId = campoCategoria.value;

  try {
    // Cria categoria nova, se for o caso.
    if (categoriaId === '__nova__') {
      const nomeNova = campoNovaCategoria.value.trim();
      if (!nomeNova) {
        if (postFormMessage) postFormMessage.textContent = 'Digite o nome da nova categoria.';
        return;
      }
      const novaRef = push(ref(db, 'categories'));
      await set(novaRef, nomeNova);
      categoriaId = novaRef.key;
    }

    if (tipo === 'link' && !link) {
      if (postFormMessage) postFormMessage.textContent = 'Informe o link do site para este tipo de postagem.';
      return;
    }

    const novoPostRef = push(ref(db, 'posts'));
    await set(novoPostRef, {
      tipo,
      categoriaId,
      titulo,
      texto,
      link: tipo === 'link' ? link : null,
      imagens,
      createdAt: Date.now(),
      autorUid: auth.currentUser ? auth.currentUser.uid : null
    });

    fecharModal();
  } catch (error) {
    console.error('Erro ao publicar:', error);
    if (postFormMessage) postFormMessage.textContent = 'Erro ao publicar. Tente novamente.';
  }
}

// -----------------------------------------------------
// UTIL
// -----------------------------------------------------
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

function escapeAttr(str) {
  return (str ?? '').replace(/"/g, '&quot;');
}
