// Importações do Firebase SDK v10 (Modular)
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { 
  getAuth, 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword, 
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
  getDatabase, 
  ref, 
  set 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";

// SUAS CONFIGURAÇÕES DO FIREBASE AQUI
const firebaseConfig = {
  apiKey: "AIzaSyA6LJUVIThMhRl87W10-A-wKRneohDYrJU",
  authDomain: "plelite.firebaseapp.com",
  databaseURL: "https://plelite-default-rtdb.firebaseio.com",
  projectId: "plelite",
  storageBucket: "plelite.firebasestorage.app",
  messagingSenderId: "561668288888",
  appId: "1:561668288888:web:77c9406f54c8d32255188d"
};
// Inicialização
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Tradução de Erros do Firebase para Português
function traduzirErro(codigo) {
  switch(codigo) {
    case 'auth/email-already-in-use': return 'Este e-mail já está cadastrado.';
    case 'auth/invalid-email': return 'E-mail inválido.';
    case 'auth/weak-password': return 'A senha é muito fraca (mínimo de 6 caracteres).';
    case 'auth/user-not-found': return 'Usuário não encontrado.';
    case 'auth/wrong-password': return 'Senha incorreta.';
    case 'auth/invalid-credential': return 'Credenciais inválidas.';
    case 'auth/too-many-requests': return 'Muitas tentativas. Aguarde um pouco e tente novamente.';
    case 'auth/network-request-failed': return 'Falha de conexão. Verifique sua internet.';
    default: return 'Ocorreu um erro. Tente novamente. (' + codigo + ')';
  }
}

// Mostra mensagem numa div #form-message, se ela existir na página.
// Se não existir, cai no alert() como antes (compatibilidade com páginas antigas).
function exibirMensagem(texto, isError = true) {
  const el = document.getElementById('form-message');
  if (el) {
    el.textContent = texto;
    el.style.color = isError ? '#e05252' : '#4caf50';
  } else {
    alert(texto);
  }
}

// Ativa/desativa o botão de submit com texto de carregamento.
function setBotaoCarregando(btn, carregando, textoOriginal, textoCarregando) {
  if (!btn) return;
  btn.disabled = carregando;
  btn.textContent = carregando ? textoCarregando : textoOriginal;
}

// -----------------------------------------------------
// LÓGICA DE CADASTRO (register.html)
// -----------------------------------------------------
const registerForm = document.getElementById('register-form');
if (registerForm) {
  const submitBtn = document.getElementById('submit-btn');

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    exibirMensagem('', false);

    const nome = document.getElementById('nome').value.trim();
    const whatsapp = document.getElementById('whatsapp').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    setBotaoCarregando(submitBtn, true, 'Cadastrar', 'Cadastrando...');

    try {
      // 1. Cria o usuário no Auth
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // 2. Salva o perfil no Realtime Database com as regras solicitadas
      await set(ref(db, `users/${user.uid}`), {
        nome: nome,
        email: email,
        whatsapp: whatsapp,
        role: 'user', // Padrão
        suspended: false,
        isVIP: false  // Trava ativada, admin precisa alterar para true
      });

      exibirMensagem('Cadastro realizado com sucesso! Redirecionando...', false);
      window.location.href = 'index.html';

    } catch (error) {
      exibirMensagem(traduzirErro(error.code));
      setBotaoCarregando(submitBtn, false, 'Cadastrar', 'Cadastrando...');
    }
  });
}

// -----------------------------------------------------
// LÓGICA DE LOGIN (login.html)
// -----------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
  const loginBtn = loginForm.querySelector('button[type="submit"]');

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    exibirMensagem('', false);

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    setBotaoCarregando(loginBtn, true, 'Entrar', 'Entrando...');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'index.html';
    } catch (error) {
      exibirMensagem(traduzirErro(error.code));
      setBotaoCarregando(loginBtn, false, 'Entrar', 'Entrando...');
    }
  });
}

// -----------------------------------------------------
// LÓGICA DE REDEFINIÇÃO DE SENHA
// -----------------------------------------------------
const resetBtn = document.getElementById('reset-password');
if (resetBtn) {
  resetBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    if (!email) {
      exibirMensagem('Por favor, digite seu e-mail no campo acima para redefinir a senha.');
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, email);
      exibirMensagem('Link de recuperação enviado para o seu e-mail!', false);
    } catch (error) {
      exibirMensagem(traduzirErro(error.code));
    }
  });
}
