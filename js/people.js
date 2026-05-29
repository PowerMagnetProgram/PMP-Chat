import { auth, db } from "./firebase.js";
import {
  collection,
  onSnapshot,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  emptyState,
  escapeHtml,
  getUserProfile,
  initials,
  listenForAuth,
  renderIcons,
  setupLogoutButtons,
} from "./guard.js";

const peopleList = document.querySelector("#peopleList");
const searchInput = document.querySelector("#searchInput");
const mobileHeaderAvatar = document.querySelector("#mobileHeaderAvatar");
const mobileHeaderName = document.querySelector("#mobileHeaderName");
const mobileHeaderEmail = document.querySelector("#mobileHeaderEmail");
let allUsers = [];

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user, guardError) {
    if (guardError) {
      peopleList.innerHTML = emptyState("Unable to load people", "Check that your Firestore rules are published and refresh the page.");
      renderIcons();
      return;
    }

    const profile = await getUserProfile(user.uid);
    mobileHeaderAvatar.textContent = initials(profile?.fullname || user.email || "User");
    mobileHeaderName.textContent = profile?.fullname || "PulseChat";
    mobileHeaderEmail.textContent = profile?.email || user.email || "Online";

    const loadingTimer = window.setTimeout(() => {
      peopleList.innerHTML = emptyState("Still loading people", "Refresh the page. If this stays here, check the browser console for a Firestore permission error.");
      renderIcons();
    }, 8000);

    onSnapshot(collection(db, "users"), (snapshot) => {
      window.clearTimeout(loadingTimer);
      allUsers = snapshot.docs
        .map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }))
        .filter((person) => person.uid && person.uid !== user.uid)
        .sort((first, second) => (first.fullname || "").localeCompare(second.fullname || ""));
      renderUsers(allUsers);
    }, (error) => {
      window.clearTimeout(loadingTimer);
      console.error(error);
      peopleList.innerHTML = emptyState("Unable to load people", "Check your Firebase config and Firestore rules.");
      renderIcons();
    });
  },
});

searchInput?.addEventListener("input", () => {
  const term = searchInput.value.trim().toLowerCase();
  const filtered = allUsers.filter((user) => {
    return [user.fullname, user.email, user.bio]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
  renderUsers(filtered);
});

function renderUsers(users) {
  if (!users.length) {
    peopleList.innerHTML = emptyState("No people found", "Try another search or invite someone to sign up.");
    renderIcons();
    return;
  }

  peopleList.innerHTML = users.map((user) => `
    <article class="user-card">
      <div class="user-card-header">
        <div class="avatar">${initials(user.fullname)}</div>
        <div>
          <strong>${escapeHtml(user.fullname)}</strong>
          <p>${escapeHtml(user.email)}</p>
        </div>
      </div>
      <p>${escapeHtml(user.bio || "No bio yet.")}</p>
      <div class="user-card-actions">
        <span class="status-pill ${user.online ? "online" : "offline"}">
          <i class="fa-solid ${user.online ? "fa-wifi" : "fa-circle-xmark"}"></i>${user.online ? "Online" : "Offline"}
        </span>
        <a class="btn btn-primary" href="chat.html?uid=${encodeURIComponent(user.uid)}">
          <i class="fa-solid fa-comment-dots"></i>Message
        </a>
      </div>
    </article>
  `).join("");
  renderIcons();
}
