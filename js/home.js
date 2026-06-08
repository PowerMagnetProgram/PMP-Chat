import { supabase } from "./supabase.js";
import {
  avatarHtml,
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
    const profile = await getUserProfile(user.id);
    currentUserName.textContent = profile?.fullname || user.email;
    if (mobileHeaderAvatar) mobileHeaderAvatar.textContent = initials(profile?.fullname || user.email || "User");
    if (mobileHeaderName) mobileHeaderName.textContent = profile?.fullname || "PulseChat";
    if (mobileHeaderEmail) mobileHeaderEmail.textContent = profile?.email || user.email || "Online";
    subscribeToRecentChats(user.id);
  },
});

async function subscribeToRecentChats(uid) {
  await renderRecentFromDatabase(uid);

  supabase
    .channel(`dashboard-messages-${uid}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
      filter: `sender_id=eq.${uid}`,
    }, () => renderRecentFromDatabase(uid))
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
      filter: `receiver_id=eq.${uid}`,
    }, () => renderRecentFromDatabase(uid))
    .subscribe();
}

async function renderRecentFromDatabase(uid) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Unable to load recent messages", error);
    recentChats.innerHTML = emptyState("Recent messages could not load", "Check your Supabase table policies and refresh this page.");
    renderIcons();
    return;
  }

  await renderRecent(uid, data || []);
}

async function renderRecent(uid, messages) {
  if (!messages.length) {
    recentChats.innerHTML = emptyState("No chats yet", "Find someone from the people page and start the first conversation.");
    renderIcons();
    return;
  }

  const latestByPerson = new Map();
  const unreadByPerson = new Map();
  messages.forEach((message) => {
    const otherUid = message.sender_id === uid ? message.receiver_id : message.sender_id;
    if (!latestByPerson.has(otherUid)) {
      latestByPerson.set(otherUid, message);
    }
    if (message.receiver_id === uid && message.read !== true) {
      unreadByPerson.set(otherUid, (unreadByPerson.get(otherUid) || 0) + 1);
    }
  });

  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("*");

  if (error) {
    console.error("Unable to load profiles", error);
    recentChats.innerHTML = emptyState("Profiles could not load", "Check your Supabase policies and refresh this page.");
    renderIcons();
    return;
  }

  const users = new Map((profiles || []).map((profile) => [profile.id, profile]));

  recentChats.innerHTML = [...latestByPerson.entries()]
    .map(([otherUid, message]) => {
      const person = users.get(otherUid);
      if (!person) return "";
      const unreadCount = unreadByPerson.get(otherUid) || 0;
      const isUnread = unreadCount > 0 && message.receiver_id === uid;
      const previewPrefix = message.sender_id === uid ? "You: " : "";
      const previewText = message.text || (message.type === "image" ? "Photo" : message.type === "voice" ? "Voice note" : "Media");
      const chatUrl = `chat.html?uid=${encodeURIComponent(otherUid)}`;
      return `
        <a class="chat-preview ${isUnread ? "unread" : ""}" href="${chatUrl}" aria-label="Open chat with ${escapeHtml(person.fullname)}">
          ${avatarHtml(person)}
          <div>
            <div class="chat-preview-title">
              <strong>${escapeHtml(person.fullname)}</strong>
              ${unreadCount ? `<span class="unread-badge">${unreadCount}</span>` : ""}
            </div>
            <p class="latest-message">
              <i class="fa-solid ${isUnread ? "fa-circle" : "fa-check"}"></i>
              <span>${escapeHtml(previewPrefix)}</span>${escapeHtml(previewText)}
            </p>
          </div>
          <span class="btn btn-ghost chat-preview-time">
            <i class="fa-solid fa-comment-dots"></i>${formatTime(message.created_at)}
          </span>
        </a>
      `;
    })
    .join("");
  renderIcons();
}
