import { auth, db, persistenceReady, serverTimestamp } from "./firebase.js";
import { listenForAuth, renderIcons, setButtonLoading, showMessage } from "./guard.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import { doc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

listenForAuth({ requireAuth: false, redirectIfFound: "home.html" });
renderIcons();

const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const authMessage = document.querySelector("#authMessage");

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#loginButton");
  setButtonLoading(button, true);

  try {
    await persistenceReady;
    const form = new FormData(loginForm);
    await signInWithEmailAndPassword(
      auth,
      form.get("email").trim(),
      form.get("password"),
    );
    window.location.href = "home.html";
  } catch (error) {
    showMessage(authMessage, friendlyAuthError(error));
  } finally {
    setButtonLoading(button, false);
  }
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#signupButton");
  setButtonLoading(button, true);

  try {
    await persistenceReady;
    const form = new FormData(signupForm);
    const fullname = form.get("fullname").trim();
    const email = form.get("email").trim();
    const bio = form.get("bio").trim();
    const credential = await createUserWithEmailAndPassword(auth, email, form.get("password"));

    await updateProfile(credential.user, { displayName: fullname });
    await setDoc(doc(db, "users", credential.user.uid), {
      uid: credential.user.uid,
      fullname,
      email,
      bio,
      photoURL: "",
      createdAt: serverTimestamp(),
      online: true,
    });

    window.location.href = "home.html";
  } catch (error) {
    showMessage(authMessage, friendlyAuthError(error));
  } finally {
    setButtonLoading(button, false);
  }
});

function friendlyAuthError(error) {
  const messages = {
    "auth/email-already-in-use": "That email already has an account.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/weak-password": "Password should be at least 6 characters.",
  };
  return messages[error.code] || "Something went wrong. Please try again.";
}
