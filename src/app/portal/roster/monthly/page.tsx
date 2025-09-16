//portal/monthly/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'

type Shift = {
    shift_id: string;
    shift_start_date: string;
    shift_start_time: string;
    shift_end_time: string;
    service_code: string;
    staff_01_user_id?: string;
    staff_02_user_id?: string;
    staff_03_user_id?: string;
    staff_02_attend_flg: boolean;
    staff_03_attend_flg: boolean;
}

type User = {
    kaipoke_cs_id: string;
    name: string;
}

const ShiftRosterPage = () => {
    const [shifts, setShifts] = useState<Shift[]>([])  // シフトデータ
    const [users, setUsers] = useState<User[]>([])    // 利用者データ
    const [selectedUser, setSelectedUser] = useState('')  // 選択された利用者
    const [selectedMonth, setSelectedMonth] = useState('')  // 選択された実施月
    const [error, setError] = useState('')

    // 利用者リストを取得する関数
    const fetchUsers = async () => {
        const res = await fetch('/api/users')  // 利用者APIを呼び出す
        const data = await res.json()
        setUsers(data)
    }

    // 月リストの生成（過去5年、未来12ヶ月）
    const generateMonthList = () => {
        const months = []
        const currentDate = new Date()
        const currentMonth = currentDate.getMonth()
        const currentYear = currentDate.getFullYear()

        // 過去5年分（60ヶ月）
        for (let i = 60; i > 0; i--) {
            const prevMonth = new Date(currentYear, currentMonth - i)
            months.push({
                value: `${prevMonth.getFullYear()}${(prevMonth.getMonth() + 1).toString().padStart(2, '0')}`,
                label: `${prevMonth.getFullYear()}年${(prevMonth.getMonth() + 1)}月`,
            })
        }

        // 未来12ヶ月
        for (let i = 0; i < 12; i++) {
            const nextMonth = new Date(currentYear, currentMonth + i)
            months.push({
                value: `${nextMonth.getFullYear()}${(nextMonth.getMonth() + 1).toString().padStart(2, '0')}`,
                label: `${nextMonth.getFullYear()}年${(nextMonth.getMonth() + 1)}月`,
            })
        }

        return months
    }

    // シフトデータを取得する関数
    const fetchShifts = async (kaipokeCsId: string, month: string) => {
        const res = await fetch(`/api/shifts?kaipoke_cs_id=${kaipokeCsId}&month=${month}`)
        const data = await res.json()

        if (res.ok) {
            setShifts(data)
        } else {
            setError(data.error || 'シフトの取得に失敗しました')
        }
    }

    // ユーザー選択と月選択時にデータを更新
    useEffect(() => {
        fetchUsers()  // 利用者情報を取得

        if (selectedUser && selectedMonth) {
            fetchShifts(selectedUser, selectedMonth)
        }
    }, [selectedUser, selectedMonth])

    const handleSave = async (shiftId: string, updatedData: Shift) => {
        updatedData.shift_id = shiftId; // updatedDataにshift_idを含める

        const res = await fetch('/api/shifts', {
            method: 'PUT',
            body: JSON.stringify(updatedData),
            headers: { 'Content-Type': 'application/json' },
        })

        if (res.ok) {
            alert('シフトデータが保存されました')
        } else {
            alert('シフトデータの保存に失敗しました')
        }
    }

    return (
        <div>
            <div className="filters">
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger>
                        <SelectValue placeholder="利用者を選択" />
                    </SelectTrigger>
                    <SelectContent>
                        {users.map(user => (
                            <SelectItem key={user.kaipoke_cs_id} value={user.kaipoke_cs_id}>
                                {user.name}  {/* 利用者名を表示 */}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                        <SelectValue placeholder="実施月を選択" />
                    </SelectTrigger>
                    <SelectContent>
                        {generateMonthList().map(month => (
                            <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {error && <div className="error">{error}</div>}

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Shift ID</TableHead>
                        <TableHead>サービス</TableHead>
                        <TableHead>スタッフ 1</TableHead>
                        <TableHead>スタッフ 2</TableHead>
                        <TableHead>スタッフ 3</TableHead>
                        <TableHead>スタッフ 2 出席</TableHead>
                        <TableHead>スタッフ 3 出席</TableHead>
                        <TableHead>保存</TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {shifts.length ? (
                        shifts.map(shift => (
                            <TableRow key={shift.shift_id}>
                                <TableCell>{shift.shift_id}</TableCell>
                                <TableCell>{shift.service_code}</TableCell>
                                <TableCell>
                                    <select value={shift.staff_01_user_id}>
                                        {users.map(user => (
                                            <option key={user.kaipoke_cs_id} value={user.kaipoke_cs_id}>{user.name}</option>
                                        ))}
                                    </select>
                                </TableCell>
                                <TableCell>
                                    <select value={shift.staff_02_user_id}>
                                        {users.map(user => (
                                            <option key={user.kaipoke_cs_id} value={user.kaipoke_cs_id}>{user.name}</option>
                                        ))}
                                    </select>
                                </TableCell>
                                <TableCell>
                                    <select value={shift.staff_03_user_id}>
                                        {users.map(user => (
                                            <option key={user.kaipoke_cs_id} value={user.kaipoke_cs_id}>{user.name}</option>
                                        ))}
                                    </select>
                                </TableCell>
                                <TableCell>
                                    <input
                                        type="checkbox"
                                        checked={shift.staff_02_attend_flg}
                                        onChange={() => handleSave(shift.shift_id, { ...shift, staff_02_attend_flg: !shift.staff_02_attend_flg })}
                                    />
                                </TableCell>
                                <TableCell>
                                    <input
                                        type="checkbox"
                                        checked={shift.staff_03_attend_flg}
                                        onChange={() => handleSave(shift.shift_id, { ...shift, staff_03_attend_flg: !shift.staff_03_attend_flg })}
                                    />
                                </TableCell>
                                <TableCell>
                                    <button onClick={() => handleSave(shift.shift_id, shift)}>保存</button>
                                </TableCell>
                            </TableRow>
                        ))
                    ) : (
                        <TableRow>
                            <TableCell colSpan={8}>データが見つかりません</TableCell>
                        </TableRow>
                    )}
                </TableBody>
            </Table>
        </div>
    )
}

export default ShiftRosterPage
