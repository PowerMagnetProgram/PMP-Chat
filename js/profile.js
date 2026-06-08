import { supabase, timestampNow } from "./supabase.js";
import {
  getUserProfile,
  getNotificationPermission,
  listenForAuth,
  renderAvatar,
  renderIcons,
  requestNotificationPermission,
  setButtonLoading,
  setupLogoutButtons,
  showMessage,
} from "./guard.js";

const profileAvatar = document.querySelector("#profileAvatar");
const profileName = document.querySelector("#profileName");
const profileEmail = document.querySelector("#profileEmail");
const profileBio = document.querySelector("#profileBio");
const editProfileButton = document.querySelector("#editProfileButton");
const profileForm = document.querySelector("#profileForm");
const cancelEditButton = document.querySelector("#cancelEditButton");
const profileMessage = document.querySelector("#profileMessage");
const enableNotificationsButton = document.querySelector("#enableNotificationsButton");
const profileMessageCount = document.querySelector("#profileMessageCount");
let currentProfile = null;
let currentUserId = "";

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user) {
    try {
      currentUserId = user.id;
      currentProfile = await getUserProfile(user.id) || {
        fullname: user.user_metadata?.fullname || user.email?.split("@")[0] || "New User",
        email: user.email || "",
        bio: "No bio yet.",
      };
      renderProfile(currentProfile);
      updateNotificationButton();
      await loadMessageCount(user.id);
    } catch (error) {
      console.error(error);
      profileName.textContent = "Profile unavailable";
      profileEmail.textContent = user.email || "Signed-in user";
      profileBio.textContent = "Check that your Supabase profiles table and policies are set up.";
    }
  },
});

editProfileButton?.addEventListener("click", () => {
  profileForm.classList.remove("hidden");
  profileForm.fullname.value = currentProfile?.fullname || "";
  profileForm.bio.value = currentProfile?.bio || "";
});

cancelEditButton?.addEventListener("click", () => {
  profileForm.classList.add("hidden");
  profileMessage.classList.add("hidden");
});

profileForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#saveProfileButton");
  setButtonLoading(button, true);

  try {
    const fullname = profileForm.fullname.value.trim();
    const bio = profileForm.bio.value.trim();
    const photoFile = profileForm.profilePhoto.files?.[0];
    const photoUrl = photoFile ? await uploadProfilePhoto(photoFile) : currentProfile?.photo_url || "";
    await saveProfileChanges({ fullname, bio, photoUrl, includePhoto: Boolean(photoFile) });

    currentProfile = { ...currentProfile, fullname, bio, photo_url: photoUrl };
    renderProfile(currentProfile);
    profileForm.profilePhoto.value = "";
    showMessage(profileMessage, "Profile updated.", "success");
  } catch (error) {
    console.error(error);
    showMessage(profileMessage, `Could not update your profile: ${friendlyProfileError(error)}`);
  } finally {
    setButtonLoading(button, false);
  }
});

enableNotificationsButton?.addEventListener("click", async () => {
  const permission = await requestNotificationPermission();
  updateNotificationButton(permission);
});

async function saveProfileChanges({ fullname, bio, photoUrl, includePhoto }) {
  const updateWithTimestamp = {
    fullname,
    bio,
    updated_at: timestampNow(),
  };

  if (includePhoto) {
    updateWithTimestamp.photo_url = photoUrl;
  }

  const { data, error } = await supabase
    .from("profiles")
    .update(updateWithTimestamp)
    .eq("id", currentUserId)
    .select()
    .maybeSingle();

  if (!error && data) return data;
  if (!error && !data) return upsertProfile({ fullname, bio, photoUrl, includePhoto });

  const message = error.message || "";
  if (!message.toLowerCase().includes("column")) throw error;

  const fallbackUpdate = { fullname, bio };
  if (includePhoto && !message.includes("photo_url")) {
    fallbackUpdate.photo_url = photoUrl;
  }

  const { data: fallbackData, error: fallbackError } = await supabase
    .from("profiles")
    .update(fallbackUpdate)
    .eq("id", currentUserId)
    .select()
    .maybeSingle();

  if (fallbackError) throw fallbackError;
  if (fallbackData) return fallbackData;
  return upsertProfile({ fullname, bio, photoUrl, includePhoto });
}

async function upsertProfile({ fullname, bio, photoUrl, includePhoto }) {
  const profile = {
    id: currentUserId,
    fullname,
    email: currentProfile?.email || "",
    bio,
  };

  if (includePhoto) {
    profile.photo_url = photoUrl;
  }

  const { data, error } = await supabase
    .from("profiles")
    .upsert(profile)
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function uploadProfilePhoto(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Please choose an image file.");
  }

  const extension = file.name.split(".").pop() || "jpg";
  const path = `${currentUserId}/profile-${Date.now()}.${extension}`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type,
    });

  if (error) throw error;

  const { data } = supabase.storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

function friendlyProfileError(error) {
  const message = error.message || "";
  const lowerMessage = message.toLowerCase();

  if (message.includes("avatars")) {
    return "run supabase-schema.sql again to create the avatars storage bucket.";
  }
  if (lowerMessage.includes("row-level security")) {
    return "check your Supabase profiles update policy, then run supabase-schema.sql again.";
  }
  if (lowerMessage.includes("column")) {
    return "run supabase-schema.sql again so your profiles table has the latest columns.";
  }
  return message || "Please try again.";
}

function renderProfile(profile) {
  if (!profile) return;
  renderAvatar(profileAvatar, profile, "xl");
  profileName.textContent = profile.fullname;
  profileEmail.textContent = profile.email;
  profileBio.textContent = profile.bio || "No bio yet.";
}

async function loadMessageCount(uid) {
  if (!profileMessageCount) return;

  const { count, error } = await supabase
    .from("messages")
    .select("id", { count: "exact", head: true })
    .or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);

  if (error) {
    console.warn("Unable to load profile message count", error);
    return;
  }

  profileMessageCount.textContent = (count || 0).toString();
}

function updateNotificationButton(permission = getNotificationPermission()) {
  if (!enableNotificationsButton) return;

  if (permission === "granted") {
    enableNotificationsButton.innerHTML = '<i class="fa-solid fa-bell"></i>Notifications on';
    enableNotificationsButton.disabled = true;
  } else if (permission === "denied") {
    enableNotificationsButton.innerHTML = '<i class="fa-solid fa-bell-slash"></i>Notifications blocked';
    enableNotificationsButton.disabled = true;
  } else if (permission === "unsupported") {
    enableNotificationsButton.innerHTML = '<i class="fa-solid fa-bell-slash"></i>Not supported';
    enableNotificationsButton.disabled = true;
  } else {
    enableNotificationsButton.innerHTML = '<i class="fa-solid fa-bell"></i>Enable notifications';
    enableNotificationsButton.disabled = false;
  }

  renderIcons();
}
