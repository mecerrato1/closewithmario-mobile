// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Optional: basic sanity check
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('⚠️ Supabase URL or anon key is missing. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
