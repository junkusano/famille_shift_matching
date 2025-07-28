'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface ShiftData {
  shift_id: string;
  shift_start_date: string;
  shift_start_time: string;
  service_code: string;
  kaipoke_cs_id: string;
  address: string;
  client_name: string;
  gender_request_name: string;
  male_flg: boolean;
  female_flg: boolean;
  staff_01_user_id?: string;
  staff_02_user_id?: string;
  staff_03_user_id?: string;
}

export default function ShiftCoordinatePage() {
  const [shifts, setShifts] = useState<ShiftData[]>([]);
  const [filteredShifts, setFilteredShifts] = useState<ShiftData[]>([]);
  const [selectedShift, setSelectedShift] = useState<ShiftData | null>(null);
  const [accountId, setAccountId] = useState<string>('');

  const [serviceCodeFilter, setServiceCodeFilter] = useState('');
  const [addressFilter, setAddressFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [genderFilter, setGenderFilter] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 15;

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

      const { data, error } = await supabase.rpc('get_shift_with_info');
      if (!error && data) {
        setShifts(data);
        setFilteredShifts(data);
      }
    };

    fetchUserInfo();
  }, []);

  useEffect(() => {
    const filtered = shifts.filter(shift =>
      (!serviceCodeFilter || shift.service_code.includes(serviceCodeFilter)) &&
      (!addressFilter || shift.address.includes(addressFilter)) &&
      (!nameFilter || shift.client_name.includes(nameFilter)) &&
      (!genderFilter || shift.gender_request_name.includes(genderFilter))
    );
    setFilteredShifts(filtered);
    setCurrentPage(1);
  }, [serviceCodeFilter, addressFilter, nameFilter, genderFilter, shifts]);

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

  const totalPages = Math.ceil(filteredShifts.length / itemsPerPage);
  const paginatedShifts = filteredShifts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  return (
    <div className="content">
      <h2 className="text-xl font-bold mb-4">シフトセルフコーディネート</h2>

      <div className="mb-4 flex flex-wrap gap-2">
        <input type="text" placeholder="種別で絞り込み" className="border p-1" value={serviceCodeFilter} onChange={(e) => setServiceCodeFilter(e.target.value)} />
        <input type="text" placeholder="市区町村で絞り込み" className="border p-1" value={addressFilter} onChange={(e) => setAddressFilter(e.target.value)} />
        <input type="text" placeholder="利用者名で絞り込み" className="border p-1" value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} />
        <input type="text" placeholder="性別希望で絞り込み" className="border p-1" value={genderFilter} onChange={(e) => setGenderFilter(e.target.value)} />
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {paginatedShifts.map((shift) => (
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

      <div className="flex justify-between items-center mt-6">
        <button disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="px-3 py-1 border rounded">
          ◀ 前へ
        </button>
        <span>{currentPage} / {totalPages}</span>
        <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(p => p + 1)} className="px-3 py-1 border rounded">
          次へ ▶
        </button>
      </div>
    </div>
  );
}
