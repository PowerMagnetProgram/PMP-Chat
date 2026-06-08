import { supabase, timestampNow } from "./supabase.js";
import {
  emptyState,
  escapeHtml,
  formatTime,
  listenForAuth,
  renderAvatar,
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
const imageInput = document.querySelector("#imageInput");
const recordButton = document.querySelector("#recordButton");
const replyComposer = document.querySelector("#replyComposer");
const replyAuthor = document.querySelector("#replyAuthor");
const replyText = document.querySelector("#replyText");
const cancelReplyButton = document.querySelector("#cancelReplyButton");
const recordingPanel = document.querySelector("#recordingPanel");
const recordingTimer = document.querySelector("#recordingTimer");
let currentUserId = "";
let mediaRecorder = null;
let recordedChunks = [];
let recordingStartedAt = 0;
let recordingTimerId = 0;
let selectedReply = null;
let messageCache = [];

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user) {
    if (!receiverId || receiverId === user.id) {
      window.location.href = "people.html";
      return;
    }
    currentUserId = user.id;
    await loadReceiver();
    subscribeToMessages(user.id, receiverId);
  },
});

messageForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = messageInput.value.trim();
  const imageFile = imageInput.files?.[0];
  const reply_to_id = selectedReply?.id || null;
  if ((!text && !imageFile) || !currentUserId || !receiverId) return;

  messageInput.value = "";
  if (imageInput) imageInput.value = "";
  try {
    if (imageFile) {
      const media = await uploadChatMedia(imageFile, "image");
      await sendMessage({
        text: text || "Photo",
        type: "image",
        reply_to_id,
        ...media,
      });
      clearReply();
      return;
    }

    await sendMessage({ text, type: "text", reply_to_id });
    clearReply();
  } catch (error) {
    console.error(error);
    alert(`Message could not be sent: ${friendlyMediaError(error)}`);
    messageInput.value = text;
  }
});

cancelReplyButton?.addEventListener("click", clearReply);

recordButton?.addEventListener("click", async () => {
  if (mediaRecorder?.state === "recording") {
    mediaRecorder.stop();
    recordButton.disabled = true;
    return;
  }

  try {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      alert("Voice recording is not supported in this browser.");
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    recordingStartedAt = Date.now();
    mediaRecorder = new MediaRecorder(stream);

    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });

    mediaRecorder.addEventListener("stop", async () => {
      const durationSeconds = Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000));
      const audioBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      stream.getTracks().forEach((track) => track.stop());

      try {
        const media = await uploadChatMedia(audioBlob, "voice");
        await sendMessage({
          text: "Voice note",
          type: "voice",
          reply_to_id: selectedReply?.id || null,
          duration_seconds: durationSeconds,
          ...media,
        });
        clearReply();
      } catch (error) {
        console.error("Voice note failed", error);
        alert(`Voice note could not be sent: ${friendlyMediaError(error)}`);
      } finally {
        recordButton.disabled = false;
        stopRecordingUi();
      }
    });

    mediaRecorder.start();
    startRecordingUi();
  } catch (error) {
    console.error("Microphone unavailable", error);
    alert("Please allow microphone access to record a voice note.");
  }
});

messagesList?.addEventListener("click", async (event) => {
  const replyButton = event.target.closest("[data-reply-message-id]");
  if (replyButton) {
    startReply(replyButton.dataset.replyMessageId);
    return;
  }

  const deleteButton = event.target.closest("[data-delete-message-id]");
  if (!deleteButton || !currentUserId) return;

  const messageId = deleteButton.dataset.deleteMessageId;
  const confirmed = window.confirm("Delete this message for everyone?");
  if (!confirmed) return;

  deleteButton.disabled = true;
  try {
    const { error } = await supabase
      .from("messages")
      .delete()
      .eq("id", messageId)
      .eq("sender_id", currentUserId);

    if (error) throw error;
  } catch (error) {
    console.error("Unable to delete message", error);
    alert("Message could not be deleted. Please try again.");
    deleteButton.disabled = false;
  }
});

function startReply(messageId) {
  selectedReply = messageCache.find((message) => message.id === messageId) || null;
  if (!selectedReply) return;

  const isOwnMessage = selectedReply.sender_id === currentUserId;
  if (replyAuthor) replyAuthor.textContent = isOwnMessage ? "your message" : receiverName.textContent || "message";
  if (replyText) replyText.textContent = getMessagePreview(selectedReply);
  replyComposer?.classList.remove("hidden");
  messageInput?.focus();
}

