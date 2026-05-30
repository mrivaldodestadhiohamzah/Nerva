import { createClient } from '@supabase/supabase-js';
import "./utils/env.js";
import { logger } from "./utils/logger.js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseServiceKey);

if (!isSupabaseConfigured) {
  logger.warn('Supabase is not configured. Add SUPABASE_URL and SUPABASE_SERVICE_KEY on the backend.');
}

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
