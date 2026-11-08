// Build-time environment values. Kept separate so tests can mock it
// (import.meta is unavailable under Jest).
export const API_BASE_URL: string = (
  import.meta.env.VITE_API_ENDPOINT || 'https://api.example.com/dev'
).replace(/\/+$/, '');
