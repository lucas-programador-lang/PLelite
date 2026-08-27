import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase, ref, onValue, push, set } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// SUAS CONFIGURAÇÕES DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyA6LJUVIThMhRl87W10-A-wKRneohDYrJU",
  authDomain: "plelite.firebaseapp.com",
  databaseURL: "https://plelite-default-rtdb.firebaseio.com",
  projectId: "plelite",
  storageBucket: "plelite.firebasestorage.app",
  messagingSenderId: "561668288888",
  appId: "1:561668288888:web:77c9406f54c8d32255188d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Elementos da UI
const btnLogin = document.getElementById('btn-login');
const btnVip = document.getElementById('btn-vip');
const btnLogout = document.getElementById('btn-logout');
const feedContainer = document.getElementById('feed');
const totalSorteiosEl = document.getElementById('total-sorteios');
const totalPatrociniosEl = document.getElementById('total-patrocinios');

let currentUser = null;

// Verifica estado de autenticação e status VIP
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    btnLogin.style.display = 'none';
    btnLogout.style.display = 'inline-block';
    
    // Checar se é VIP
    const userRef = ref(db, 'users/' + user.uid);
    onValue(userRef, (snapshot) => {
      const userData = snapshot.val();
      if (userData && userData.isVIP) {
        btnVip.style.display = 'inline-block';
      } else {
        btnVip.style.display = 'none';
      }
    });
  } else {
    currentUser = null;
    btnLogin.style.display = 'inline-block';
    btnLogout.style.display = 'none';
    btnVip.style.display = 'none';
  }
});

// Logout
if (btnLogout) {
  btnLogout.addEventListener('click', () => {
    signOut(auth).then(() => {
      window.location.reload();
    });
  });
}

// Renderizar Estatísticas Financeiras
const financeRef = ref(db, 'financeiro');
onValue(financeRef, (snapshot) => {
  const data = snapshot.val();
  if (data) {
    totalSorteiosEl.innerText = `R$ ${data.sorteios || '0,00'}`;
    totalPatrociniosEl.innerText = `R$ ${data.patrocinios || '0,00'}`;
  }
});

// Renderizar Postagens (Feed Público)
const postsRef = ref(db, 'posts');
onValue(postsRef, (snapshot) => {
  feedContainer.innerHTML = '';
  const posts = snapshot.val();
  if (posts) {
    Object.keys(posts).reverse().forEach(key => {
      const post = posts[key];
      const card = document.createElement('div');
      card.className = 'card';
      
      let actionButton = '';
      if (post.linkDireto) {
        actionButton = `<a href="${post.linkDireto}" target="_blank" class="btn-primary">Acessar Plataforma</a>`;
      } else if (post.whatsappLink) {
        actionButton = `<a href="${post.whatsappLink}" target="_blank" class="btn-secondary">Falar no WhatsApp</a>`;
      }

      card.innerHTML = `
        <img src="${post.foto}" alt="Post" class="card-img">
        <div class="card-content">
          <span class="category-tag">${post.categoria}</span>
          <h3>${post.titulo}</h3>
          <div style="margin-top: 1rem;">
            ${actionButton}
          </div>
        </div>
      `;
      feedContainer.appendChild(card);
    });
  } else {
    feedContainer.innerHTML = '<p style="text-align:center;">Nenhuma postagem disponível.</p>';
  }
});

// Função Utilitária: Converter Imagem para Base64
async function converterParaBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result);
    reader.onerror = error => reject(error);
  });
}
