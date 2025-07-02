// ✅ src/types/lineworks.ts

export type User = {
  userId: string;
  userExternalKey?: string;
  isAdministrator?: boolean;
  isPending?: boolean;
  isSuspended?: boolean;
  isDeleted?: boolean;
  isAwaiting?: boolean;
  suspendedReason?: string | null;
  email?: string;
  userName?: {
    firstName?: string;
    lastName?: string;
    phoneticFirstName?: string | null;
    phoneticLastName?: string | null;
  };
  i18nName?: string[];
  nickName?: string;
  privateEmail?: string;
  aliasEmails?: string[];
  employmentTypeId?: string | null;
  employmentTypeName?: string | null;
  employmentTypeExternalKey?: string | null;
  userTypeId?: string | null;
  userTypeName?: string | null;
  userTypeExternalKey?: string | null;
  userTypeCode?: string | null;
  searchable?: boolean;
  organizations?: {
    domainId?: number;
    primary?: boolean;
    userExternalKey?: string | null;
    email?: string;
    levelId?: string;
    levelExternalKey?: string | null;
    levelName?: string;
    executive?: boolean;
    organizationName?: string;
    orgUnits?: {
      orgUnitId?: string;
      orgUnitExternalKey?: string | null;
      orgUnitEmail?: string;
      orgUnitName?: string;
      primary?: boolean;
      positionId?: string;
      positionExternalKey?: string | null;
      positionName?: string;
      isManager?: boolean;
      visible?: boolean;
      useTeamFeature?: boolean;
    }[];
  }[];
  telephone?: string;
  cellPhone?: string;
  location?: string;
  task?: string;
  messenger?: {
    protocol?: string;
    messengerId?: string;
  };
  birthdayCalendarType?: string;
  birthday?: string;
  locale?: string;
  hiredDate?: string;
  timeZone?: string;
  leaveOfAbsence?: {
    startTime?: string | null;
    endTime?: string | null;
    isLeaveOfAbsence?: boolean;
  };
  customFields?: {
    customFieldId: string;
    value: string;
    link?: string | null;
  }[];
  relations?: {
    relationUserId: string;
    relationName: string;
    externalKey: string;
  }[];
  activationDate?: string;
  employeeNumber?: string;
};

// OrgUnit用のメンバー定義
export type OrgUnitAllowedMember = {
  userId: string;
  userExternalKey?: string;
};

// OrgUnit本体（GET /orgunits の1要素）
export type OrgUnit = {
  domainId: number;
  orgUnitId: string;
  orgUnitExternalKey?: string;
  orgUnitName: string;
  email?: string;
  description?: string;
  visible?: boolean;
  parentOrgUnitId?: string;
  parentExternalKey?: string;
  displayOrder?: number;
  displayLevel?: number;
  canReceiveExternalMail?: boolean;
  useMessage?: boolean;
  useNote?: boolean;
  useCalendar?: boolean;
  useTask?: boolean;
  useFolder?: boolean;
  useServiceNotification?: boolean;
  aliasEmails?: string[];
  membersAllowedToUseOrgUnitEmailAsRecipient?: OrgUnitAllowedMember[];
  membersAllowedToUseOrgUnitEmailAsSender?: OrgUnitAllowedMember[];
};

export type Level = {
  levelId: string;
  displayOrder: number;
  levelName: string;
  levelExternalKey?: string;
  executive: boolean;
};
