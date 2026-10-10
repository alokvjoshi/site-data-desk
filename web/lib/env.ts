export function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") throw new Error(`Missing environment variable ${name}`);
  return v;
}
export function optEnv(name: string): string | undefined {
  const v = process.env[name];
  return v ? v : undefined;
}
export const hasDb = () => !!(optEnv("SUPABASE_URL") && optEnv("SUPABASE_SERVICE_ROLE_KEY"));
export const hasLlm = () => !!optEnv("OPENROUTER_API_KEY");
export const hasJev = () => !!optEnv("TYPESAFE_API_KEY");
