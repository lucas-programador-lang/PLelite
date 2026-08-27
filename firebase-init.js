// Inicialização única do Firebase, compartilhada por todos os módulos do site.
// auth.js, script.js e vip.html importam 'auth', 'db' e 'storage' daqui —
// NUNCA chame initializeApp() em outro arquivo, ou o Firebase lança erro de
// app duplicado.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

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

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
