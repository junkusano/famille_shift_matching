'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type Role = 'admin' | 'manager' | 'member' | null;

export interface RoleContextValue {
  role: Role;
  loading: boolean;
}

// ✅ named export: RoleContext を必ず export
export const RoleContext = createContext<RoleContextValue | undefined>(undefined);

// ✅ named export: RoleProvider / useRoleContext / useUserRole
export const RoleProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // ← スキーマに合わせて 'auth_uid' か 'auth_user_id' を統一
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
    <RoleContext.Provider value={{ role, loading }}>
      {children}
    </RoleContext.Provider>
  );
};

// 新：{role, loading} が欲しいとき用
export const useRoleContext = (): RoleContextValue => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRoleContext must be used within RoleProvider');
  return ctx;
};

// 互換：従来どおり string の role だけ返す（既存ファイルを壊さない）
export const useUserRole = (): Role => useRoleContext().role;
