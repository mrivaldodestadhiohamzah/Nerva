import { createClient } from '@supabase/supabase-js';
import "./utils/env.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

if (!isSupabaseConfigured) {
  console.warn(
    'Supabase is not configured. Create a .env file with SUPABASE_URL and SUPABASE_SERVICE_KEY.'
  );
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
