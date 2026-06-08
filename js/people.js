import { supabase } from "./supabase.js";
import {
  avatarHtml,
  emptyState,
  escapeHtml,
  getUserProfile,
  listenForAuth,
  renderIcons,
  renderAvatar,
  setupLogoutButtons,
} from "./guard.js";

const peopleList = document.querySelector("#peopleList");
const searchInput = document.querySelector("#searchInput");
const mobileHeaderAvatar = document.querySelector("#mobileHeaderAvatar");
const mobileHeaderName = document.querySelector("#mobileHeaderName");
const mobileHeaderEmail = document.querySelector("#mobileHeaderEmail");
const totalPeople = document.querySelector("#totalPeople");
const onlinePeople = document.querySelector("#onlinePeople");
let allUsers = [];
let currentUserId = "";

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user, guardError) {
    if (guardError) {
      console.warn("People page continuing after auth guard warning", guardError);
    }

    if (!user) {
      peopleList.innerHTML = emptyState("Unable to load people", "Please login again to see the directory.");
      renderIcons();
      return;
    }

    currentUserId = user.id;
    let profile = null;
    try {
      profile = await getUserProfile(user.id);
    } catch (error) {
      console.warn("Current profile could not be loaded, using auth user fallback", error);
    }

    if (mobileHeaderAvatar) renderAvatar(mobileHeaderAvatar, profile || user);
    if (mobileHeaderName) mobileHeaderName.textContent = profile?.fullname || "PulseChat";
    if (mobileHeaderEmail) mobileHeaderEmail.textContent = profile?.email || user.email || "Online";

    await loadUsers();
    supabase
      .channel("people-profiles")
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "profiles",
      }, loadUsers)
      .subscribe();
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

async function loadUsers() {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .order("fullname", { ascending: true });

  if (error) {
    console.error(error);
    peopleList.innerHTML = emptyState("Unable to load people", "Check your Supabase config and row-level security policies.");
    renderIcons();
    return;
  }

  allUsers = data || [];
  updatePeopleSummary(allUsers);
  renderUsers(allUsers);
}

function updatePeopleSummary(users) {
  if (totalPeople) totalPeople.textContent = users.length.toString();
  if (onlinePeople) {
    onlinePeople.textContent = users
      .filter((user) => user.online)
      .length
      .toString();
  }
}

function renderUsers(users) {
  if (!users.length) {
    peopleList.innerHTML = emptyState("No people found", "Try another search or invite someone to sign up.");
    renderIcons();
    return;
  }

  peopleList.innerHTML = users.map((user) => `
    <article class="user-card ${user.id === currentUserId ? "self-card" : ""}">
      <div class="user-card-header">
        ${avatarHtml(user)}
        <div>
          <strong>${escapeHtml(user.fullname)}${user.id === currentUserId ? " <span class=\"you-badge\">You</span>" : ""}</strong>
          <p>${escapeHtml(user.email)}</p>
        </div>
      </div>
      <p>${escapeHtml(user.bio || "No bio yet.")}</p>
      <div class="user-card-actions">
        <span class="status-pill ${user.online ? "online" : "offline"}">
          <i class="fa-solid ${user.online ? "fa-wifi" : "fa-circle-xmark"}"></i>${user.online ? "Online" : "Offline"}
        </span>
        ${user.id === currentUserId ? `
          <a class="btn btn-ghost" href="profile.html">
            <i class="fa-solid fa-user-pen"></i>Profile
          </a>
        ` : `
          <a class="btn btn-primary" href="chat.html?uid=${encodeURIComponent(user.id)}">
            <i class="fa-solid fa-comment-dots"></i>Message
          </a>
        `}
      </div>
    </article>
  `).join("");
  renderIcons();
}
