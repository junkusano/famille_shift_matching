'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'  // Inputをインポート
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
}

type User = {
    user_id: string
    full_name: string
    qualifications: string[]
}

const ShiftRosterPage = () => {
    const [editedShifts, setEditedShifts] = useState<Shift[]>([])  // shiftsを削除してeditedShiftsを使用
    const [users, setUsers] = useState<User[]>([])

    useEffect(() => {
        const fetchShifts = async () => {
            const res = await fetch('/api/shifts?shift_id=1')  // 例として shift_id=1
            const data = await res.json()
            setEditedShifts(data)
        }

        const fetchUsers = async () => {
            const res = await fetch('/api/users')
            const data = await res.json()
            setUsers(data)
        }

        fetchShifts()
        fetchUsers()
    }, [])

    const handleEditChange = <K extends keyof Shift>(
        shiftId: string,
        field: K,
        value: Shift[K]
    ) => {
        // ここでArray.isArray()を使ってmapを安全に適用する
        if (Array.isArray(editedShifts)) {
            setEditedShifts(prev =>
                prev.map(shift => shift.shift_id === shiftId ? { ...shift, [field]: value } : shift)
            )
        }
    }


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

    const getUserOptions = (qualificationRequired: string) => {
        return users.filter(user => user.qualifications.includes(qualificationRequired))
    }

    return (
        <div className="w-full overflow-x-auto p-4">
            <h2 className="text-lg font-semibold mb-4">シフト管理</h2>

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
                    {editedShifts.map(shift => (
                        <TableRow key={shift.shift_id}>
                            <TableCell>{shift.shift_id}</TableCell>
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
                                        {getUserOptions('service_staff').map(user => (
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
                                        {getUserOptions('service_staff').map(user => (
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
                                        {getUserOptions('service_staff').map(user => (
                                            <SelectItem key={user.user_id} value={user.user_id}>
                                                {user.full_name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="checkbox"
                                    checked={shift.staff_02_attend_flg}
                                    onChange={e =>
                                        handleEditChange(shift.shift_id, 'staff_02_attend_flg', e.target.checked)
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                <Input
                                    type="checkbox"
                                    checked={shift.staff_03_attend_flg}
                                    onChange={e =>
                                        handleEditChange(shift.shift_id, 'staff_03_attend_flg', e.target.checked)
                                    }
                                />
                            </TableCell>
                            <TableCell>
                                <Button onClick={() => handleSave(shift.shift_id)}>保存</Button>
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </div>
    )
}

export default ShiftRosterPage
