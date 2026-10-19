import { useSyncExternalStore } from "react";
import type {
  AbsenceBreakdown,
  AppData,
  StudentTermResult,
  TermWeek,
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
  schoolName: "",
  educationAdministration: "",
  educationDirectorate: "",
};

let cachedData = readFromStorage();

function readFromStorage(): AppData {
  if (typeof window === "undefined") return blankData;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return blankData;
    const parsed = JSON.parse(stored) as Partial<AppData>;
    if (parsed.version !== 1) return blankData;
    const termStartDate =
      typeof parsed.termStartDate === "string"
        ? parsed.termStartDate
        : blankData.termStartDate;
    const weeklyAssessments = Array.isArray(parsed.weeklyAssessments)
      ? parsed.weeklyAssessments.map((record) => ({
          ...record,
          weekNumber:
            Number.isInteger(record.weekNumber) &&
            record.weekNumber >= 1 &&
            record.weekNumber <= 19
              ? record.weekNumber
              : getWeekNumberFromDate(record.weekStart, termStartDate),
        }))
      : [];
    return {
      ...blankData,
      ...parsed,
      termStartDate,
      classes: Array.isArray(parsed.classes) ? parsed.classes : [],
      subjects: Array.isArray(parsed.subjects) ? parsed.subjects : [],
      students: Array.isArray(parsed.students) ? parsed.students : [],
      weeklyAssessments,
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

function getWeekNumberFromDate(weekStart: string, termStartDate: string): number {
  const [startYear, startMonth, startDay] = termStartDate.split("-").map(Number);
  const [weekYear, weekMonth, weekDay] = weekStart.split("-").map(Number);
  const values = [startYear, startMonth, startDay, weekYear, weekMonth, weekDay];
  if (values.some((value) => !Number.isFinite(value))) return 1;
  const start = Date.UTC(startYear, startMonth - 1, startDay);
  const week = Date.UTC(weekYear, weekMonth - 1, weekDay);
  return Math.max(1, Math.floor((week - start) / 604_800_000) + 1);
}

export function getWeekStartDate(termStartDate: string, weekNumber: number): string {
  const [year, month, day] = termStartDate.split("-").map(Number);
  return toLocalIso(new Date(year, month - 1, day + (weekNumber - 1) * 7));
}

export function getTermBounds(startDate: string): { start: string; end: string } {
  const start = new Date(`${startDate}T00:00:00`);
  const endExclusive = addMonthsClamped(startDate, 5);
  endExclusive.setDate(endExclusive.getDate() - 1);
  return { start: toLocalIso(start), end: toLocalIso(endExclusive) };
}

export function getTermWeeks(startDate: string): TermWeek[] {
  const termEnd = getTermBounds(startDate).end;
  return Array.from({ length: 19 }, (_, index) => {
    const start = getWeekStartDate(startDate, index + 1);
    const weekEnd = new Date(`${start}T12:00:00`);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const end = toLocalIso(weekEnd);
    return { number: index + 1, start, end: end > termEnd ? termEnd : end };
  });
}

export function getAbsenceBreakdown(
  data: AppData,
  classId: string,
  studentId: string,
  from: string,
  to: string,
): AbsenceBreakdown {
  const absences = data.attendance.filter(
    (record) =>
      record.classId === classId &&
      record.studentId === studentId &&
      record.status === "absent" &&
      record.date >= from &&
      record.date <= to,
  );
  return {
    total: absences.length,
    excused: absences.filter((record) => record.absenceType === "excused").length,
    unexcused: absences.filter((record) => record.absenceType === "unexcused").length,
    unclassified: absences.filter((record) => !record.absenceType).length,
  };
}

export function getStudentTermResult(
  data: AppData,
  classId: string,
  subjectId: string,
  studentId: string,
): StudentTermResult {
  const weekly = data.weeklyAssessments.filter(
    (record) =>
      record.classId === classId &&
      record.subjectId === subjectId &&
      record.studentId === studentId &&
      record.weekNumber >= 1 &&
      record.weekNumber <= 19,
  );
  const weeklyScores = weekly.map(
    (record) =>
      record.homework + record.notebook + record.weekly + record.conduct,
  );
  const average = (scores: number[]) =>
    scores.length > 0
      ? scores.reduce((sum, score) => sum + score, 0) / scores.length
      : null;
  const weeklyAverage = average(weeklyScores);
  const homeworkAverage = average(weekly.map((record) => record.homework));
  const notebookAverage = average(weekly.map((record) => record.notebook));
  const weeklyAssessmentAverage = average(weekly.map((record) => record.weekly));
  const conductAverage = average(weekly.map((record) => record.conduct));
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
  const bounds = getTermBounds(data.termStartDate);
  const absenceBreakdown = getAbsenceBreakdown(
    data,
    classId,
    studentId,
    bounds.start,
    bounds.end,
  );
  return {
    weeklyAverage,
    homeworkAverage,
    notebookAverage,
    weeklyAssessmentAverage,
    conductAverage,
    examAverage,
    total: isComplete ? weeklyAverage + examAverage : null,
    weeklyCount: weekly.length,
    absenceCount: absenceBreakdown.total,
    excusedAbsenceCount: absenceBreakdown.excused,
    unexcusedAbsenceCount: absenceBreakdown.unexcused,
    unclassifiedAbsenceCount: absenceBreakdown.unclassified,
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
      current.weekNumber === record.weekNumber,
  );
  if (index < 0) return [...records, record];
  return records.map((current, position) => (position === index ? record : current));
}
