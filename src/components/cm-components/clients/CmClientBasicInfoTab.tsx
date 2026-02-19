// =============================================================
// src/components/cm-components/clients/CmClientBasicInfoTab.tsx
// 利用者詳細 - 基本情報タブ
// =============================================================

'use client';

import React from 'react';
import { Phone, ExternalLink } from 'lucide-react';
import { CmCard } from '@/components/cm-components/ui/CmCard';
import { CmClientDetailRow } from './CmClientDetailRow';
import { cmFormatAddress, cmCalculateAge } from '@/lib/cm/utils';
import type { CmClientDetail } from '@/types/cm/clientDetail';
import styles from '@/styles/cm-styles/clients/basicInfoTab.module.css';

type Props = {
  client: CmClientDetail;
};

export function CmClientBasicInfoTab({ client }: Props) {
  const age = cmCalculateAge(client.birth_date);
  const fullAddress = cmFormatAddress(client) + (client.building ? ` ${client.building}` : '');

  const openMap = (address: string) => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
      '_blank'
    );
  };

  return (
    <div className={styles.grid}>
      {/* 基本情報 */}
      <CmCard title="基本情報">
        <dl className={styles.definitionList}>
          <CmClientDetailRow label="氏名" value={client.name} />
          <CmClientDetailRow label="氏名（カナ）" value={client.kana} />
          <CmClientDetailRow label="性別" value={client.gender} />
          <CmClientDetailRow
            label="生年月日"
            value={client.birth_date}
            subValue={age ? `${age}歳` : undefined}
          />
          <CmClientDetailRow label="カイポケID" value={client.kaipoke_cs_id} mono />
          <CmClientDetailRow label="利用者の状態" value={client.client_status} />
          <CmClientDetailRow label="契約日" value={client.contract_date} />
        </dl>
      </CmCard>

      {/* 住所・連絡先 */}
      <CmCard title="住所・連絡先">
        <dl className={styles.definitionList}>
          <CmClientDetailRow
            label="郵便番号"
            value={client.postal_code ? `〒${client.postal_code}` : null}
          />
          <div>
            <dt className={styles.addressLabel}>住所</dt>
            <dd className={styles.addressValue}>
              {fullAddress || '-'}
              {fullAddress && (
                <button
                  onClick={() => openMap(fullAddress)}
                  className={styles.mapLink}
                >
                  <ExternalLink className={styles.mapIcon} />
                  地図
                </button>
              )}
            </dd>
          </div>
          <CmClientDetailRow
            label="電話番号1"
            value={client.phone_01}
            link={client.phone_01 ? `tel:${client.phone_01}` : undefined}
            icon={<Phone className={styles.mapIcon} />}
          />
          <CmClientDetailRow
            label="電話番号2"
            value={client.phone_02}
            link={client.phone_02 ? `tel:${client.phone_02}` : undefined}
            icon={<Phone className={styles.mapIcon} />}
          />
        </dl>
      </CmCard>

      {/* 備考 */}
      <CmCard title="備考" className={styles.fullWidth}>
        <div className={styles.remarks}>
          {client.biko || '（備考なし）'}
        </div>
      </CmCard>
    </div>
  );
}
