export interface SchoolClass {
  id: string;
  name: string;
  grade?: string;
  subjectIds: string[];
  createdAt: string;
}

export interface Subject {
  id: string;
  name: string;
}

export interface Student {
  id: string;
  classId: string;
  name: string;
  code?: string;
  createdAt: string;
}

export interface WeeklyAssessment {
  id: string;
  classId: string;
  subjectId: string;
  studentId: string;
  weekStart: string;
  homework: number;
  notebook: number;
  weekly: number;
  conduct: number;
  updatedAt: string;
}

export interface ExamScores {
  id: string;
  classId: string;
  subjectId: string;
  studentId: string;
  testOne: number | null;
  testTwo: number | null;
  updatedAt: string;
}

export interface AttendanceRecord {
  id: string;
  classId: string;
  studentId: string;
  date: string;
  status: "present" | "absent";
}

export interface AppData {
  version: 1;
  classes: SchoolClass[];
  subjects: Subject[];
  students: Student[];
  weeklyAssessments: WeeklyAssessment[];
  examScores: ExamScores[];
  attendance: AttendanceRecord[];
  termStartDate: string;
}

export interface StudentTermResult {
  weeklyAverage: number | null;
  examAverage: number | null;
  total: number | null;
  weeklyCount: number;
  absenceCount: number;
  isComplete: boolean;
}
