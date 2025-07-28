'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SupabaseShiftRaw, ShiftData } from '@/types/shift';

export default function ShiftPage() {
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [selectedShift, setSelectedShift] = useState<ShiftData | null>(null);
  const [accountId, setAccountId] = useState<string>('');

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userRecord } = await supabase
        .from('users')
        .select('account_id')
        .eq('auth_user_id', user.id)
        .single();

      setAccountId(userRecord?.account_id || '');

      const response = await supabase
        .from('shift')
        .select(`
          shift_id,
          shift_start_date,
          shift_start_time,
          service_code,
          kaipoke_cs_id,
          staff_01_user_id,
          staff_02_user_id,
          staff_03_user_id,
          cs_kaipoke_info:cs_kaipoke_info(
            address,
            name,
            gender_request,
            cs_gender_request:cs_gender_request(gender_request_name, male_flg, female_flg)
          )
        `)
        .gte('shift_start_date', new Date().toISOString().split('T')[0]);

      if (response.error) {
        console.error('データ取得エラー:', response.error.message);
        return;
      }

      const data = response.data as SupabaseShiftRaw[];

      const formatted = data.map((s): ShiftData => ({
        shift_id: s.shift_id,
        shift_start_date: s.shift_start_date,
        shift_start_time: s.shift_start_time,
        service_code: s.service_code,
        kaipoke_cs_id: s.kaipoke_cs_id,
        staff_01_user_id: s.staff_01_user_id,
        staff_02_user_id: s.staff_02_user_id,
        staff_03_user_id: s.staff_03_user_id,
        address: s.cs_kaipoke_info?.postal_code || '',
        client_name: s.cs_kaipoke_info?.name || '',
        gender_request_name: s.cs_kaipoke_info?.gender_request?.gender_request_name || '',
        male_flg: s.cs_kaipoke_info?.gender_request?.male_flg || false,
        female_flg: s.cs_kaipoke_info?.gender_request?.female_flg || false
      }));

      setShifts(formatted);
    };

    fetchUserInfo();
  }, []);

  const handleConfirm = async () => {
    if (!selectedShift) return;

    const res = await fetch('/api/shift-coodinate-rpa-request', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kaipoke_cs_id: selectedShift.kaipoke_cs_id,
        service_code: selectedShift.service_code,
        shift_start_date: selectedShift.shift_start_date,
        shift_start_time: selectedShift.shift_start_time,
        staff_01_user_id: selectedShift.staff_01_user_id,
        staff_02_user_id: selectedShift.staff_02_user_id,
        staff_03_user_id: selectedShift.staff_03_user_id,
        requested_by: accountId,
      }),
    });

    if (res.ok) {
      alert('希望を送信しました');
      setSelectedShift(null);
    } else {
      const err = await res.json();
      alert(`送信に失敗しました: ${err.error}`);
    }
  };

  return (
    <div className="content">
      <h2 className="text-xl font-bold mb-4">シフト一覧</h2>
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {shifts.map((shift) => (
          <Card key={shift.shift_id} className="shadow">
            <CardContent className="p-4">
              <div className="text-sm font-semibold">{shift.shift_start_date} {shift.shift_start_time}</div>
              <div className="text-sm">種別: {shift.service_code}</div>
              <div className="text-sm">市区町村: {shift.address}</div>
              <div className="text-sm">利用者名: {shift.client_name}</div>
              <div className="text-sm">性別希望: {shift.gender_request_name}</div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button onClick={() => setSelectedShift(shift)} className="mt-2 w-full text-xs">
                    このシフトを希望する
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <div className="text-base font-semibold mb-2">このシフトを希望しますか？</div>
                  <Button onClick={handleConfirm}>OK（希望を送信）</Button>
                </DialogContent>
              </Dialog>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
