import { auth, db, serverTimestamp } from "./firebase.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  emptyState,
  escapeHtml,
  formatTime,
  initials,
  listenForAuth,
  renderIcons,
  setupLogoutButtons,
} from "./guard.js";

const params = new URLSearchParams(window.location.search);
const receiverId = params.get("uid");
const receiverAvatar = document.querySelector("#receiverAvatar");
const receiverName = document.querySelector("#receiverName");
const receiverStatus = document.querySelector("#receiverStatus");
const messagesList = document.querySelector("#messagesList");
const messageForm = document.querySelector("#messageForm");
const messageInput = document.querySelector("#messageInput");

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user) {
    if (!receiverId || receiverId === user.uid) {
      window.location.href = "people.html";
      return;
    }
    await loadReceiver();
    subscribeToMessages(user.uid, receiverId);
  },
});

messageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  if (!text || !auth.currentUser || !receiverId) return;

  messageInput.value = "";
  try {
    await addDoc(collection(db, "messages"), {
      senderId: auth.currentUser.uid,
      receiverId,
      participants: [auth.currentUser.uid, receiverId],
      text,
      read: false,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error(error);
    alert("Message could not be sent. Please try again.");
    messageInput.value = text;
  }
});

async function loadReceiver() {
  const snapshot = await getDoc(doc(db, "users", receiverId));
  if (!snapshot.exists()) {
    window.location.href = "people.html";
    return;
  }

  const user = snapshot.data();
  receiverAvatar.textContent = initials(user.fullname);
  receiverName.textContent = user.fullname;
  receiverStatus.textContent = user.online ? "Online now" : "Offline";

  onSnapshot(doc(db, "users", receiverId), (liveSnapshot) => {
    if (!liveSnapshot.exists()) return;
    const liveUser = liveSnapshot.data();
    receiverStatus.textContent = liveUser.online ? "Online now" : "Offline";
  });
}

function subscribeToMessages(currentUid, otherUid) {
  const sentQuery = query(
    collection(db, "messages"),
    where("senderId", "==", currentUid),
    where("receiverId", "==", otherUid),
    orderBy("createdAt"),
  );
  const receivedQuery = query(
    collection(db, "messages"),
    where("senderId", "==", otherUid),
    where("receiverId", "==", currentUid),
    orderBy("createdAt"),
  );

  const cache = { sent: [], received: [] };
  const render = () => {
    renderMessages(currentUid, [...cache.sent, ...cache.received]);
    markIncomingMessagesAsRead(cache.received, currentUid);
  };

  onSnapshot(sentQuery, (snapshot) => {
    cache.sent = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  });

  onSnapshot(receivedQuery, (snapshot) => {
    cache.received = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
    render();
  });
}

async function markIncomingMessagesAsRead(messages, currentUid) {
  const unreadMessages = messages.filter((message) => {
    return message.receiverId === currentUid && message.read !== true;
  });

  await Promise.all(unreadMessages.map((message) => {
    return updateDoc(doc(db, "messages", message.id), {
      read: true,
      readAt: serverTimestamp(),
    });
  })).catch((error) => {
    console.error("Unable to mark messages as read", error);
  });
}

function renderMessages(currentUid, messages) {
  const sorted = messages.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

  if (!sorted.length) {
    messagesList.innerHTML = emptyState("No messages yet", "Send the first message to start this chat.");
    renderIcons();
    return;
  }

  messagesList.innerHTML = sorted.map((message) => {
    const isSent = message.senderId === currentUid;
    return `
      <article class="message-bubble ${isSent ? "sent" : "received"}">
        <p>${escapeHtml(message.text)}</p>
        <time datetime="${message.createdAt?.toDate?.().toISOString() || ""}">${formatTime(message.createdAt)}</time>
      </article>
    `;
  }).join("");
  renderIcons();
  messagesList.scrollTop = messagesList.scrollHeight;
}
