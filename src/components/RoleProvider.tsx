'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { RoleContext } from '@/context/RoleContext';

export default function RoleProvider({ children }: { children: React.ReactNode }) {
    const [role, setRole] = useState<string | null>(null);

    useEffect(() => {
        const fetchRole = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                setRole(null);
                return;
            }
            const { data, error } = await supabase
                .from('users')
                .select('system_role')
                .eq('auth_user_id', user.id)
                .single();
            if (error) {
                console.error('ロール取得エラー:', error.message);
            }
            setRole(data?.system_role || 'member');
        };
        fetchRole();
    }, []);

    return (
        <RoleContext.Provider value={role}>
            {children}
        </RoleContext.Provider>
    );
}
