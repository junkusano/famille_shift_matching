import { supabase } from "@/lib/supabaseClient"

export async function fetchFaxList() {
  const { data, error } = await supabase.from("fax_directory").select()
  if (error) throw error
  return data
}

export async function createFax(entry: any) {
  const { error } = await supabase.from("fax_directory").insert([entry])
  if (error) throw error
}

export async function updateFax(id: string, entry: any) {
  const { error } = await supabase.from("fax_directory").update(entry).eq("id", id)
  if (error) throw error
}

export async function deleteFax(id: string) {
  const { error } = await supabase.from("fax_directory").delete().eq("id", id)
  if (error) throw error
}
