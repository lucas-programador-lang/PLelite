// ===================================================================
// PL ELITE — Configuração do Firebase
// Substitua os valores abaixo pelos dados do seu projeto Firebase
// (Console Firebase > Configurações do projeto > Seus apps > SDK config)
// ===================================================================

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyA6LJUVIThMhRl87W10-A-wKRneohDYrJU",
  authDomain: "plelite.firebaseapp.com",
  databaseURL: "https://plelite-default-rtdb.firebaseio.com",
  projectId: "plelite",
  storageBucket: "plelite.firebasestorage.app",
  messagingSenderId: "561668288888",
  appId: "1:561668288888:web:77c9406f54c8d32255188d"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
