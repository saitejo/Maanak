export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

export function getFastApiUrl() {
  const url = process.env.NEXT_PUBLIC_FASTAPI_URL?.replace(/\/$/, "");
  if (!url || url.includes("YOUR_FASTAPI_URL")) {
    return "";
  }
  return url;
}
