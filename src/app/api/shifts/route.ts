//api/shifts/route.ts

import { supabaseAdmin } from '@/lib/supabase/service'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const shiftId = searchParams.get('shift_id')

  if (!shiftId) {
    return new Response(JSON.stringify({ error: 'shift_id is required' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('shift')  // ここでシフト情報を取得
    .select('*')
    .eq('shift_id', shiftId)
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), { status: 200 })
}

export async function PUT(req: Request) {
  const { shift_id, ...updatedFields } = await req.json()

  if (!shift_id) {
    return new Response(JSON.stringify({ error: 'shift_id is required' }), { status: 400 })
  }

  const { data, error } = await supabaseAdmin
    .from('shift')
    .update(updatedFields)
    .eq('shift_id', shift_id)
    .single()

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 })
  }

  return new Response(JSON.stringify(data), { status: 200 })
}
