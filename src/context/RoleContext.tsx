'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type Role = 'admin' | 'manager' | 'member' | null;

export interface RoleContextValue {
  role: Role;
  loading: boolean;
}

const Ctx = createContext<RoleContextValue | undefined>(undefined);

export function RoleProvider({ children }: { children: React.ReactNode }) {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // ← スキーマに合わせて調整（例: users.auth_uid / system_role）
        const { data } = await supabase
          .from('users')
          .select('system_role')
          .eq('auth_uid', user.id)
          .single();

        if (mounted) setRole((data?.system_role as Role) ?? 'member');
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => { mounted = false; };
  }, []);

  return (
    <Ctx.Provider value={{ role, loading }}>
      {children}
    </Ctx.Provider>
  );
}

/**
 * 新フック：{ role, loading } を返す（新コード用）
 */
export function useRoleContext(): RoleContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useRoleContext must be used within RoleProvider');
  return ctx;
}

/**
 * 互換フック：従来どおり role（string）だけ返す（既存コード用）
 * 既存の import { useUserRole } はそのままでOK
 */
export function useUserRole(): Role {
  return useRoleContext().role;
}
