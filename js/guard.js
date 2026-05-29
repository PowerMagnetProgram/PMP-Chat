import { auth, db, onAuthStateChanged, serverTimestamp } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";
import {
  doc,
  getDoc,
  setDoc,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";

export function listenForAuth({ requireAuth = true, redirectIfFound = "", onReady } = {}) {
  return onAuthStateChanged(auth, async (user) => {
    try {
      if (requireAuth && !user) {
        window.location.href = "index.html";
        return;
      }

      if (!requireAuth && user && redirectIfFound) {
        window.location.href = redirectIfFound;
        return;
      }

      if (user && requireAuth) {
        await ensureUserProfile(user);
        await markOnline(user, true);
        window.addEventListener("beforeunload", () => {
          markOnline(user, false);
        });
      }

      if (onReady) {
        await onReady(user);
      }
    } catch (error) {
      console.error("Authentication guard failed", error);
      if (onReady) {
        await onReady(user, error);
      }
    }
  });
}

export function renderIcons() {
  document.querySelectorAll(".fa-solid").forEach((icon) => {
    icon.setAttribute("aria-hidden", "true");
  });
}

export async function getUserProfile(uid) {
  const snapshot = await getDoc(doc(db, "users", uid));
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null;
}

export async function ensureUserProfile(user) {
  if (!user) return null;
  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    return { id: snapshot.id, ...snapshot.data() };
  }

  const fallbackProfile = {
    uid: user.uid,
    fullname: user.displayName || user.email?.split("@")[0] || "New User",
    email: user.email || "",
    bio: "No bio yet.",
    photoURL: user.photoURL || "",
    createdAt: serverTimestamp(),
    online: true,
  };

  await setDoc(userRef, fallbackProfile);
  return fallbackProfile;
}

export async function markOnline(userOrUid, online) {
  const uid = typeof userOrUid === "string" ? userOrUid : userOrUid?.uid;
  if (!uid) return;

  const payload = {
    online,
    lastSeen: serverTimestamp(),
  };

  if (typeof userOrUid !== "string") {
    payload.uid = userOrUid.uid;
    payload.email = userOrUid.email || "";
  }

  try {
    await setDoc(doc(db, "users", uid), payload, { merge: true });
  } catch (error) {
    console.error("Unable to update online status", error);
  }
}

export function setupLogoutButtons() {
  document.querySelectorAll(".logout-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        if (auth.currentUser) {
          await markOnline(auth.currentUser, false);
        }
        await signOut(auth);
        window.location.href = "index.html";
      } catch (error) {
        console.error("Logout failed", error);
        alert("Unable to logout. Please try again.");
      }
    });
  });
}

export function initials(name = "") {
  const value = name.trim() || "User";
  return value
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function formatTime(timestamp) {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date();
  return new Intl.DateTimeFormat(undefined, {
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

export function showMessage(element, text, type = "error") {
  if (!element) return;
  element.textContent = text;
  element.classList.toggle("success", type === "success");
  element.classList.remove("hidden");
}

export function setButtonLoading(button, isLoading) {
  if (!button) return;
  button.disabled = isLoading;
  button.querySelector(".btn-label")?.classList.toggle("hidden", isLoading);
  button.querySelector(".loader")?.classList.toggle("hidden", !isLoading);
}

export function emptyState(title, text) {
  return `
    <div class="empty-state">
      <i class="fa-solid fa-comment-slash"></i>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}
