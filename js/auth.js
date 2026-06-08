import { supabase } from "./supabase.js";
import { listenForAuth, renderIcons, setButtonLoading, showMessage } from "./guard.js";

listenForAuth({ requireAuth: false, redirectIfFound: "home.html" });
renderIcons();

const loginForm = document.querySelector("#loginForm");
const signupForm = document.querySelector("#signupForm");
const authMessage = document.querySelector("#authMessage");

loginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#loginButton");
  setButtonLoading(button, true);

  try {
    const form = new FormData(loginForm);
    const { error } = await supabase.auth.signInWithPassword({
      email: form.get("email").trim(),
      password: form.get("password"),
    });

    if (error) throw error;
    window.location.href = "home.html";
  } catch (error) {
    showMessage(authMessage, friendlyAuthError(error));
  } finally {
    setButtonLoading(button, false);
  }
});

signupForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.querySelector("#signupButton");
  setButtonLoading(button, true);

  try {
    const form = new FormData(signupForm);
    const fullname = form.get("fullname").trim();
    const email = form.get("email").trim();
    const bio = form.get("bio").trim();

    const { data, error } = await supabase.auth.signUp({
      email,
      password: form.get("password"),
      options: {
        data: {
          fullname,
          bio,
        },
      },
    });

    if (error) throw error;

    if (data.user && data.session) {
      const { error: profileError } = await supabase.from("profiles").upsert({
        id: data.user.id,
        fullname,
        email,
        bio,
        photo_url: "",
        online: true,
      });
      if (profileError) throw profileError;
    }

    window.location.href = "home.html";
  } catch (error) {
    showMessage(authMessage, friendlyAuthError(error));
  } finally {
    setButtonLoading(button, false);
  }
});

function friendlyAuthError(error) {
  const message = error.message || "";
  if (message.toLowerCase().includes("already")) return "That email already has an account.";
  if (message.toLowerCase().includes("invalid")) return "Email or password is incorrect.";
  if (message.toLowerCase().includes("password")) return "Password should be at least 6 characters.";
  return message || "Something went wrong. Please try again.";
}
