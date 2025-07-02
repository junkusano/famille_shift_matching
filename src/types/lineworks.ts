// ✅ src/types/lineworks.ts

export type User = {
  userId: string;
  email?: string;
  userName?: {
    firstName?: string;
    lastName?: string;
  };
  nickName?: string;
  organizations?: {
    organizationName?: string;
    orgUnits?: {
      orgUnitId?: string;
      orgUnitName?: string;
      positionName?: string;
    }[];
    levelCode?: string;
    levelName?: string;
  }[];
};
