import { supabase, timestampNow } from "./supabase.js";

let messageNotificationChannel = null;
let notifiedMessageIds = new Set();

export async function listenForAuth({ requireAuth = true, redirectIfFound = "", onReady } = {}) {
  const handleUser = async (user) => {
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
        setupMessageNotifications(user);
        window.addEventListener("beforeunload", () => {
          markOnline(user, false);
        }, { once: true });
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
  };

  const { data } = await supabase.auth.getSession();
  await handleUser(data.session?.user || null);

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    handleUser(session?.user || null);
  });

  return listener.subscription;
}

export function renderIcons() {
  document.querySelectorAll(".fa-solid").forEach((icon) => {
    icon.setAttribute("aria-hidden", "true");
  });
}

export async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    return "unsupported";
  }

  if (Notification.permission === "granted") {
    return "granted";
  }

  if (Notification.permission === "denied") {
    return "denied";
  }

  return Notification.requestPermission();
}

export function getNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  return Notification.permission;
}

function setupMessageNotifications(user) {
  if (!user?.id || messageNotificationChannel) return;

  messageNotificationChannel = supabase
    .channel(`notifications-${user.id}`)
    .on("postgres_changes", {
      event: "INSERT",
      schema: "public",
      table: "messages",
      filter: `receiver_id=eq.${user.id}`,
    }, (payload) => handleIncomingMessageNotification(payload.new))
    .subscribe();
}

async function handleIncomingMessageNotification(message) {
  if (!message?.id || notifiedMessageIds.has(message.id)) return;
  notifiedMessageIds.add(message.id);

  const currentChatUid = new URLSearchParams(window.location.search).get("uid");
  if (window.location.pathname.endsWith("chat.html") && currentChatUid === message.sender_id) {
    return;
  }

  const sender = await getUserProfile(message.sender_id).catch(() => null);
  const senderName = sender?.fullname || "New message";
  const preview = getNotificationPreview(message);

  showInAppNotification(senderName, preview, message.sender_id);

  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(senderName, {
      body: preview,
      icon: sender?.photo_url || undefined,
      tag: message.id,
    });

    notification.onclick = () => {
      window.focus();
      window.location.href = `chat.html?uid=${encodeURIComponent(message.sender_id)}`;
    };
  }
}

function getNotificationPreview(message) {
  if (message.type === "image") return message.text && message.text !== "Photo" ? message.text : "Sent a photo";
  if (message.type === "voice") return "Sent a voice note";
  return message.text || "Sent a message";
}

function showInAppNotification(title, text, senderId) {
  let toast = document.querySelector("#messageNotificationToast");
  if (!toast) {
    toast = document.createElement("button");
    toast.id = "messageNotificationToast";
    toast.className = "message-toast hidden";
    toast.type = "button";
    document.body.appendChild(toast);
  }

  toast.innerHTML = `
    <span><i class="fa-solid fa-bell"></i></span>
    <strong>${escapeHtml(title)}</strong>
    <small>${escapeHtml(text)}</small>
  `;
  toast.onclick = () => {
    window.location.href = `chat.html?uid=${encodeURIComponent(senderId)}`;
  };
  toast.classList.remove("hidden");
  renderIcons();
  window.setTimeout(() => toast.classList.add("hidden"), 5200);
}

export async function getUserProfile(uid) {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", uid)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function ensureUserProfile(user) {
  if (!user) return null;

  const existing = await getUserProfile(user.id);
  if (existing) return existing;

  const profile = {
    id: user.id,
    fullname: user.user_metadata?.fullname || user.email?.split("@")[0] || "New User",
    email: user.email || "",
    bio: user.user_metadata?.bio || "No bio yet.",
    photo_url: user.user_metadata?.photo_url || "",
    online: true,
    created_at: timestampNow(),
    last_seen: timestampNow(),
  };

  const { data, error } = await supabase
    .from("profiles")
    .insert(profile)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function markOnline(userOrUid, online) {
  const uid = typeof userOrUid === "string" ? userOrUid : userOrUid?.id;
  if (!uid) return;

  const updates = {
    online,
    last_seen: timestampNow(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", uid);

  if (error) {
    console.error("Unable to update online status", error);
  }
}

export function setupLogoutButtons() {
  document.querySelectorAll(".logout-button").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const { data } = await supabase.auth.getUser();
        if (data.user) {
          await markOnline(data.user, false);
        }
        await supabase.auth.signOut();
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

export function avatarHtml(profile = {}, extraClass = "") {
  const name = profile.fullname || profile.email || "User";
  const photoUrl = profile.photo_url || "";
  const classes = ["avatar", extraClass].filter(Boolean).join(" ");

  if (photoUrl) {
    return `<div class="${classes} has-photo"><img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)} profile picture"></div>`;
  }

  return `<div class="${classes}">${initials(name)}</div>`;
}

export function renderAvatar(element, profile = {}, extraClass = "") {
  if (!element) return;
  const name = profile.fullname || profile.email || "User";
  const photoUrl = profile.photo_url || "";
  element.className = ["avatar", extraClass].filter(Boolean).join(" ");

  if (photoUrl) {
    element.innerHTML = `<img src="${escapeHtml(photoUrl)}" alt="${escapeHtml(name)} profile picture">`;
    element.classList.add("has-photo");
    return;
  }

  element.classList.remove("has-photo");
  element.textContent = initials(name);
}

export function formatTime(timestamp) {
  const date = timestamp ? new Date(timestamp) : new Date();
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
