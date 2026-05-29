import { auth, db, serverTimestamp } from "./firebase.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getUserProfile,
  initials,
  listenForAuth,
  renderIcons,
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
let currentProfile = null;

setupLogoutButtons();
renderIcons();

listenForAuth({
  requireAuth: true,
  async onReady(user) {
    try {
      currentProfile = await getUserProfile(user.uid) || {
        fullname: user.displayName || user.email?.split("@")[0] || "New User",
        email: user.email || "",
        bio: "No bio yet.",
      };
      renderProfile(currentProfile);
    } catch (error) {
      console.error(error);
      profileName.textContent = "Profile unavailable";
      profileEmail.textContent = user.email || "Signed-in user";
      profileBio.textContent = "Check that your Firestore rules are published and your users collection allows authenticated reads.";
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
    await updateDoc(doc(db, "users", auth.currentUser.uid), {
      fullname,
      bio,
      updatedAt: serverTimestamp(),
    });
    currentProfile = { ...currentProfile, fullname, bio };
    renderProfile(currentProfile);
    showMessage(profileMessage, "Profile updated.", "success");
  } catch (error) {
    console.error(error);
    showMessage(profileMessage, "Could not update your profile. Please try again.");
  } finally {
    setButtonLoading(button, false);
  }
});

function renderProfile(profile) {
  if (!profile) return;
  profileAvatar.textContent = initials(profile.fullname);
  profileName.textContent = profile.fullname;
  profileEmail.textContent = profile.email;
  profileBio.textContent = profile.bio || "No bio yet.";
}
