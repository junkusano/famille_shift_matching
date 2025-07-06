// lib/api/orgIcons.ts

import { supabaseAdmin } from '@/lib/supabase/service';

export async function getOrgsWithIcons() {
  const { data, error } = await supabaseAdmin
    .from('orgs')
    .select('*')
    .order('display_order', { ascending: true });

  if (error) {
    console.error('Error fetching orgs:', error);
    return [];
  }

  return data;
}
