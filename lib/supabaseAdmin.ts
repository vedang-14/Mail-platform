import { createClient } from "@supabase/supabase-js";

// SERVER-ONLY (service role — bypasses RLS). Never import into a client component.
export const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
);