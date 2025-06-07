'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

const RoleContext = createContext<string | null>(null)

export const RoleProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<string | null>(null)

  useEffect(() => {
    const fetchRole = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data, error } = await supabase
        .from('users')
        .select('system_role')
        .eq('auth_user_id', user.id)
        .single()

      if (error) {
        console.error("role fetch error", error)
        setRole('member') // デフォルト
      } else {
        setRole(data.system_role || 'member')
      }
    }

    fetchRole()
  }, [])

  return (
    <RoleContext.Provider value={role}>
      {children}
    </RoleContext.Provider>
  )
}

export const useUserRole = () => useContext(RoleContext)
