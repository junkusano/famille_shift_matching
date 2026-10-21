'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { isCompanyCarDistanceIndexStaffName } from '@/constants/distanceIndexAccess';

export type Role = 'admin' | 'manager' | 'member' | 'occupational_physician' | null;

export interface RoleContextValue {
  role: Role;
  userId: string | null;
  loading: boolean;
  canViewDistanceIndex: boolean;
}

// Context自体は非公開にして、hookでのみアクセスさせる
const RoleContext = createContext<RoleContextValue | undefined>(undefined);

export const RoleProvider = ({ children }: { children: React.ReactNode }) => {
  const [role, setRole] = useState<Role>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [canViewDistanceIndex, setCanViewDistanceIndex] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
          .from('users')
          .select('user_id, system_role')
          .eq('auth_user_id', user.id)
          .single();

        if (error) {
          console.error('Role fetch error:', error);
          if (mounted) setRole('member');
        } else {
          const { data: entryData } = await supabase
            .from('form_entries')
            .select('last_name_kanji, first_name_kanji')
            .eq('auth_uid', user.id)
            .maybeSingle();
          if (mounted) setUserId(data?.user_id ?? null);
          if (mounted) setRole((data?.system_role as Role) ?? 'member');
          if (mounted) {
            const currentRole = String(data?.system_role ?? '').toLowerCase();
            setCanViewDistanceIndex(
              currentRole === 'admin'
                || currentRole === 'manager'
                || isCompanyCarDistanceIndexStaffName(entryData?.last_name_kanji, entryData?.first_name_kanji),
            );
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  return (
    <RoleContext.Provider value={{ role, userId, loading, canViewDistanceIndex }}>
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

