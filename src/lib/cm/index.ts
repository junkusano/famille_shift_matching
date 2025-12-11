// src/lib/cm/index.ts

export type {
  UserSource,
  CmRole,
  CmUserData,
  CmUserContextValue,
  UserAdapter,
} from './types';

export {
  getAdapter,
  fetchCmUser,
  updateCmUserPhoto,
  getDefaultSource,
  supabaseAdapter,
  mockAdapter,
  kaipokeAdapter,
} from './userAdapter';

export { setMockRole, setMockUser, resetMock } from './adapters/mockAdapter';