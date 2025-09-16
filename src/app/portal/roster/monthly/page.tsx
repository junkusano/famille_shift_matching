//portal/monthly/page.tsx

'use client'

import { useState, useEffect } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

type KaipokeCS = {
    kaipoke_cs_id: string
    name: string
}

type User = {
    user_id: string
    full_name: string
}

type Shift = {
    shift_id: string
    shift_start_date: string
    shift_start_time: string
    shift_end_time: string
    service_code: string
    staff_01_user_id?: string
    staff_02_user_id?: string
    staff_03_user_id?: string
    staff_02_attend_flg: boolean
    staff_03_attend_flg: boolean
    required_staff_count: number
    two_person_work_flg: boolean
    judo_ido: string
    name: string // 利用者名
}

const ShiftRosterPage = () => {
    const [users, setUsers] = useState<User[]>([]) // スタッフ（users）のデータ
    const [kaipokeCSList, setKaipokeCSList] = useState<KaipokeCS[]>([]) // 利用者（kaipoke_cs_info）のデータ
    const [selectedKaipokeCS, setSelectedKaipokeCS] = useState<string | null>(null) // 選択した利用者のID
    const [selectedMonth, setSelectedMonth] = useState<string>(new Date().toISOString().slice(0, 7))  // 初期値を今月に設定
    const [editedShifts, setEditedShifts] = useState<Shift[]>([]) // 編集用シフトデータ

    // 利用者（kaipoke_cs_info）情報を取得
    const fetchKaipokeCSList = async () => {
        const res = await fetch('/api/kaipoke-info') // /api/kaipoke-info APIから利用者データを取得
        const data = await res.json()
        setKaipokeCSList(data)

        if (data.length > 0) {
            setSelectedKaipokeCS(data[0].kaipoke_cs_id) // 初期値として最初の利用者を設定
        }
    }

    // スタッフ（users）情報を取得
    const fetchUsers = async () => {
        const res = await fetch('/api/users') // /api/users APIからスタッフデータを取得
        const data = await res.json()
        setUsers(data)
    }

    // シフト情報を取得
    const fetchShifts = async () => {
        if (selectedKaipokeCS && selectedMonth) {
            const res = await fetch(`/api/shifts?kaipoke_cs_id=${selectedKaipokeCS}&month=${selectedMonth}`)
            const data = await res.json()
            setEditedShifts(data)
        }
    }

    useEffect(() => {
        fetchKaipokeCSList() // 利用者情報を取得
        fetchUsers() // スタッフ情報を取得
    }, [])

    useEffect(() => {
        fetchShifts() // シフト情報を取得
    }, [selectedKaipokeCS, selectedMonth]) // 利用者または月が変更されるたびにシフトを再取得

    // シフトデータの変更をハンドリング
    const handleEditChange = <K extends keyof Shift>(shiftId: string, field: K, value: Shift[K]) => {
        setEditedShifts(prev =>
            prev.map(shift => shift.shift_id === shiftId ? { ...shift, [field]: value } : shift)
        )
    }

    // シフトデータの保存
    const handleSave = async (shiftId: string) => {
        const shift = editedShifts.find(s => s.shift_id === shiftId)
        if (!shift) return

        const res = await fetch('/api/shifts', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(shift),
        })

        if (res.ok) {
            alert('シフトが保存されました')
        } else {
            alert('シフトの保存に失敗しました')
        }
    }

    // シフトデータの参照ボタン
    const handleShiftRecord = async (shiftId: string) => {
        console.log(`Shift Record for shift_id: ${shiftId}`)
    }

    return (
        <div className="w-full overflow-x-auto p-4">
            <h2 className="text-lg font-semibold mb-4">シフト管理</h2>

            {/* 利用者選択セレクトボックス */}
            <label htmlFor="kaipoke_cs_id">利用者</label>
            <Select value={selectedKaipokeCS} onValueChange={setSelectedKaipokeCS}>
                <SelectTrigger>
                    <SelectValue placeholder="利用者を選択" />
                </SelectTrigger>
                <SelectContent>
                    {kaipokeCSList.map(cs => (
                        <SelectItem key={cs.kaipoke_cs_id} value={cs.kaipoke_cs_id}>
                            {cs.name}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            {/* 月選択セレクトボックス */}
            <label htmlFor="month">実施月</label>
            <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger>
                    <SelectValue placeholder="月を選択" />
                </SelectTrigger>
                <SelectContent>
                    {['2023-09', '2023-10', '2023-11'].map((month) => (
                        <SelectItem key={month} value={month}>
                            {month}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>利用者名</TableHead>
                        <TableHead>サービス</TableHead>
                        <TableHead>スタッフ 1</TableHead>
                        <TableHead>スタッフ 2</TableHead>
                        <TableHead>スタッフ 3</TableHead>
                        <TableHead>同行</TableHead>
                        <TableHead>保存</TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {editedShifts.map(shift => (
                        <TableRow key={shift.shift_id}>
                            <TableCell>{shift.name}</TableCell>
                            <TableCell>{shift.service_code}</TableCell>
                            <TableCell>
                                <Select
                                    value={shift.staff_01_user_id}
                                    onValueChange={value => handleEditChange(shift.shift_id, 'staff_01_user_id', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="スタッフを選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.map(user => (
                                            <SelectItem key={user.user_id} value={user.user_id}>
                                                {user.full_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Select
                                    value={shift.staff_02_user_id}
                                    onValueChange={value => handleEditChange(shift.shift_id, 'staff_02_user_id', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="スタッフを選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.map(user => (
                                            <SelectItem key={user.user_id} value={user.user_id}>
                                                {user.full_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Select
                                    value={shift.staff_03_user_id}
                                    onValueChange={value => handleEditChange(shift.shift_id, 'staff_03_user_id', value)}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder="スタッフを選択" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {users.map(user => (
                                            <SelectItem key={user.user_id} value={user.user_id}>
                                                {user.full_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <input
                                    type="checkbox"
                                    checked={shift.staff_02_attend_flg}
                                    onChange={e => handleEditChange(shift.shift_id, 'staff_02_attend_flg', e.target.checked)}
                                />
                            </TableCell>
                            <TableCell>
                                <Button onClick={() => handleSave(shift.shift_id)}>保存</Button>
                                <Button onClick={() => handleShiftRecord(shift.shift_id)}>シフト記録</Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

export default ShiftRosterPage
