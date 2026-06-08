import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// Replace these values with your Supabase project URL and anon public key.
const supabaseUrl = "https://nokktpzgjepotqqvlktd.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5va2t0cHpnamVwb3RxcXZsa3RkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMzU1MDksImV4cCI6MjA5NTkxMTUwOX0.F30vIR3-vK-eJFVCNpaFhW93-T8ujouUaHWNz-dk-ck";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

export function timestampNow() {
  return new Date().toISOString();
}
