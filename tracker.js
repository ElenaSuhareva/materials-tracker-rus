import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut
} from "https://www.gstatic.com/firebasejs/12.17.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBu3pE0y6T_HE1n7NdU41RgEmRDy4T0Xes",
  authDomain: "materials-tracker-rus.firebaseapp.com",
  projectId: "materials-tracker-rus",
  storageBucket: "materials-tracker-rus.firebasestorage.app",
  messagingSenderId: "629436061135",
  appId: "1:629436061135:web:6cefa2a375803abfb3aeba"
};

const auth = getAuth(initializeApp(firebaseConfig));
const els = Object.fromEntries(
  [
    "loginView",
    "accountView",
    "loginForm",
    "email",
    "password",
    "loginButton",
    "loginError",
    "userLogin",
    "logoutButton",
    "logoutError"
  ].map(id => [id, document.getElementById(id)])
);

function loginErrorMessage(error) {
  switch (error?.code) {
    case "auth/invalid-email":
      return "Введите корректный адрес электронной почты.";
    case "auth/missing-password":
      return "Введите пароль.";
    case "auth/invalid-credential":
    case "auth/user-not-found":
    case "auth/wrong-password":
      return "Неверный логин или пароль.";
    case "auth/too-many-requests":
      return "Слишком много попыток входа. Попробуйте немного позже.";
    case "auth/network-request-failed":
      return "Не удалось подключиться к сервису входа. Проверьте интернет-соединение.";
    default:
      return "Не удалось выполнить вход. Попробуйте ещё раз.";
  }
}

function setLoginPending(isPending) {
  els.loginButton.disabled = isPending;
  els.loginButton.textContent = isPending ? "Вхожу…" : "Войти";
}

onAuthStateChanged(auth, user => {
  els.loginView.hidden = Boolean(user);
  els.accountView.hidden = !user;
  els.userLogin.textContent = user?.email ?? "";
  els.loginError.textContent = "";
  els.logoutError.textContent = "";
  setLoginPending(false);
});

els.loginForm.addEventListener("submit", async event => {
  event.preventDefault();
  els.loginError.textContent = "";
  setLoginPending(true);

  try {
    await signInWithEmailAndPassword(
      auth,
      els.email.value.trim(),
      els.password.value
    );
    els.loginForm.reset();
  } catch (error) {
    els.loginError.textContent = loginErrorMessage(error);
    setLoginPending(false);
  }
});

els.logoutButton.addEventListener("click", async () => {
  els.logoutButton.disabled = true;
  els.logoutError.textContent = "";

  try {
    await signOut(auth);
  } catch (error) {
    console.error("Не удалось выполнить выход:", error);
    els.logoutError.textContent = "Не удалось выйти. Попробуйте ещё раз.";
  } finally {
    els.logoutButton.disabled = false;
  }
});
