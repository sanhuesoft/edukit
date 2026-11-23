import type {
  LevelCode,
  NonTeachingActivityType,
  RoomType,
  RuleTargetEntityType,
  RuleWeight,
  ScheduleChangeActionType,
  ScheduleVersionStatus,
  SchedulingRuleType,
  SlotType,
  TeacherAssignmentRole,
} from "@prisma/client";
import type { AISuggestionItem } from "@/services/ScheduleAIService";
import type {
  ConflictAuditResult,
  PreconditionResult,
} from "@/services/TimetableSolverService";
import type { SubstitutionSlotPlan } from "@/services/ScheduleOperationsService";

export interface TimeSlotDTO {
  id: string;
  bellScheduleId: string;
  dayOfWeek: number;
  blockNumber: number;
  pairGroupId: number | null;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  slotType: SlotType;
}

export interface BellScheduleDTO {
  id: string;
  schoolId: string;
  name: string;
  applicableLevels: LevelCode[];
  timeSlots: TimeSlotDTO[];
}

export interface RoomDTO {
  id: string;
  name: string;
  capacity: number;
  roomType: RoomType;
  campus?: string | null;
  floor?: number;
  equipmentTags?: string[];
}

export interface SubjectDTO {
  id: string;
  name: string;
  code: string;
  requiresRoomType: RoomType | null;
  requiredRoomId?: string | null;
  cognitiveWeight?: number;
  requiredEquipment?: string | null;
}

export interface TeacherDTO {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  contractHours: number;
  maxTeachingBlocks: number;
  maxDailyHours: number;
  ley20903Ratio: "AUTO" | "65_35" | "60_40";
  colorHex: string;
  qualifiedSubjects: Array<{ subjectId: string; subject: SubjectDTO }>;
  qualifiedLevels: Array<{ levelCode: LevelCode }>;
  courseSubjects: Array<{
    id: string;
    role: TeacherAssignmentRole;
    assignedBlocks: number | null;
    courseSubject: {
      id: string;
      weeklyBlocks: number;
      course: { id: string; name: string; levelCode: LevelCode };
      subject: { id: string; name: string; code: string };
    };
  }>;
}

export interface CourseSubjectDTO {
  id: string;
  courseId: string;
  subjectId: string;
  weeklyBlocks: number;
  requiresConsecutiveBlocks: boolean;
  syncGroupCode: string | null;
  isSplitClass: boolean;
  subject: SubjectDTO;
  teachers: Array<{
    id: string;
    teacherId: string;
    role: TeacherAssignmentRole;
    assignedBlocks: number | null;
    teacher: {
      id: string;
      firstName: string;
      lastName: string;
      colorHex: string;
    };
  }>;
}

export interface CourseDTO {
  id: string;
  bellScheduleId: string;
  name: string;
  code: string;
  levelCode: LevelCode;
  defaultRoomId: string | null;
  studentCount?: number;
  requiresGroundFloor?: boolean;
  bellSchedule: { id: string; name: string };
  defaultRoom: RoomDTO | null;
  courseSubjects: CourseSubjectDTO[];
}

export interface SchedulingRuleDTO {
  id: string;
  ruleType: SchedulingRuleType;
  weight: RuleWeight;
  penaltyScore: number;
  targetEntityType: RuleTargetEntityType;
  targetEntityId: string | null;
  parameters: Record<string, unknown>;
}

export interface ScheduleVersionSummaryDTO {
  id: string;
  name: string;
  status: ScheduleVersionStatus;
  versionLockNumber: number;
  fitnessScore: number;
  createdAt: string;
  _count: { entries: number; nonTeachingActivities: number; changeLogs: number };
}

export interface ScheduleEntryDTO {
  id: string;
  versionId: string;
  courseSubjectId: string;
  timeSlotId: string;
  roomId: string;
  isLocked: boolean;
  timeSlot: TimeSlotDTO;
  room: RoomDTO;
  courseSubject: {
    id: string;
    courseId: string;
    subjectId: string;
    weeklyBlocks: number;
    requiresConsecutiveBlocks: boolean;
    syncGroupCode: string | null;
    isSplitClass: boolean;
    course: { id: string; name: string; code: string; bellScheduleId: string };
    subject: SubjectDTO;
    teachers: Array<{
      id: string;
      teacherId: string;
      role: TeacherAssignmentRole;
      teacher: {
        id: string;
        firstName: string;
        lastName: string;
        colorHex: string;
      };
    }>;
  };
}

export interface NonTeachingActivityDTO {
  id: string;
  teacherId: string;
  timeSlotId: string;
  activityType: NonTeachingActivityType;
  title: string;
  roomId: string | null;
  teacher: { id: string; firstName: string; lastName: string; colorHex: string };
  timeSlot: TimeSlotDTO;
  room: RoomDTO | null;
}

export interface ChangeLogDTO {
  id: string;
  actionType: ScheduleChangeActionType;
  createdAt: string;
  user: { firstName: string; lastName: string; email: string };
}

export interface ScheduleVersionDetailDTO {
  id: string;
  schoolId: string;
  name: string;
  status: ScheduleVersionStatus;
  versionLockNumber: number;
  fitnessScore: number;
  aiSuggestions: AISuggestionItem[] | null;
  entries: ScheduleEntryDTO[];
  nonTeachingActivities: NonTeachingActivityDTO[];
  changeLogs: ChangeLogDTO[];
}

export interface SchoolSetupPayload {
  school: {
    id: string;
    name: string;
    rbd: string;
    commune: string;
    academicYear: number;
  } | null;
  bellSchedules: BellScheduleDTO[];
  rooms: RoomDTO[];
  subjects: SubjectDTO[];
  teachers: TeacherDTO[];
  courses: CourseDTO[];
  rules: SchedulingRuleDTO[];
  versions: ScheduleVersionSummaryDTO[];
}

export type { ConflictAuditResult, PreconditionResult, AISuggestionItem, SubstitutionSlotPlan };
