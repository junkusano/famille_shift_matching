'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';

export type Role = 'admin' | 'manager' | 'member' | null;

export interface RoleContextValue {
  role: Role;
  loading: boolean;
}

// Context自体は非公開にして、hookでのみアクセスさせる
const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const RoleProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('users')
          .select('system_role')
          .eq('auth_user_id', user.id)
          .single();

        if (error) {
          console.error('Role fetch error:', error);
          if (mounted) setRole('member');
        } else {
          if (mounted) setRole((data?.system_role as Role) ?? 'member');
        }
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

// roleとloading両方使う場合はこちら
export const useRoleContext = (): RoleContextValue => {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error('useRoleContext must be used within RoleProvider');
  return ctx;
};

// roleだけを返すhook（既存コードのstring型期待に対応）
export const useUserRole = (): Role => {
  return useRoleContext().role;
};

