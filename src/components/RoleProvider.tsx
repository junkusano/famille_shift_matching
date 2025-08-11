'use client';

import React from 'react';
import { RoleProvider as RoleContextProvider } from '@/context/RoleContext';

export default function RoleProvider({ children }: { children: React.ReactNode }) {
  return <RoleContextProvider>{children}</RoleContextProvider>;
}
