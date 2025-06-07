'use client';

import { createContext, useContext } from "react";

export const RoleContext = createContext<string | null>(null);

export const useUserRole = () => {
  return useContext(RoleContext);
};
