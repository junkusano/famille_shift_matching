'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'

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

type User = {
    kaipoke_cs_id: string
    name: string
}

const ShiftRosterPage = () => {
    const [editedShifts, setEditedShifts] = useState<Shift[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [selectedUser, setSelectedUser] = useState<string>('') // 初期値を設定
    const [selectedMonth, setSelectedMonth] = useState<string>('')

    useEffect(() => {
        const fetchUsers = async () => {
            const res = await fetch('/api/users')
            const data = await res.json()
            const validUsers = data.filter((user: User) => user.name && user.kaipoke_cs_id)
            setUsers(validUsers)

            if (validUsers.length > 0) {
                setSelectedUser(validUsers[0].kaipoke_cs_id)
            }
        }

        const fetchShifts = async () => {
            if (selectedUser && selectedMonth) {
                const res = await fetch(`/api/shifts?kaipoke_cs_id=${selectedUser}&month=${selectedMonth}`)
                const data = await res.json()
                setEditedShifts(data)
            }
        }

        const currentMonth = new Date()
        const currentYearMonth = `${currentMonth.getFullYear()}${(currentMonth.getMonth() + 1).toString().padStart(2, '0')}`
        setSelectedMonth(currentYearMonth)

        fetchUsers()
        fetchShifts()
    }, [selectedUser, selectedMonth])

    const handleSave = async (shiftId: string, updatedData: Shift) => {
        const res = await fetch(`/api/shifts?shift_id=${shiftId}`, {
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
        <div className="w-full overflow-x-auto p-4">
            <h2 className="text-lg font-semibold mb-4">シフト管理</h2>

            <div className="flex space-x-4 mb-4">
                {/* 利用者セレクトボックス */}
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger>
                        <SelectValue placeholder="利用者を選択" />
                    </SelectTrigger>
                    <SelectContent>
                        {users.map((user) => (
                            <SelectItem key={user.kaipoke_cs_id} value={user.kaipoke_cs_id}>
                                {user.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>

                {/* 月セレクトボックス */}
                <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                    <SelectTrigger>
                        <SelectValue placeholder="月を選択" />
                    </SelectTrigger>
                    <SelectContent>
                        {[...Array(12)].map((_, index) => {
                            const month = new Date()
                            month.setMonth(month.getMonth() - index)
                            const yearMonth = `${month.getFullYear()}${(month.getMonth() + 1).toString().padStart(2, '0')}`
                            return (
                                <SelectItem key={yearMonth} value={yearMonth}>
                                    {`${month.getFullYear()}年${month.getMonth() + 1}月`}
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>
            </div>

            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>利用者名</TableHead>
                        <TableHead>Shift ID</TableHead>
                        <TableHead>サービス</TableHead>
                        <TableHead>スタッフ 1</TableHead>
                        <TableHead>スタッフ 2</TableHead>
                        <TableHead>同行</TableHead>
                        <TableHead>スタッフ 3</TableHead>
                        <TableHead>同行</TableHead>
                        <TableHead>必要職員数</TableHead>
                        <TableHead>2人作業</TableHead>
                        <TableHead>重度移動</TableHead>
                        <TableHead>保存</TableHead>
                    </TableRow>
                </TableHeader>

                <TableBody>
                    {editedShifts.map((shift) => (
                        <TableRow key={shift.shift_id}>
                            <TableCell>{shift.name}</TableCell>
                            <TableCell>{shift.shift_id}</TableCell>
                            <TableCell>{shift.service_code}</TableCell>
                            <TableCell>
                                {/* スタッフ1 */}
                            </TableCell>
                            <TableCell>
                                {/* スタッフ2 */}
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="checkbox"
                                    checked={shift.staff_02_attend_flg}
                                    onChange={(e) =>
                                        handleSave(shift.shift_id, { ...shift, staff_02_attend_flg: e.target.checked })
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                {/* スタッフ3 */}
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="checkbox"
                                    checked={shift.staff_03_attend_flg}
                                    onChange={(e) =>
                                        handleSave(shift.shift_id, { ...shift, staff_03_attend_flg: e.target.checked })
                                    }
                                />
                            </TableCell>
                            <TableCell>{shift.required_staff_count}</TableCell>
                            <TableCell>{shift.two_person_work_flg ? 'あり' : 'なし'}</TableCell>
                            <TableCell>{shift.judo_ido}</TableCell>
                            <TableCell>
                                <Button onClick={() => handleSave(shift.shift_id, shift)}>保存</Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

export default ShiftRosterPage
