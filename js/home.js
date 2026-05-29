import { db } from "./firebase.js";
import {
  collection,
  getDocs,
  onSnapshot,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  emptyState,
  escapeHtml,
  formatTime,
  getUserProfile,
  initials,
  listenForAuth,
  renderIcons,
  setupLogoutButtons,
} from "./guard.js";

const currentUserName = document.querySelector("#currentUserName");
const mobileHeaderAvatar = document.querySelector("#mobileHeaderAvatar");
const mobileHeaderName = document.querySelector("#mobileHeaderName");
const mobileHeaderEmail = document.querySelector("#mobileHeaderEmail");
const recentChats = document.querySelector("#recentChats");

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user) {
    const profile = await getUserProfile(user.uid);
    currentUserName.textContent = profile?.fullname || user.email;
    mobileHeaderAvatar.textContent = initials(profile?.fullname || user.email || "User");
    mobileHeaderName.textContent = profile?.fullname || "PulseChat";
    mobileHeaderEmail.textContent = profile?.email || user.email || "Online";
    subscribeToRecentChats(user.uid);
  },
});

function subscribeToRecentChats(uid) {
  const sentQuery = query(
    collection(db, "messages"),
    where("senderId", "==", uid),
  );
  const receivedQuery = query(
    collection(db, "messages"),
    where("receiverId", "==", uid),
  );

  const cache = { sent: [], received: [] };
  const render = () => renderRecent(uid, [...cache.sent, ...cache.received]);
  const showError = (error) => {
    console.error("Unable to load recent messages", error);
    recentChats.innerHTML = emptyState(
      "Recent messages could not load",
      "Check that your Firestore rules are published and refresh this page.",
    );
    renderIcons();
  };

  const loadingTimer = window.setTimeout(() => {
    recentChats.innerHTML = emptyState(
      "Still checking messages",
      "Send a test message from another account, then refresh this dashboard.",
    );
    renderIcons();
  }, 8000);

  onSnapshot(sentQuery, (snapshot) => {
    window.clearTimeout(loadingTimer);
    cache.sent = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  }, showError);

  onSnapshot(receivedQuery, (snapshot) => {
    window.clearTimeout(loadingTimer);
    cache.received = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  }, showError);
}

async function renderRecent(uid, messages) {
  if (!messages.length) {
    recentChats.innerHTML = emptyState("No chats yet", "Find someone from the people page and start the first conversation.");
    renderIcons();
    return;
  }

  const latestByPerson = new Map();
  const unreadByPerson = new Map();
  messages
    .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
    .forEach((message) => {
      const otherUid = message.senderId === uid ? message.receiverId : message.senderId;
      if (!latestByPerson.has(otherUid)) {
        latestByPerson.set(otherUid, message);
      }
      if (message.receiverId === uid && message.read !== true) {
        unreadByPerson.set(otherUid, (unreadByPerson.get(otherUid) || 0) + 1);
      }
    });

  const userSnapshots = await getDocs(collection(db, "users"));
  const users = new Map(userSnapshots.docs.map((docSnap) => [docSnap.id, docSnap.data()]));

  recentChats.innerHTML = [...latestByPerson.entries()]
    .map(([otherUid, message]) => {
      const person = users.get(otherUid);
      if (!person) return "";
      const unreadCount = unreadByPerson.get(otherUid) || 0;
      const isUnread = unreadCount > 0 && message.receiverId === uid;
      const previewPrefix = message.senderId === uid ? "You: " : "";
      const chatUrl = `chat.html?uid=${encodeURIComponent(otherUid)}`;
      return `
        <a class="chat-preview ${isUnread ? "unread" : ""}" href="${chatUrl}" aria-label="Open chat with ${escapeHtml(person.fullname)}">
          <div class="avatar">${initials(person.fullname)}</div>
          <div>
            <div class="chat-preview-title">
              <strong>${escapeHtml(person.fullname)}</strong>
              ${unreadCount ? `<span class="unread-badge">${unreadCount}</span>` : ""}
            </div>
            <p class="latest-message">
              <i class="fa-solid ${isUnread ? "fa-circle" : "fa-check"}"></i>
              <span>${escapeHtml(previewPrefix)}</span>${escapeHtml(message.text)}
            </p>
          </div>
          <span class="btn btn-ghost chat-preview-time">
            <i class="fa-solid fa-comment-dots"></i>${formatTime(message.createdAt)}
          </span>
        </a>
      `;
    })
    .join("");
  renderIcons();
}
