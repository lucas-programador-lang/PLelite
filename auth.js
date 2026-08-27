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
  apiKey: "SUA_API_KEY",
  authDomain: "SEU_PROJETO.firebaseapp.com",
  databaseURL: "https://SEU_PROJETO-default-rtdb.firebaseio.com",
  projectId: "SEU_PROJETO",
  storageBucket: "SEU_PROJETO.appspot.com",
  messagingSenderId: "SEU_SENDER_ID",
  appId: "SEU_APP_ID"
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
    default: return 'Ocorreu um erro. Tente novamente. (' + codigo + ')';
  }
}

// -----------------------------------------------------
// LÓGICA DE CADASTRO (register.html)
// -----------------------------------------------------
const registerForm = document.getElementById('register-form');
if (registerForm) {
  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nome = document.getElementById('nome').value;
    const whatsapp = document.getElementById('whatsapp').value;
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

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

      alert('Cadastro realizado com sucesso!');
      window.location.href = 'index.html';

    } catch (error) {
      alert(traduzirErro(error.code));
    }
  });
}

// -----------------------------------------------------
// LÓGICA DE LOGIN (login.html)
// -----------------------------------------------------
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'index.html';
    } catch (error) {
      alert(traduzirErro(error.code));
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
      alert('Por favor, digite seu e-mail no campo acima para redefinir a senha.');
      return;
    }
    
    try {
      await sendPasswordResetEmail(auth, email);
      alert('Link de recuperação enviado para o seu e-mail!');
    } catch (error) {
      alert(traduzirErro(error.code));
    }
  });
}
