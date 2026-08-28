// ===================================================================
// PL ELITE — auth.js
// Usado por login.html e register.html.
// Contém a lógica do Firebase Auth + Realtime Database e também a
// interação de UI de cada página (mostrar senha, alternar telas,
// estados de carregamento e mensagens de retorno).
// ===================================================================

import { auth, db } from "./firebase-config.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  ref,
  set
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

/* ============================ FIREBASE ============================ */

/**
 * Captura o parâmetro ?ref= da URL de cadastro (link de indicação).
 * Se a pessoa chegou em register.html vinda de um link com ?ref=CODIGO,
 * isso fica salvo no perfil dela em /users/{uid}/referredBy.
 */
function getReferralCode() {
  return new URLSearchParams(window.location.search).get("ref") || null;
}

/**
 * Cria a conta no Firebase Auth e grava o registro do usuário no
 * Realtime Database em /users/{uid}, já seguindo o modelo RBAC do
 * PL ELITE: role "user" e isAuthorized false até liberação do admin.
 */
async function registerUser({ name, email, password }) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);

  await updateProfile(credential.user, { displayName: name });

  await set(ref(db, `users/${credential.user.uid}`), {
    name,
    email,
    role: "user",
    isAuthorized: false,
    isBlocked: false,
    referredBy: getReferralCode(),
    createdAt: Date.now()
  });

  return credential.user;
}

/** Autentica o usuário com e-mail e senha. */
async function loginUser({ email, password }) {
  const credential = await signInWithEmailAndPassword(auth, email, password);
  return credential.user;
}

/** Dispara o e-mail de redefinição de senha do Firebase. */
async function resetPassword({ email }) {
  await sendPasswordResetEmail(auth, email);
}

/** Traduz os códigos de erro do Firebase para mensagens em pt-BR. */
function traduzErroFirebase(code) {
  const mensagens = {
    "auth/invalid-email": "E-mail inválido.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "auth/user-not-found": "Não encontramos uma conta com este e-mail.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/invalid-credential": "E-mail ou senha incorretos.",
    "auth/email-already-in-use": "Este e-mail já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde um momento e tente novamente.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
  };
  return mensagens[code] || "Não foi possível concluir. Tente novamente.";
}

/* ============================== UI ============================== */

const feedback = document.getElementById("formFeedback");

function showFeedback(message, type = "error") {
  if (!feedback) return;
  feedback.textContent = message;
  feedback.hidden = false;
  feedback.classList.toggle("is-success", type === "success");
}

function hideFeedback() {
  if (!feedback) return;
  feedback.hidden = true;
  feedback.textContent = "";
}

function setLoading(button, loading) {
  button.disabled = loading;
  button.classList.toggle("is-loading", loading);
}

// Mostrar / ocultar senha (presente em login e cadastro)
document.querySelectorAll("[data-toggle-password]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = document.getElementById(btn.dataset.togglePassword);
    const isHidden = input.type === "password";
    input.type = isHidden ? "text" : "password";
    btn.textContent = isHidden ? "Ocultar" : "Mostrar";
  });
});

/* ---------- login.html ---------- */

const viewLogin = document.getElementById("viewLogin");

if (viewLogin) {
  const panelLogin = document.getElementById("panelLogin");
  const panelReset = document.getElementById("panelReset");
  const goToReset = document.getElementById("goToReset");
  const backToLogin = document.getElementById("backToLogin");
  const viewReset = document.getElementById("viewReset");

  goToReset.addEventListener("click", () => {
    panelLogin.classList.add("is-hidden");
    panelReset.classList.remove("is-hidden");
    hideFeedback();
  });

  backToLogin.addEventListener("click", () => {
    panelReset.classList.add("is-hidden");
    panelLogin.classList.remove("is-hidden");
    hideFeedback();
  });

  viewLogin.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideFeedback();

    const submitBtn = document.getElementById("loginSubmit");
    const email = document.getElementById("loginEmail").value.trim();
    const password = document.getElementById("loginPassword").value;

    setLoading(submitBtn, true);
    try {
      await loginUser({ email, password });
      showFeedback("Login realizado com sucesso. Redirecionando…", "success");
      window.location.href = "index.html";
    } catch (err) {
      showFeedback(traduzErroFirebase(err.code));
    } finally {
      setLoading(submitBtn, false);
    }
  });

  viewReset.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideFeedback();

    const submitBtn = document.getElementById("resetSubmit");
    const email = document.getElementById("resetEmail").value.trim();

    setLoading(submitBtn, true);
    try {
      await resetPassword({ email });
      showFeedback("Link de redefinição enviado para o seu e-mail.", "success");
    } catch (err) {
      showFeedback(traduzErroFirebase(err.code));
    } finally {
      setLoading(submitBtn, false);
    }
  });
}

/* ---------- register.html ---------- */

const viewSignup = document.getElementById("viewSignup");

if (viewSignup) {
  viewSignup.addEventListener("submit", async (event) => {
    event.preventDefault();
    hideFeedback();

    const submitBtn = document.getElementById("signupSubmit");
    const name = document.getElementById("signupName").value.trim();
    const email = document.getElementById("signupEmail").value.trim();
    const password = document.getElementById("signupPassword").value;
    const passwordConfirm = document.getElementById("signupPasswordConfirm").value;

    if (password !== passwordConfirm) {
      showFeedback("As senhas não coincidem.");
      return;
    }

    setLoading(submitBtn, true);
    try {
      await registerUser({ name, email, password });
      showFeedback("Conta criada! Aguarde a autorização de um administrador.", "success");
      viewSignup.reset();
    } catch (err) {
      showFeedback(traduzErroFirebase(err.code));
    } finally {
      setLoading(submitBtn, false);
    }
  });
}
