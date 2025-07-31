import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function PUT(req: NextRequest, context: { params: { id: string } }) {
  const id = context.params.id
  const payload = await req.json()

  try {
    const { error } = await supabase
      .from('cs_kaipoke_info')
      .update(payload)
      .eq('id', id)

    if (error) {
      console.error('Supabase PUT error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Unexpected error:', e)
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 })
  }
}