function clearReply() {
  selectedReply = null;
  replyComposer?.classList.add("hidden");
  if (replyAuthor) replyAuthor.textContent = "Message";
  if (replyText) replyText.textContent = "Selected message";
}

function startRecordingUi() {
  recordButton.classList.add("recording");
  recordButton.innerHTML = '<i class="fa-solid fa-stop"></i>';
  recordingPanel?.classList.remove("hidden");
  updateRecordingTimer();
  recordingTimerId = window.setInterval(updateRecordingTimer, 500);
  renderIcons();
}

function stopRecordingUi() {
  if (recordingTimerId) {
    window.clearInterval(recordingTimerId);
    recordingTimerId = 0;
  }
  recordButton.classList.remove("recording");
  recordButton.innerHTML = '<i class="fa-solid fa-microphone"></i>';
  recordingPanel?.classList.add("hidden");
  if (recordingTimer) recordingTimer.textContent = "0:00";
  renderIcons();
}

function updateRecordingTimer() {
  if (!recordingTimer) return;
  const seconds = Math.max(0, Math.floor((Date.now() - recordingStartedAt) / 1000));
  recordingTimer.textContent = formatDuration(seconds);
}

async function loadReceiver() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", receiverId)
    .maybeSingle();

  if (error || !data) {
    window.location.href = "people.html";
    return;
  }

  renderReceiver(data);

  supabase
    .channel(`profile-${receiverId}`)
    .on("postgres_changes", {
      event: "UPDATE",
      schema: "public",
      table: "profiles",
      filter: `id=eq.${receiverId}`,
    }, (payload) => renderReceiver(payload.new))
    .subscribe();
}

function renderReceiver(user) {
  renderAvatar(receiverAvatar, user);
  receiverName.textContent = user.fullname;
  receiverStatus.textContent = user.online ? "Online now" : "Offline";
}

async function sendMessage(message) {
  const payload = {
    sender_id: currentUserId,
    receiver_id: receiverId,
    text: message.text,
    read: false,
  };

  if (message.type && message.type !== "text") {
    payload.type = message.type;
    payload.media_url = message.media_url || null;
    payload.media_path = message.media_path || null;
    payload.media_mime = message.media_mime || null;
    payload.media_name = message.media_name || null;
    payload.duration_seconds = message.duration_seconds || null;
  }

  if (message.reply_to_id) {
    payload.reply_to_id = message.reply_to_id;
  }

  const { error } = await supabase.from("messages").insert(payload);

  if (error) throw error;
}

