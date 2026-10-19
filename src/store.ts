import { useSyncExternalStore } from "react";
import type {
  AppData,
  AttendanceRecord,
  StudentTermResult,
  WeeklyAssessment,
} from "./model";

const STORAGE_KEY = "daftar-student-records-v1";
const listeners = new Set<() => void>();
const today = new Date();
const todayIso = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
  .toISOString()
  .slice(0, 10);

const blankData: AppData = {
  version: 1,
  classes: [],
  subjects: [],
  students: [],
  weeklyAssessments: [],
  examScores: [],
  attendance: [],
  termStartDate: todayIso,
};

let cachedData = readFromStorage();

function readFromStorage(): AppData {
  if (typeof window === "undefined") return blankData;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return blankData;
    const parsed = JSON.parse(stored) as Partial<AppData>;
    if (parsed.version !== 1) return blankData;
    return {
      ...blankData,
      ...parsed,
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      students: Array.isArray(parsed.students) ? parsed.students : [],
      weeklyAssessments: Array.isArray(parsed.weeklyAssessments)
        ? parsed.weeklyAssessments
        : [],
      examScores: Array.isArray(parsed.examScores) ? parsed.examScores : [],
      attendance: Array.isArray(parsed.attendance) ? parsed.attendance : [],
    };
  } catch {
    return blankData;
  }
}

export function getAppData(): AppData {
  return cachedData;
}

export function subscribeToAppData(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useAppData(): AppData {
  return useSyncExternalStore(subscribeToAppData, getAppData, getAppData);
}

export function updateAppData(
  update: (current: AppData) => AppData,
): { ok: true } | { ok: false; message: string } {
  const next = update(cachedData);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    cachedData = next;
    listeners.forEach((listener) => listener());
    return { ok: true };
  } catch (error) {
    const message =
      error instanceof DOMException && error.name === "QuotaExceededError"
        ? "مساحة التخزين ممتلئة. صدّر نسخة احتياطية قبل المتابعة."
        : "تعذر حفظ التغييرات على هذا الجهاز.";
    return { ok: false, message };
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      cachedData = readFromStorage();
      listeners.forEach((listener) => listener());
    }
  });
}

function addMonthsClamped(dateString: string, months: number): Date {
  const [year, month, day] = dateString.split("-").map(Number);
  const targetMonthIndex = month - 1 + months;
  const targetYear = year + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const lastDayOfMonth = new Date(targetYear, normalizedMonth + 1, 0).getDate();
  return new Date(targetYear, normalizedMonth, Math.min(day, lastDayOfMonth));
}

function toLocalIso(date: Date): string {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
}

export function getTermBounds(startDate: string): { start: string; end: string } {
  const start = new Date(`${startDate}T00:00:00`);
  const endExclusive = addMonthsClamped(startDate, 5);
  endExclusive.setDate(endExclusive.getDate() - 1);
  return { start: toLocalIso(start), end: toLocalIso(endExclusive) };
}

export function getStudentTermResult(
  data: AppData,
  classId: string,
  subjectId: string,
  studentId: string,
): StudentTermResult {
  const bounds = getTermBounds(data.termStartDate);
  const weekly = data.weeklyAssessments.filter(
    (record) =>
      record.classId === classId &&
      record.subjectId === subjectId &&
      record.studentId === studentId &&
      record.weekStart >= bounds.start &&
      record.weekStart <= bounds.end,
  );
  const weeklyScores = weekly.map(
    (record) =>
      record.homework + record.notebook + record.weekly + record.conduct,
  );
  const weeklyAverage =
    weeklyScores.length > 0
      ? weeklyScores.reduce((sum, score) => sum + score, 0) / weeklyScores.length
      : null;
  const exams = data.examScores.find(
    (record) =>
      record.classId === classId &&
      record.subjectId === subjectId &&
      record.studentId === studentId,
  );
  const examAverage =
    exams && exams.testOne !== null && exams.testTwo !== null
      ? (exams.testOne + exams.testTwo) / 2
      : null;
  const isComplete = weeklyAverage !== null && examAverage !== null;
  const attendance: AttendanceRecord[] = data.attendance.filter(
    (record) =>
      record.classId === classId &&
      record.studentId === studentId &&
      record.date >= bounds.start &&
      record.date <= bounds.end &&
      record.status === "absent",
  );
  return {
    weeklyAverage,
    examAverage,
    total: isComplete ? weeklyAverage + examAverage : null,
    weeklyCount: weekly.length,
    absenceCount: attendance.length,
    isComplete,
  };
}

export function makeId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function localDateString(date = new Date()): string {
  return toLocalIso(date);
}

export function upsertWeeklyAssessment(
  records: WeeklyAssessment[],
  record: WeeklyAssessment,
): WeeklyAssessment[] {
  const index = records.findIndex(
    (current) =>
      current.classId === record.classId &&
      current.subjectId === record.subjectId &&
      current.studentId === record.studentId &&
      current.weekStart === record.weekStart,
  );
  if (index < 0) return [...records, record];
  return records.map((current, position) => (position === index ? record : current));
}
