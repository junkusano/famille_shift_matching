// =============================================================
// src/app/api/cm/local-fax-phonebook/[id]/route.ts
// ローカルFAX電話帳 更新・削除API
// =============================================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase/service';
import { createLogger } from '@/lib/common/logger';
import { normalizeFaxNumber } from '@/lib/cm/faxNumberUtils';
import { getServiceUrl, SERVICE_NAMES } from '@/lib/cm/serviceCredentials';
import type {
  CmLocalFaxPhonebookEntry,
  CmPhonebookGasUpdateRequest,
  CmPhonebookGasDeleteRequest,
  CmPhonebookGasUpdateDeleteResponse,
} from '@/types/cm/localFaxPhonebook';

const logger = createLogger('cm/api/local-fax-phonebook/[id]');

type RouteParams = {
  params: Promise<{ id: string }>;
};

// =============================================================
// PATCH: 更新
// =============================================================
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const entryId = parseInt(id, 10);

    if (isNaN(entryId)) {
      return NextResponse.json({ ok: false, error: '無効なIDです' }, { status: 400 });
    }

    const body = await request.json();
    const { name, name_kana, fax_number, notes, is_active } = body;

    logger.info('ローカルFAX電話帳更新', { id: entryId, name, fax_number });

    // 既存レコードを取得
    const { data: existingEntry, error: fetchError } = await supabaseAdmin
      .from('cm_local_fax_phonebook')
      .select('*')
      .eq('id', entryId)
      .single();

    if (fetchError || !existingEntry) {
      logger.error('ローカルFAX電話帳取得エラー', fetchError);
      return NextResponse.json({ ok: false, error: '対象のエントリが見つかりません' }, { status: 404 });
    }

    // 更新データを構築
    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) {
      updateData.name = name?.trim() || existingEntry.name;
    }
    if (name_kana !== undefined) {
      updateData.name_kana = name_kana?.trim() || null;
    }
    if (fax_number !== undefined) {
      updateData.fax_number = fax_number?.trim() || null;
      updateData.fax_number_normalized = fax_number ? normalizeFaxNumber(fax_number) : null;
    }
    if (notes !== undefined) {
      updateData.notes = notes?.trim() || null;
    }
    if (is_active !== undefined) {
      updateData.is_active = Boolean(is_active);
    }

    // GAS Web App経由でXMLを更新（source_idがある場合のみ）
    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);
    
    if (gasWebAppUrl && existingEntry.source_id) {
      try {
        const gasRequest: CmPhonebookGasUpdateRequest = {
          action: 'update',
          source_id: existingEntry.source_id,
          name: updateData.name as string | undefined,
          name_kana: updateData.name_kana as string | undefined,
          fax_number: updateData.fax_number as string | undefined,
        };

        const gasResponse = await fetch(gasWebAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gasRequest),
        });

        const gasResult: CmPhonebookGasUpdateDeleteResponse = await gasResponse.json();

        if (!gasResult.ok) {
          logger.error('GAS API更新エラー', { error: gasResult.error });
          // XMLの更新に失敗してもDBは更新を続行（警告としてログ）
          logger.warn('XMLの更新に失敗しましたが、DB更新は続行します');
        } else {
          logger.info('GAS API更新成功', { sourceId: existingEntry.source_id });
        }
      } catch (gasError) {
        logger.error('GAS API通信エラー', gasError);
        // 通信エラーでもDB更新は続行
        logger.warn('GAS APIとの通信に失敗しましたが、DB更新は続行します');
      }
    }

    // DB更新
    const { data: updatedEntry, error: updateError } = await supabaseAdmin
      .from('cm_local_fax_phonebook')
      .update(updateData)
      .eq('id', entryId)
      .select()
      .single();

    if (updateError) {
      logger.error('ローカルFAX電話帳DB更新エラー', updateError);
      return NextResponse.json({ ok: false, error: '更新に失敗しました' }, { status: 500 });
    }

    logger.info('ローカルFAX電話帳更新完了', { id: entryId });

    return NextResponse.json({
      ok: true,
      entry: updatedEntry as CmLocalFaxPhonebookEntry,
    });
  } catch (error) {
    logger.error('ローカルFAX電話帳更新API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}

// =============================================================
// DELETE: 削除
// =============================================================
export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const url = req.url; // ESLint対策
    const entryId = parseInt(id, 10);

    if (isNaN(entryId)) {
      return NextResponse.json({ ok: false, error: '無効なIDです' }, { status: 400 });
    }

    logger.info('ローカルFAX電話帳削除', { id: entryId, url });

    // 既存レコードを取得
    const { data: existingEntry, error: fetchError } = await supabaseAdmin
      .from('cm_local_fax_phonebook')
      .select('*')
      .eq('id', entryId)
      .single();

    if (fetchError || !existingEntry) {
      logger.error('ローカルFAX電話帳取得エラー', fetchError);
      return NextResponse.json({ ok: false, error: '対象のエントリが見つかりません' }, { status: 404 });
    }

    // GAS Web App経由でXMLから削除（source_idがある場合のみ）
    const gasWebAppUrl = await getServiceUrl(SERVICE_NAMES.LOCAL_FAX_PHONEBOOK_GAS);
    
    if (gasWebAppUrl && existingEntry.source_id) {
      try {
        const gasRequest: CmPhonebookGasDeleteRequest = {
          action: 'delete',
          source_id: existingEntry.source_id,
        };

        const gasResponse = await fetch(gasWebAppUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gasRequest),
        });

        const gasResult: CmPhonebookGasUpdateDeleteResponse = await gasResponse.json();

        if (!gasResult.ok) {
          logger.error('GAS API削除エラー', { error: gasResult.error });
          return NextResponse.json({ ok: false, error: gasResult.error || 'XMLからの削除に失敗しました' }, { status: 500 });
        }

        logger.info('GAS API削除成功', { sourceId: existingEntry.source_id });
      } catch (gasError) {
        logger.error('GAS API通信エラー', gasError);
        return NextResponse.json({ ok: false, error: 'XMLサーバーとの通信に失敗しました' }, { status: 500 });
      }
    }

    // DBから削除
    const { error: deleteError } = await supabaseAdmin
      .from('cm_local_fax_phonebook')
      .delete()
      .eq('id', entryId);

    if (deleteError) {
      logger.error('ローカルFAX電話帳DB削除エラー', deleteError);
      return NextResponse.json({ ok: false, error: '削除に失敗しました' }, { status: 500 });
    }

    logger.info('ローカルFAX電話帳削除完了', { id: entryId });

    return NextResponse.json({
      ok: true,
      deletedId: entryId,
    });
  } catch (error) {
    logger.error('ローカルFAX電話帳削除API予期せぬエラー', error);
    return NextResponse.json({ ok: false, error: 'サーバーエラーが発生しました' }, { status: 500 });
  }
}