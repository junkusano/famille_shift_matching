import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase/service'

export async function PUT(req: Request, { params }: { params: { id: string } }) {
    const { id } = params
    const body = await req.json()
    const { error } = await supabaseAdmin
        .from('fax')
        .update({
            fax: body.fax as string,
            office_name: body.office_name as string,
            email: body.email as string,
            postal_code: (body.postal_code ?? null) as string | null,
            service_kind_id: (body.service_kind_id || null) as string | null,
        })
        .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
    const { id } = params
    const { error } = await supabaseAdmin.from('fax').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ success: true })
}