async function uploadChatMedia(fileOrBlob, type) {
  const mime = fileOrBlob.type || (type === "voice" ? "audio/webm" : "application/octet-stream");
  if (type === "image" && !mime.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const extension = getMediaExtension(fileOrBlob, mime, type);
  const path = `${currentUserId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from("chat-media")
    .upload(path, fileOrBlob, {
      cacheControl: "3600",
      contentType: mime,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("chat-media").getPublicUrl(path);
  return {
    media_url: data.publicUrl,
    media_path: path,
    media_mime: mime,
    media_name: fileOrBlob.name || `${type}-note.${extension}`,
  };
}

function friendlyMediaError(error) {
  const message = error.message || "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("bucket") || lowerMessage.includes("chat-media")) {
    return "run supabase-schema.sql again to create the chat-media storage bucket.";
  }
  if (lowerMessage.includes("row-level security") || lowerMessage.includes("policy")) {
    return "run supabase-schema.sql again so the chat-media storage policies are enabled.";
  }
  if (lowerMessage.includes("reply_to_id")) {
    return "run supabase-schema.sql again so the messages table supports replies.";
  }
  if (lowerMessage.includes("column") || lowerMessage.includes("media_url") || lowerMessage.includes("type")) {
    return "run supabase-schema.sql again so the messages table has the latest columns.";
  }
  if (lowerMessage.includes("permission") || lowerMessage.includes("microphone")) {
    return "please allow microphone access and try again.";
  }
  return message || "Please try again.";
}

function getMediaExtension(fileOrBlob, mime, type) {
  const fileName = fileOrBlob.name || "";
  const fileExtension = fileName.includes(".") ? fileName.split(".").pop() : "";
  if (fileExtension) return fileExtension.toLowerCase();
  if (mime.includes("webm")) return "webm";
  if (mime.includes("mpeg")) return "mp3";
  if (mime.includes("ogg")) return "ogg";
  if (mime.includes("png")) return "png";
  if (mime.includes("gif")) return "gif";
  return type === "image" ? "jpg" : "webm";
}

async function subscribeToMessages(currentUid, otherUid) {
  await loadMessages(currentUid, otherUid);

  supabase
    .channel(`messages-${currentUid}-${otherUid}`)
    .on("postgres_changes", {
      event: "*",
      schema: "public",
      table: "messages",
    }, (payload) => {
      const message = payload.new?.id ? payload.new : payload.old;
      if (!message) return;
      const belongsToChat = (
        (message.sender_id === currentUid && message.receiver_id === otherUid) ||
        (message.sender_id === otherUid && message.receiver_id === currentUid)
      );
      if (belongsToChat) loadMessages(currentUid, otherUid);
    })
    .subscribe();
}

async function loadMessages(currentUid, otherUid) {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .or(`and(sender_id.eq.${currentUid},receiver_id.eq.${otherUid}),and(sender_id.eq.${otherUid},receiver_id.eq.${currentUid})`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Unable to load messages", error);
    messagesList.innerHTML = emptyState("Messages could not load", "Check your Supabase policies and realtime setup.");
    renderIcons();
    return;
  }

  renderMessages(currentUid, data || []);
  markIncomingMessagesAsRead(data || [], currentUid);
}

async function markIncomingMessagesAsRead(messages, currentUid) {
  const unreadIds = messages
    .filter((message) => message.receiver_id === currentUid && message.read !== true)
    .map((message) => message.id);

  if (!unreadIds.length) return;

  const { error } = await supabase
    .from("messages")
    .update({
      read: true,
      read_at: timestampNow(),
    })
    .in("id", unreadIds);

  if (error) {
    console.error("Unable to mark messages as read", error);
  }
}

function renderMessages(currentUid, messages) {
  if (!messages.length) {
    messageCache = [];
    messagesList.innerHTML = emptyState("No messages yet", "Send the first message to start this chat.");
    renderIcons();
    return;
  }

  messageCache = messages;
  const messagesById = new Map(messages.map((message) => [message.id, message]));

  messagesList.innerHTML = messages.map((message) => {
    const isSent = message.sender_id === currentUid;
    const replyTarget = message.reply_to_id ? messagesById.get(message.reply_to_id) : null;
    return `
      <article class="message-bubble ${isSent ? "sent" : "received"}">
        <div class="message-actions">
          <button class="message-action" type="button" data-reply-message-id="${escapeHtml(message.id)}" aria-label="Reply to message">
            <i class="fa-solid fa-reply"></i>
          </button>
        ${isSent ? `
          <button class="message-action message-delete" type="button" data-delete-message-id="${escapeHtml(message.id)}" aria-label="Delete message">
            <i class="fa-solid fa-trash"></i>
          </button>
        ` : ""}
        </div>
        ${replyTarget ? renderReplyPreview(replyTarget, currentUid) : ""}
        ${renderMessageBody(message)}
        <time datetime="${message.created_at || ""}">${formatTime(message.created_at)}</time>
      </article>
    `;
  }).join("");
  renderIcons();
  messagesList.scrollTop = messagesList.scrollHeight;
}

function renderReplyPreview(message, currentUid) {
  const author = message.sender_id === currentUid ? "You" : receiverName.textContent || "Them";
  return `
    <div class="message-reply-preview">
      <span>${escapeHtml(author)}</span>
      <p>${escapeHtml(getMessagePreview(message))}</p>
    </div>
  `;
}

function renderMessageBody(message) {
  const text = message.text ? `<p>${escapeHtml(message.text)}</p>` : "";

  if (message.type === "image" && message.media_url) {
    return `
      <a class="message-media-link" href="${escapeHtml(message.media_url)}" target="_blank" rel="noopener noreferrer">
        <img class="message-image" src="${escapeHtml(message.media_url)}" alt="${escapeHtml(message.media_name || "Shared image")}">
      </a>
      ${text}
    `;
  }

  if (message.type === "voice" && message.media_url) {
    return `
      <div class="voice-note">
        <i class="fa-solid fa-microphone-lines"></i>
        <audio controls src="${escapeHtml(message.media_url)}"></audio>
        ${message.duration_seconds ? `<span>${formatDuration(message.duration_seconds)}</span>` : ""}
      </div>
      ${text}
    `;
  }

  return text;
}

function getMessagePreview(message) {
  if (!message) return "Message";
  if (message.type === "image") return message.text && message.text !== "Photo" ? message.text : "Photo";
  if (message.type === "voice") return "Voice note";
  return message.text || "Message";
}

function formatDuration(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}
