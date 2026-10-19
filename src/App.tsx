import { useEffect, useState } from "react";
import type { CSSProperties, FormEvent, ReactNode } from "react";
import {
  AlertCircle, ArrowLeft, BookOpen, CalendarDays, Check, CheckCheck,
  ClipboardList, FileText, LockKeyhole, Plus, Printer, Save,
  School, Settings2, ShieldCheck, Trash2, Users, WalletCards, X,
} from "lucide-react";
import type { AppData, AttendanceRecord, ExamScores, SchoolClass, Student, Subject, WeeklyAssessment } from "./model";
import {
  getAbsenceBreakdown, getStudentTermResult, getTermBounds, getTermWeeks,
  getWeekStartDate, localDateString, makeId, updateAppData,
  upsertWeeklyAssessment, useAppData,
} from "./store";

type Section = "overview" | "classes" | "grades" | "attendance" | "reports";
type Notice = { kind: "error" | "success" | "info"; text: string };
type ScoreDraft = { homework: string; notebook: string; weekly: string; conduct: string };
type ExamDraft = { testOne: string; testTwo: string };

const sectionMeta: Record<Section, { label: string; title: string; subtitle: string }> = {
  overview: { label: "نظرة عامة", title: "صباحك منظّم", subtitle: "كل ما تحتاجه لمتابعة فصولك في مكان واحد." },
  classes: { label: "الفصول والطلاب", title: "فصولك وطلابك", subtitle: "أدر قوائم الفصول والمواد وأسماء الطلاب بسهولة." },
  grades: { label: "الدرجات", title: "دفتر الدرجات", subtitle: "أدخل متابعة الأسبوع والاختبارين، واترك الحساب لدفتر." },
  attendance: { label: "الحضور والغياب", title: "الحضور اليومي", subtitle: "سجّل الحضور مرة واحدة، وتابع الغياب الشهري والفصلي." },
  reports: { label: "التقارير", title: "تقرير الطالب", subtitle: "ملخص فصل دراسي جاهز للطباعة والحفظ بصيغة PDF." },
};

const navItems: { key: Section; icon: typeof School }[] = [
  { key: "overview", icon: WalletCards },
  { key: "classes", icon: Users },
  { key: "grades", icon: BookOpen },
  { key: "attendance", icon: CalendarDays },
  { key: "reports", icon: FileText },
];

function todayLabel() {
  return new Intl.DateTimeFormat("ar", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
}
function shortDate(iso: string) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("ar", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T12:00:00`));
}
function displayNumber(value: number | null, fraction = 1) {
  return value === null ? "—" : new Intl.NumberFormat("ar", { maximumFractionDigits: fraction }).format(value);
}
function keyFor(...parts: string[]) { return parts.join("::"); }
function classInitial(name: string) { return (name.trim()[0] || "ف").toLocaleUpperCase("ar"); }
function scoreOf(record: WeeklyAssessment) { return record.homework + record.notebook + record.weekly + record.conduct; }
function monthBounds(dateIso: string) {
  const [year, month] = dateIso.split("-").map(Number);
  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: localDateString(new Date(year, month, 0)),
  };
}

function Field({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return <div className={`field${wide ? " wide" : ""}`}><label>{label}</label>{children}</div>;
}
function PanelTitle({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="panel-head"><div><h2 className="section-title">{title}</h2>{detail && <p className="section-copy">{detail}</p>}</div>{action}</div>;
}
function Empty({ title, detail, action }: { title: string; detail: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-mark"><ClipboardList /></div><strong>{title}</strong><p>{detail}</p>{action}</div>;
}
function Nav({ section, onNavigate, mobile = false }: { section: Section; onNavigate: (next: Section) => void; mobile?: boolean }) {
  return <nav className={mobile ? "mobile-nav" : "nav-list"} aria-label="التنقل الرئيسي">
    {navItems.map(({ key, icon: Icon }) => <button key={key} className={`nav-item${section === key ? " active" : ""}`} onClick={() => onNavigate(key)} aria-current={section === key ? "page" : undefined}>
      <Icon /><span>{sectionMeta[key].label}</span>
    </button>)}
  </nav>;
}

export default function App() {
  const data = useAppData();
  const [section, setSection] = useState<Section>(() => {
    const path = window.location.pathname.replace("/", "");
    return (["classes", "grades", "attendance", "reports"].includes(path) ? path : "overview") as Section;
  });
  const [notice, setNotice] = useState<Notice | null>(null);
  const [toast, setToast] = useState("");
  const [selectedClassId, setSelectedClassId] = useState("");
  const [classFormName, setClassFormName] = useState("");
  const [classFormGrade, setClassFormGrade] = useState("");
  const [newStudentName, setNewStudentName] = useState("");
  const [newStudentCode, setNewStudentCode] = useState("");
  const [newSubjectName, setNewSubjectName] = useState("");
  const [gradeClassId, setGradeClassId] = useState("");
  const [gradeSubjectId, setGradeSubjectId] = useState("");
  const [weekNumber, setWeekNumber] = useState(1);
  const [scoreDrafts, setScoreDrafts] = useState<Record<string, ScoreDraft>>({});
  const [examDrafts, setExamDrafts] = useState<Record<string, ExamDraft>>({});
  const [attendanceClassId, setAttendanceClassId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState(localDateString());
  const [attendanceDraft, setAttendanceDraft] = useState<Record<string, "present" | "absent">>({});
  const [absenceTypeDraft, setAbsenceTypeDraft] = useState<Record<string, "excused" | "unexcused">>({});
  const [institutionDraft, setInstitutionDraft] = useState({
    schoolName: data.schoolName ?? "",
    educationAdministration: data.educationAdministration ?? "",
    educationDirectorate: data.educationDirectorate ?? "",
  });
  const [reportStudentId, setReportStudentId] = useState("");
  const [reportSubjectId, setReportSubjectId] = useState("");

  const selectedClass = data.classes.find((item) => item.id === selectedClassId) ?? data.classes[0];
  const gradeClass = data.classes.find((item) => item.id === (gradeClassId || data.classes[0]?.id));
  const gradeSubjects = data.subjects.filter((item) => gradeClass?.subjectIds.includes(item.id));
  const attendanceClass = data.classes.find((item) => item.id === (attendanceClassId || data.classes[0]?.id));
  const classStudents = selectedClass ? data.students.filter((student) => student.classId === selectedClass.id) : [];
  const gradeStudents = gradeClass ? data.students.filter((student) => student.classId === gradeClass.id) : [];
  const attendanceStudents = attendanceClass ? data.students.filter((student) => student.classId === attendanceClass.id) : [];
  const reportStudent = data.students.find((student) => student.id === reportStudentId) ?? data.students[0];
  const reportClass = reportStudent ? data.classes.find((item) => item.id === reportStudent.classId) : undefined;
  const reportSubjects = data.subjects.filter((item) => reportClass?.subjectIds.includes(item.id));
  const reportSubject = reportSubjects.find((item) => item.id === reportSubjectId) ?? reportSubjects[0];
  const bounds = getTermBounds(data.termStartDate);
  const termWeeks = getTermWeeks(data.termStartDate);
  const weekStart = getWeekStartDate(data.termStartDate, weekNumber);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 2500);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    if (!data.classes.length) return;
    if (!selectedClassId || !data.classes.some((item) => item.id === selectedClassId)) setSelectedClassId(data.classes[0].id);
    if (!gradeClassId || !data.classes.some((item) => item.id === gradeClassId)) setGradeClassId(data.classes[0].id);
    if (!attendanceClassId || !data.classes.some((item) => item.id === attendanceClassId)) setAttendanceClassId(data.classes[0].id);
  }, [data.classes, selectedClassId, gradeClassId, attendanceClassId]);
  useEffect(() => {
    if (gradeSubjects.length && !gradeSubjects.some((item) => item.id === gradeSubjectId)) setGradeSubjectId(gradeSubjects[0].id);
  }, [gradeClassId, data.subjects, gradeSubjectId]);
  useEffect(() => {
    if (reportSubjects.length && !reportSubjects.some((item) => item.id === reportSubjectId)) setReportSubjectId(reportSubjects[0].id);
  }, [reportStudent?.id, data.subjects, reportSubjectId]);
  useEffect(() => {
    setInstitutionDraft({
      schoolName: data.schoolName ?? "",
      educationAdministration: data.educationAdministration ?? "",
      educationDirectorate: data.educationDirectorate ?? "",
    });
  }, [data.schoolName, data.educationAdministration, data.educationDirectorate]);

  const notify = (text: string, kind: Notice["kind"] = "success") => {
    setNotice({ text, kind });
    if (kind === "success") setToast(text);
  };
  const persist = (updater: (current: AppData) => AppData, successText = "تم حفظ التغييرات") => {
    const result = updateAppData(updater);
    if (!result.ok) { notify(result.message, "error"); return false; }
    notify(successText, "success");
    return true;
  };
  const navigate = (next: Section) => {
    setSection(next);
    const path = next === "overview" ? "/" : `/${next}`;
    window.history.pushState({}, "", path);
    setNotice(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname.replace("/", "");
      setSection((["classes", "grades", "attendance", "reports"].includes(path) ? path : "overview") as Section);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const addClass = (event: FormEvent) => {
    event.preventDefault();
    const name = classFormName.trim();
    if (!name) { notify("اكتب اسم الفصل أولاً.", "error"); return; }
    const created: SchoolClass = { id: makeId(), name, grade: classFormGrade.trim() || undefined, subjectIds: [], createdAt: new Date().toISOString() };
    if (persist((current) => ({ ...current, classes: [...current.classes, created] }), "أُضيف الفصل")) {
      setClassFormName(""); setClassFormGrade(""); setSelectedClassId(created.id);
    }
  };
  const renameClass = (item: SchoolClass) => {
    const name = window.prompt("اسم الفصل", item.name)?.trim();
    if (!name) return;
    const grade = window.prompt("المرحلة أو الصف (اختياري)", item.grade ?? "")?.trim();
    if (grade === undefined || (name === item.name && (grade || undefined) === item.grade)) return;
    persist((current) => ({ ...current, classes: current.classes.map((entry) => entry.id === item.id ? { ...entry, name, grade: grade || undefined } : entry) }), "تم تعديل بيانات الفصل");
  };
  const deleteClass = (item: SchoolClass) => {
    if (!window.confirm(`حذف «${item.name}» وكل الطلاب والدرجات والحضور المرتبط به؟ لا يمكن التراجع عن ذلك.`)) return;
    persist((current) => ({
      ...current, classes: current.classes.filter((entry) => entry.id !== item.id),
      students: current.students.filter((student) => student.classId !== item.id),
      weeklyAssessments: current.weeklyAssessments.filter((record) => record.classId !== item.id),
      examScores: current.examScores.filter((record) => record.classId !== item.id),
      attendance: current.attendance.filter((record) => record.classId !== item.id),
    }), "تم حذف الفصل وسجلاته");
  };
  const createStudent = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedClass) { notify("أضف فصلاً قبل إضافة الطلاب.", "error"); return; }
    const name = newStudentName.trim();
    if (!name) { notify("اسم الطالب مطلوب.", "error"); return; }
    const student: Student = { id: makeId(), classId: selectedClass.id, name, code: newStudentCode.trim() || undefined, createdAt: new Date().toISOString() };
    if (persist((current) => ({ ...current, students: [...current.students, student] }), "أُضيف الطالب")) { setNewStudentName(""); setNewStudentCode(""); }
  };
  const editStudent = (student: Student) => {
    const name = window.prompt("اسم الطالب", student.name)?.trim();
    if (!name) return;
    const code = window.prompt("رقم / رمز الطالب (اختياري)", student.code ?? "")?.trim();
    if (code === undefined || (name === student.name && (code || undefined) === student.code)) return;
    persist((current) => ({ ...current, students: current.students.map((entry) => entry.id === student.id ? { ...entry, name, code: code || undefined } : entry) }), "تم تعديل بيانات الطالب");
  };
  const deleteStudent = (student: Student) => {
    if (!window.confirm(`حذف الطالب «${student.name}» وسجلاته؟`)) return;
    persist((current) => ({
      ...current, students: current.students.filter((item) => item.id !== student.id),
      weeklyAssessments: current.weeklyAssessments.filter((item) => item.studentId !== student.id),
      examScores: current.examScores.filter((item) => item.studentId !== student.id),
      attendance: current.attendance.filter((item) => item.studentId !== student.id),
    }), "تم حذف الطالب وسجلاته");
  };
  const createSubject = (event: FormEvent) => {
    event.preventDefault();
    const name = newSubjectName.trim();
    if (!name || !selectedClass) { notify(!selectedClass ? "أضف فصلاً أولاً." : "اكتب اسم المادة.", "error"); return; }
    const subject: Subject = { id: makeId(), name };
    if (persist((current) => ({
      ...current,
      subjects: [...current.subjects, subject],
      classes: current.classes.map((item) => item.id === selectedClass.id ? { ...item, subjectIds: [...item.subjectIds, subject.id] } : item),
    }), "أُضيفت المادة للفصل")) setNewSubjectName("");
  };
  const toggleSubject = (subjectId: string) => {
    if (!selectedClass) return;
    const has = selectedClass.subjectIds.includes(subjectId);
    persist((current) => ({ ...current, classes: current.classes.map((item) => item.id === selectedClass.id ? { ...item, subjectIds: has ? item.subjectIds.filter((id) => id !== subjectId) : [...item.subjectIds, subjectId] } : item) }), has ? "أزيلت المادة من الفصل" : "أُضيفت المادة للفصل");
  };
  const editSubject = (subject: Subject) => {
    const name = window.prompt("اسم المادة", subject.name)?.trim();
    if (!name || name === subject.name) return;
    persist((current) => ({ ...current, subjects: current.subjects.map((item) => item.id === subject.id ? { ...item, name } : item) }), "تم تعديل اسم المادة");
  };
  const deleteSubject = (subject: Subject) => {
    if (!window.confirm(`حذف مادة «${subject.name}» وكل درجاتها؟`)) return;
    persist((current) => ({
      ...current, subjects: current.subjects.filter((item) => item.id !== subject.id),
      classes: current.classes.map((item) => ({ ...item, subjectIds: item.subjectIds.filter((id) => id !== subject.id) })),
      weeklyAssessments: current.weeklyAssessments.filter((item) => item.subjectId !== subject.id),
      examScores: current.examScores.filter((item) => item.subjectId !== subject.id),
    }), "تم حذف المادة وسجلات درجاتها");
  };

  const weeklyRecordFor = (studentId: string) => data.weeklyAssessments.find((item) => item.classId === gradeClass?.id && item.subjectId === gradeSubjectId && item.studentId === studentId && item.weekNumber === weekNumber);
  const weeklyDraftFor = (studentId: string): ScoreDraft => {
    const key = keyFor(studentId, gradeSubjectId, String(weekNumber));
    if (scoreDrafts[key]) return scoreDrafts[key];
    const record = weeklyRecordFor(studentId);
    return record ? { homework: `${record.homework}`, notebook: `${record.notebook}`, weekly: `${record.weekly}`, conduct: `${record.conduct}` } : { homework: "", notebook: "", weekly: "", conduct: "" };
  };
  const saveWeekly = (studentId: string) => {
    if (!gradeClass || !gradeSubjectId) { notify("اختر فصلاً ومادة أولاً.", "error"); return; }
    if (!Number.isInteger(weekNumber) || weekNumber < 1 || weekNumber > 19) { notify("اختر أسبوعاً من الأسابيع التسعة عشر.", "error"); return; }
    const draft = weeklyDraftFor(studentId);
    const limits: [keyof ScoreDraft, number][] = [["homework", 5], ["notebook", 5], ["weekly", 10], ["conduct", 5]];
    for (const [field, max] of limits) {
      const value = draft[field];
      if (value.trim() === "" || !Number.isFinite(Number(value)) || Number(value) < 0 || Number(value) > max) {
        notify(`أدخل درجة صحيحة من 0 إلى ${max} في جميع خانات الأسبوع.`, "error"); return;
      }
    }
    const record: WeeklyAssessment = {
      id: weeklyRecordFor(studentId)?.id ?? makeId(), classId: gradeClass.id, subjectId: gradeSubjectId,
      studentId, weekNumber, weekStart, homework: Number(draft.homework), notebook: Number(draft.notebook),
      weekly: Number(draft.weekly), conduct: Number(draft.conduct), updatedAt: new Date().toISOString(),
    };
    if (persist((current) => ({ ...current, weeklyAssessments: upsertWeeklyAssessment(current.weeklyAssessments, record) }), "حُفظت درجات الأسبوع")) {
      setScoreDrafts((current) => ({ ...current, [keyFor(studentId, gradeSubjectId, String(weekNumber))]: { ...draft } }));
    }
  };
  const examRecordFor = (studentId: string) => data.examScores.find((item) => item.classId === gradeClass?.id && item.subjectId === gradeSubjectId && item.studentId === studentId);
  const examDraftFor = (studentId: string): ExamDraft => {
    const key = keyFor(studentId, gradeSubjectId);
    if (examDrafts[key]) return examDrafts[key];
    const exam = examRecordFor(studentId);
    return { testOne: exam?.testOne === null || exam?.testOne === undefined ? "" : `${exam.testOne}`, testTwo: exam?.testTwo === null || exam?.testTwo === undefined ? "" : `${exam.testTwo}` };
  };
  const saveExams = (studentId: string) => {
    if (!gradeClass || !gradeSubjectId) { notify("اختر فصلاً ومادة أولاً.", "error"); return; }
    const draft = examDraftFor(studentId);
    const parse = (value: string) => value.trim() === "" ? null : Number(value);
    const one = parse(draft.testOne), two = parse(draft.testTwo);
    if (one === null && two === null) { notify("أدخل درجة اختبار واحدة على الأقل؛ اترك الاختبار غير المنفذ فارغاً.", "error"); return; }
    if ((one !== null && (!Number.isFinite(one) || one < 0 || one > 15)) || (two !== null && (!Number.isFinite(two) || two < 0 || two > 15))) { notify("درجة كل اختبار يجب أن تكون بين 0 و15.", "error"); return; }
    const old = examRecordFor(studentId);
    const record: ExamScores = { id: old?.id ?? makeId(), classId: gradeClass.id, subjectId: gradeSubjectId, studentId, testOne: one, testTwo: two, updatedAt: new Date().toISOString() };
    if (persist((current) => ({ ...current, examScores: [...current.examScores.filter((item) => !(item.classId === record.classId && item.subjectId === record.subjectId && item.studentId === record.studentId)), record] }), "حُفظت درجات الاختبارين")) {
      setExamDrafts((current) => ({ ...current, [keyFor(studentId, gradeSubjectId)]: draft }));
    }
  };

  const attendanceRecordFor = (student: Student) => data.attendance.find((item) => item.classId === attendanceClass?.id && item.studentId === student.id && item.date === attendanceDate);
  const getAttendanceStatus = (student: Student): "present" | "absent" => {
    if (attendanceDraft[student.id]) return attendanceDraft[student.id];
    return attendanceRecordFor(student)?.status ?? "present";
  };
  const getAbsenceType = (student: Student): "" | "excused" | "unexcused" => {
    return absenceTypeDraft[student.id] ?? attendanceRecordFor(student)?.absenceType ?? "";
  };
  const saveAttendance = () => {
    if (!attendanceClass) { notify("أضف فصلاً وطلاباً أولاً.", "error"); return; }
    const records: AttendanceRecord[] = attendanceStudents.map((student) => {
      const status = getAttendanceStatus(student);
      const absenceType = getAbsenceType(student);
      return {
        id: attendanceRecordFor(student)?.id ?? makeId(),
        classId: attendanceClass.id,
        studentId: student.id,
        date: attendanceDate,
        status,
        ...(status === "absent" && absenceType ? { absenceType } : {}),
      };
    });
    if (records.some((record) => record.status === "absent" && !record.absenceType)) {
      notify("حدّد الغياب بعذر أو بدون عذر لكل طالب غائب قبل الحفظ.", "error"); return;
    }
    if (persist((current) => ({ ...current, attendance: [...current.attendance.filter((item) => !(item.classId === attendanceClass.id && item.date === attendanceDate)), ...records] }), "حُفظ سجل الحضور")) {
      setAttendanceDraft({});
      setAbsenceTypeDraft({});
    }
  };
  const changeTermStart = (value: string) => {
    if (!value) return;
    persist((current) => ({ ...current, termStartDate: value }), "تم تحديث بداية الفصل الدراسي");
  };
  const saveInstitutionDetails = (event: FormEvent) => {
    event.preventDefault();
    persist((current) => ({ ...current, ...institutionDraft }), "تم حفظ بيانات المدرسة والإدارة");
  };

  const renderOverview = () => {
    const today = localDateString();
    const todaysAttendance = data.attendance.filter((item) => item.date === today);
    const presentToday = todaysAttendance.filter((item) => item.status === "present").length;
    const absentToday = todaysAttendance.filter((item) => item.status === "absent").length;
    const gradeActivity = data.weeklyAssessments.filter((item) => item.updatedAt.slice(0, 10) === today).length;
    const studentsCount = data.students.length;
    return <>
      <div className="metric-grid">
        <div className="panel metric" style={{ "--metric-tint": "#e2eee1", "--metric-color": "#38724e" } as CSSProperties}><div className="metric-top"><span className="metric-icon"><School /></span>الفصول النشطة</div><div className="metric-value">{data.classes.length.toLocaleString("ar")}</div><div className="metric-caption">فصولك المسجلة في دفتر</div></div>
        <div className="panel metric" style={{ "--metric-tint": "#f5edd5", "--metric-color": "#967537" } as CSSProperties}><div className="metric-top"><span className="metric-icon"><Users /></span>إجمالي الطلاب</div><div className="metric-value">{studentsCount.toLocaleString("ar")}</div><div className="metric-caption">ضمن {data.classes.length.toLocaleString("ar")} فصول</div></div>
        <div className="panel metric" style={{ "--metric-tint": "#f7e5de", "--metric-color": "#b65e4c" } as CSSProperties}><div className="metric-top"><span className="metric-icon"><CalendarDays /></span>حضور اليوم</div><div className="metric-value">{presentToday.toLocaleString("ar")}<small style={{fontSize:12,color:"var(--muted)",fontFamily:"Cairo"}}> / {todaysAttendance.length.toLocaleString("ar")}</small></div><div className="metric-caption">{absentToday.toLocaleString("ar")} غياب مسجّل اليوم</div></div>
        <div className="panel metric" style={{ "--metric-tint": "#e8edda", "--metric-color": "#61743b" } as CSSProperties}><div className="metric-top"><span className="metric-icon"><BookOpen /></span>متابعات هذا اليوم</div><div className="metric-value">{gradeActivity.toLocaleString("ar")}</div><div className="metric-caption">درجة أسبوعية تم تحديثها اليوم</div></div>
      </div>
      <div className="overview-grid">
        <section className="panel">
          <PanelTitle title="فصولك" detail="واصل العمل من الفصل الذي تحتاجه." action={<button className="button light small" onClick={() => navigate("classes")}>إدارة الفصول <ArrowLeft /></button>} />
          <div className="panel-body">
            {data.classes.length ? <div className="class-list">{data.classes.map((item) => {
              const n = data.students.filter((student) => student.classId === item.id).length;
              const subs = data.subjects.filter((subject) => item.subjectIds.includes(subject.id)).map((subject) => subject.name);
              return <div className="class-row" key={item.id}><div className="class-main"><span className="class-avatar">{classInitial(item.name)}</span><div><div className="class-name">{item.name}{item.grade ? ` · ${item.grade}` : ""}</div><div className="class-detail">{n.toLocaleString("ar")} طلاب · {subs.length ? subs.join("، ") : "لم تُعيّن مواد بعد"}</div></div></div><button className="class-link" onClick={() => { setSelectedClassId(item.id); navigate("classes"); }}>فتح الفصل <ArrowLeft /></button></div>;
            })}</div> : <Empty title="ابدأ بإضافة فصلك الأول" detail="أنشئ فصلاً ثم أضف المواد والطلاب لتبدأ المتابعة." action={<button className="button primary" onClick={() => navigate("classes")}><Plus /> إضافة فصل</button>} />}
          </div>
        </section>
        <section className="panel">
          <PanelTitle title="إلى أين نذهب؟" detail="اختصارات للأعمال اليومية." />
          <div className="panel-body"><div className="quick-list">
            <button className="quick-link" onClick={() => navigate("attendance")}><span className="quick-icon"><CheckCheck /></span><span><span className="quick-title">تسجيل الحضور</span><span className="quick-sub">علّم الحضور والغياب لهذا اليوم</span></span><ArrowLeft style={{marginInlineStart:"auto",width:15}} /></button>
            <button className="quick-link" onClick={() => navigate("grades")}><span className="quick-icon" style={{background:"#f5edd5",color:"#806b36"}}><BookOpen /></span><span><span className="quick-title">إدخال درجات الأسبوع</span><span className="quick-sub">أربع خانات، ومجموع واضح لكل طالب</span></span><ArrowLeft style={{marginInlineStart:"auto",width:15}} /></button>
            <button className="quick-link" onClick={() => navigate("reports")}><span className="quick-icon" style={{background:"#f7e5de",color:"#a65a4a"}}><FileText /></span><span><span className="quick-title">طباعة تقرير طالب</span><span className="quick-sub">نتائج الفصل والغياب في صفحة واحدة</span></span><ArrowLeft style={{marginInlineStart:"auto",width:15}} /></button>
          </div></div>
        </section>
      </div>
      <section className="panel" style={{marginTop:16}}>
        <PanelTitle title="بيانات الفصل والمدرسة" detail="الفصل الأول يمتد خمسة أشهر ويضم 19 أسبوع متابعة، كما في سجل الرصد." action={<span className="badge neutral"><Settings2 size={13} /> خاص بهذا الجهاز</span>} />
        <form className="panel-body" onSubmit={saveInstitutionDetails}>
          <div className="filters" style={{marginBottom:12}}>
            <Field label="بداية الفصل الدراسي"><input className="input" type="date" value={data.termStartDate} onChange={(event) => changeTermStart(event.target.value)} /></Field>
            <div style={{alignSelf:"center",fontSize:12,color:"var(--muted)"}}>من <strong style={{color:"var(--ink)"}}>{shortDate(bounds.start)}</strong> إلى <strong style={{color:"var(--ink)"}}>{shortDate(bounds.end)}</strong></div>
          </div>
          <div className="filters" style={{margin:0}}>
            <Field label="المدرسة"><input className="input" value={institutionDraft.schoolName} onChange={(event) => setInstitutionDraft((current) => ({...current, schoolName:event.target.value}))} maxLength={80} placeholder="اسم المدرسة" /></Field>
            <Field label="الإدارة التعليمية"><input className="input" value={institutionDraft.educationAdministration} onChange={(event) => setInstitutionDraft((current) => ({...current, educationAdministration:event.target.value}))} maxLength={80} placeholder="اسم الإدارة" /></Field>
            <Field label="المديرية التعليمية"><input className="input" value={institutionDraft.educationDirectorate} onChange={(event) => setInstitutionDraft((current) => ({...current, educationDirectorate:event.target.value}))} maxLength={80} placeholder="اسم المديرية" /></Field>
            <button className="button primary" type="submit"><Save /> حفظ البيانات</button>
          </div>
        </form>
      </section>
    </>;
  };

  const renderClasses = () => <>
    <div className="class-management-grid">
      <section className="panel">
        <PanelTitle title="قائمة الفصول" detail={`${data.classes.length.toLocaleString("ar")} فصل`} />
        <div className="panel-body">
          <form className="form-stack" onSubmit={addClass} style={{marginBottom:16}}>
            <Field label="اسم الفصل"><input className="input" placeholder="مثال: الصف الخامس — أ" value={classFormName} onChange={(e) => setClassFormName(e.target.value)} maxLength={60} /></Field>
            <Field label="المرحلة أو الصف (اختياري)"><input className="input" placeholder="مثال: الصف الخامس" value={classFormGrade} onChange={(e) => setClassFormGrade(e.target.value)} maxLength={40} /></Field>
            <button className="button primary" type="submit"><Plus /> إنشاء فصل</button>
          </form>
          {data.classes.length ? data.classes.map((item) => <div className={`class-card${selectedClass?.id === item.id ? " selected" : ""}`} key={item.id} onClick={() => setSelectedClassId(item.id)}>
            <div className="class-card-top"><div><div className="class-card-name">{item.name}</div><div className="class-card-meta">{item.grade || "دون مرحلة محددة"} · {data.students.filter((student) => student.classId === item.id).length.toLocaleString("ar")} طلاب</div></div>
              <div className="management-actions"><button className="icon-button" aria-label="تعديل الفصل" title="تعديل الفصل" onClick={(e) => {e.stopPropagation();renameClass(item);}}><Settings2 /></button><button className="icon-button" aria-label="حذف الفصل" title="حذف الفصل" onClick={(e) => {e.stopPropagation();deleteClass(item);}}><Trash2 /></button></div></div>
            <div className="subject-chips">{data.subjects.filter((subject) => item.subjectIds.includes(subject.id)).map((subject) => <span className="subject-chip" key={subject.id}>{subject.name}</span>)}{!item.subjectIds.length && <span className="muted" style={{fontSize:10}}>لا توجد مواد معيّنة</span>}</div>
          </div>) : <Empty title="لا توجد فصول بعد" detail="أضف الفصل من النموذج أعلاه." />}
        </div>
      </section>
      <section className="panel">
        {selectedClass ? <>
          <PanelTitle title={selectedClass.name} detail="أدر طلاب هذا الفصل والمواد المرتبطة به." />
          <div className="panel-body">
            <div className="section-divider" style={{borderTop:0,marginTop:0,paddingTop:0}}><div><h3 className="section-title" style={{fontSize:14}}>المواد الدراسية</h3><p className="section-copy">اختر المواد المسندة لهذا الفصل.</p></div></div>
            {data.subjects.length ? <div style={{display:"grid",gap:8}}>
              {data.subjects.map((subject) => <div key={subject.id} className="class-row" style={{padding:"8px 0"}}>
                <label style={{display:"flex",alignItems:"center",gap:9,cursor:"pointer",fontSize:12,fontWeight:600}}><input type="checkbox" checked={selectedClass.subjectIds.includes(subject.id)} onChange={() => toggleSubject(subject.id)} />{subject.name}</label>
                <div className="management-actions"><button className="icon-button" aria-label={`تعديل ${subject.name}`} onClick={() => editSubject(subject)}><Settings2 /></button><button className="icon-button" aria-label={`حذف ${subject.name}`} onClick={() => deleteSubject(subject)}><Trash2 /></button></div>
              </div>)}
            </div> : <p className="section-copy">لم تُنشأ مواد بعد.</p>}
            <form className="inline-form" onSubmit={createSubject} style={{marginTop:10}}>
              <Field label="إضافة مادة جديدة"><input className="input" value={newSubjectName} onChange={(e) => setNewSubjectName(e.target.value)} placeholder="اسم المادة" maxLength={50} /></Field>
              <button className="button light" type="submit"><Plus /> إضافة</button>
            </form>
            <div className="section-divider"><div><h3 className="section-title" style={{fontSize:14}}>الطلاب</h3><p className="section-copy">قائمة طلاب الفصل مع أدوات التعديل.</p></div><span className="badge neutral">{classStudents.length.toLocaleString("ar")} طالب</span></div>
            <form className="inline-form" onSubmit={createStudent}>
              <Field label="اسم الطالب"><input className="input" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="الاسم الكامل" maxLength={80} /></Field>
              <Field label="رقم / رمز (اختياري)"><input className="input" value={newStudentCode} onChange={(e) => setNewStudentCode(e.target.value)} placeholder="رقم الطالب" maxLength={30} /></Field>
              <button className="button primary" type="submit" aria-label="إضافة طالب"><Plus /></button>
            </form>
            {classStudents.length ? <div className="table-wrap"><table className="data-table" style={{minWidth:450}}><thead><tr><th>م</th><th>الطالب</th><th>الرمز</th><th>إجراءات</th></tr></thead><tbody>{classStudents.map((student, index) => <tr key={student.id}><td className="muted">{(index + 1).toLocaleString("ar")}</td><td><div className="student-cell"><span className="student-initial">{classInitial(student.name)}</span>{student.name}</div></td><td className="muted">{student.code || "—"}</td><td><div className="management-actions"><button className="button ghost small" onClick={() => editStudent(student)}>تعديل الاسم</button><button className="icon-button" aria-label={`حذف ${student.name}`} onClick={() => deleteStudent(student)}><Trash2 /></button></div></td></tr>)}</tbody></table></div> : <Empty title="الفصل جاهز لاستقبال طلابه" detail="أضف اسم الطالب أعلاه، ويمكنك إضافة رقمه التعريفي اختياريًا." />}
          </div>
        </> : <div className="panel-body"><Empty title="اختر فصلاً لإدارته" detail="أو أنشئ فصلاً جديداً من القائمة." /></div>}
      </section>
    </div>
    {data.subjects.length > 0 && <section className="panel" style={{marginTop:16}}>
      <PanelTitle title="كل المواد" detail="حذف المادة يزيل درجاتها من جميع الفصول." />
      <div className="panel-body"><div className="subject-chips">{data.subjects.map((subject) => <span className="subject-chip" key={subject.id} style={{display:"inline-flex",alignItems:"center",gap:7}}>{subject.name}<button onClick={() => editSubject(subject)} aria-label={`تعديل ${subject.name}`} style={{border:0,background:"transparent",color:"inherit",padding:0,display:"grid"}}><Settings2 size={12}/></button><button onClick={() => deleteSubject(subject)} aria-label={`حذف ${subject.name}`} style={{border:0,background:"transparent",color:"inherit",padding:0,display:"grid"}}><X size={12}/></button></span>)}</div></div>
    </section>}
  </>;

  const renderGrades = () => <>
    <div className="filters">
      <Field label="الفصل"><select className="select" value={gradeClass?.id ?? ""} onChange={(e) => {setGradeClassId(e.target.value);setGradeSubjectId("");}}><option value="">اختر الفصل</option>{data.classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
      <Field label="المادة"><select className="select" value={gradeSubjectId} onChange={(e) => setGradeSubjectId(e.target.value)} disabled={!gradeSubjects.length}><option value="">اختر المادة</option>{gradeSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></Field>
       <Field label="الأسبوع الدراسي (1–19)"><select className="select" value={weekNumber} onChange={(e) => {setWeekNumber(Number(e.target.value));setScoreDrafts({});}}>{termWeeks.map((week) => <option key={week.number} value={week.number}>الأسبوع {week.number.toLocaleString("ar")} · {shortDate(week.start)}</option>)}</select></Field>
      <div className="week-bar" style={{alignSelf:"end",fontSize:11,color:"var(--muted)"}}><span>الفصل: {shortDate(bounds.start)} – {shortDate(bounds.end)}</span></div>
    </div>
    {notice && <div className="notice-stack"><div className={`notice ${notice.kind}`}><AlertCircle />{notice.text}</div></div>}
    {!data.classes.length ? <section className="panel"><Empty title="لا توجد فصول لإدخال الدرجات" detail="ابدأ بإنشاء فصل وإضافة طلاب ومواد." action={<button className="button primary" onClick={() => navigate("classes")}><Plus /> إدارة الفصول</button>} /></section>
      : !gradeSubjects.length ? <section className="panel"><Empty title="لا توجد مواد لهذا الفصل" detail="أضف مادة واربطها بالفصل من إدارة الفصول." action={<button className="button light" onClick={() => navigate("classes")}>إدارة المواد <ArrowLeft /></button>} /></section>
      : !gradeStudents.length ? <section className="panel"><Empty title="لا يوجد طلاب في هذا الفصل" detail="أضف الطلاب قبل إدخال درجاتهم." action={<button className="button light" onClick={() => navigate("classes")}>إضافة طلاب <ArrowLeft /></button>} /></section>
      : <section className="panel">
        <PanelTitle title="متابعة الأسبوع والاختبارات" detail={`الأسبوع ${weekNumber.toLocaleString("ar")} · ${shortDate(weekStart)} · المتابعة من 25، وكل اختبار من 15.`} action={<span className="badge neutral">الأسبوع {weekNumber.toLocaleString("ar")} من 19</span>} />
        <div className="table-wrap"><table className="data-table"><thead><tr><th>م</th><th>الطالب</th><th>واجب<br/><small>من 5</small></th><th>دفتر<br/><small>من 5</small></th><th>أسبوعي<br/><small>من 10</small></th><th>مواظبة وسلوك<br/><small>من 5</small></th><th>مجموع الأسبوع<br/><small>من 25</small></th><th>حفظ الأسبوع</th><th>اختبار 1<br/><small>من 15</small></th><th>اختبار 2<br/><small>من 15</small></th><th>معدل الاختبارين<br/><small>من 15</small></th><th>مجموع الفصل<br/><small>من 40</small></th></tr></thead>
          <tbody>{gradeStudents.map((student, index) => {
            const draft = weeklyDraftFor(student.id); const examDraft = examDraftFor(student.id);
            const vals = [draft.homework,draft.notebook,draft.weekly,draft.conduct].map((value) => value === "" ? null : Number(value));
            const weeklySum = vals.every((value) => value !== null && Number.isFinite(value)) ? (vals as number[]).reduce((a,b) => a+b,0) : null;
            const examOne = examDraft.testOne.trim() === "" ? null : Number(examDraft.testOne);
            const examTwo = examDraft.testTwo.trim() === "" ? null : Number(examDraft.testTwo);
            const examAvg = examOne !== null && examTwo !== null && Number.isFinite(examOne) && Number.isFinite(examTwo) ? (examOne + examTwo) / 2 : null;
            const result = getStudentTermResult(data, gradeClass!.id, gradeSubjectId, student.id);
            return <tr key={student.id}>
              <td className="muted">{(index + 1).toLocaleString("ar")}</td><td><div className="student-cell"><span className="student-initial">{classInitial(student.name)}</span>{student.name}</div></td>
              {(["homework","notebook","weekly","conduct"] as const).map((field, index) => <td key={field}><input className="score-input" aria-label={`${student.name} ${["الواجب","الدفتر","الأسبوعي","المواظبة والسلوك"][index]}`} type="number" min="0" max={[5,5,10,5][index]} step="0.5" value={draft[field]} onChange={(e) => setScoreDrafts((current) => ({...current,[keyFor(student.id,gradeSubjectId,String(weekNumber))]:{...draft,[field]:e.target.value}}))} /></td>)}
              <td><span className="sum-pill">{weeklySum === null ? "—" : `${displayNumber(weeklySum)} / 25`}</span></td>
              <td><button className="button light small" onClick={() => saveWeekly(student.id)}><Save /> حفظ</button></td>
              {(["testOne","testTwo"] as const).map((field, index) => <td key={field}><input className="score-input" aria-label={`${student.name} الاختبار ${index + 1}`} type="number" min="0" max="15" step="0.5" value={examDraft[field]} onChange={(e) => setExamDrafts((current) => ({...current,[keyFor(student.id,gradeSubjectId)]:{...examDraft,[field]:e.target.value}}))} /></td>)}
              <td>{examAvg === null ? <span className="muted">غير مكتمل</span> : <span className="sum-pill">{displayNumber(examAvg)} / 15</span>}<div><button className="button ghost small" style={{marginTop:6}} onClick={() => saveExams(student.id)}><Save /> حفظ الاختبارين</button></div></td>
              <td>{result.total === null ? <span className="badge neutral">غير مكتمل</span> : <span className="sum-pill">{displayNumber(result.total)} / 40</span>}<div className="muted" style={{fontSize:9,marginTop:4}}>متوسط {result.weeklyCount.toLocaleString("ar")} أسابيع</div></td>
            </tr>;
          })}</tbody></table></div>
        <div className="panel-body" style={{paddingTop:14}}><div className="notice info"><AlertCircle />مجموع الفصل لا يظهر حتى تُحفظ متابعة أسبوعية واحدة ضمن مدة الفصل، وتُسجّل درجتا الاختبارين. الفراغ لا يُحسب صفراً.</div></div>
      </section>}
  </>;

  const renderAttendance = () => {
    const activeMonth = monthBounds(attendanceDate);
    return <>
      <div className="filters">
        <Field label="الفصل"><select className="select" value={attendanceClass?.id ?? ""} onChange={(e) => {setAttendanceClassId(e.target.value);setAttendanceDraft({});setAbsenceTypeDraft({});}}><option value="">اختر الفصل</option>{data.classes.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></Field>
        <Field label="التاريخ"><input className="input" type="date" value={attendanceDate} onChange={(e) => {setAttendanceDate(e.target.value);setAttendanceDraft({});setAbsenceTypeDraft({});}} /></Field>
        <div style={{alignSelf:"end",fontSize:11,color:"var(--muted)"}}>سجّل الحضور والغياب لهذا اليوم فقط.</div>
        <button className="button primary" style={{alignSelf:"end"}} onClick={saveAttendance} disabled={!attendanceStudents.length}><Save /> حفظ سجل اليوم</button>
      </div>
      {notice && <div className="notice-stack"><div className={`notice ${notice.kind}`}><AlertCircle />{notice.text}</div></div>}
      {!data.classes.length ? <section className="panel"><Empty title="لا توجد فصول بعد" detail="أنشئ فصلاً وأضف قائمة الطلاب لبدء تسجيل الحضور." action={<button className="button primary" onClick={() => navigate("classes")}><Plus /> إنشاء فصل</button>} /></section>
      : !attendanceStudents.length ? <section className="panel"><Empty title="لا يوجد طلاب لهذا الفصل" detail="أضف الطلاب أولاً، ثم ارجع لتسجيل حضورهم." action={<button className="button light" onClick={() => navigate("classes")}>إدارة الطلاب <ArrowLeft /></button>} /></section>
      : <section className="panel">
    <PanelTitle title={`قائمة ${attendanceClass?.name ?? "الفصل"}`} detail={`${shortDate(attendanceDate)} · ${attendanceStudents.length.toLocaleString("ar")} طالب`} action={<span className="badge present">{attendanceStudents.filter((s) => getAttendanceStatus(s) === "present").length.toLocaleString("ar")} حاضر</span>} />
        <div className="table-wrap"><table className="data-table" style={{minWidth:900}}><thead><tr><th>م</th><th>الطالب</th><th>حالة اليوم ونوع الغياب</th><th>غياب الشهر المحدد</th><th>غياب الفصل الأول</th></tr></thead>
          <tbody>{attendanceStudents.map((student, index) => {
            const status = getAttendanceStatus(student);
            const monthly = getAbsenceBreakdown(data, attendanceClass!.id, student.id, activeMonth.start, activeMonth.end);
            const term = getAbsenceBreakdown(data, attendanceClass!.id, student.id, bounds.start, bounds.end);
            const absenceType = getAbsenceType(student);
            return <tr key={student.id}>
              <td className="muted">{(index + 1).toLocaleString("ar")}</td><td><div className="student-cell"><span className="student-initial">{classInitial(student.name)}</span>{student.name}</div></td>
              <td><div className="attendance-cell"><div className="attendance-toggle"><button className={status === "present" ? "selected-present" : ""} onClick={() => setAttendanceDraft((current) => ({...current,[student.id]:"present"}))}>حاضر</button><button className={status === "absent" ? "selected-absent" : ""} onClick={() => setAttendanceDraft((current) => ({...current,[student.id]:"absent"}))}>غائب</button></div>
                {status === "absent" && <select className="select absence-reason" aria-label={`نوع غياب ${student.name}`} value={absenceType} onChange={(event) => setAbsenceTypeDraft((current) => ({...current,[student.id]:event.target.value as "excused" | "unexcused"}))}><option value="">حدد السبب</option><option value="excused">بعذر</option><option value="unexcused">بدون عذر</option></select>}
              </div></td>
              {[monthly, term].map((summary, index) => <td key={index}><span className={summary.total ? "badge absent" : "badge present"}>{summary.total.toLocaleString("ar")} أيام</span><div className="absence-breakdown">بعذر {summary.excused.toLocaleString("ar")} · بدون عذر {summary.unexcused.toLocaleString("ar")}{summary.unclassified ? ` · غير محدد ${summary.unclassified.toLocaleString("ar")}` : ""}</div></td>)}
            </tr>;
          })}</tbody>
        </table></div>
        <div className="panel-body" style={{paddingTop:14}}><div className="notice info"><AlertCircle />سجّل الحالة لكل طالب. عند اختيار الغياب، حدّد هل هو بعذر أو بدون عذر قبل حفظ سجل اليوم.</div></div>
      </section>}
    </>;
  };

  const renderReports = () => {
    const reportRecords = reportStudent && reportSubject ? data.weeklyAssessments.filter((item) => item.classId === reportStudent.classId && item.studentId === reportStudent.id && item.subjectId === reportSubject.id && item.weekNumber >= 1 && item.weekNumber <= 19).sort((a,b) => a.weekNumber - b.weekNumber) : [];
    const reportExam = reportStudent && reportSubject ? data.examScores.find((item) => item.classId === reportStudent.classId && item.studentId === reportStudent.id && item.subjectId === reportSubject.id) : undefined;
    const result = reportStudent && reportSubject && reportClass ? getStudentTermResult(data, reportClass.id, reportSubject.id, reportStudent.id) : undefined;
    const startDate = new Date(`${bounds.start}T12:00:00`);
    const endDate = new Date(`${bounds.end}T12:00:00`);
    const monthCount = (endDate.getFullYear() - startDate.getFullYear()) * 12 + endDate.getMonth() - startDate.getMonth() + 1;
    const months = reportStudent ? Array.from({length:monthCount}, (_, index) => {
      const date = new Date(startDate.getFullYear(), startDate.getMonth() + index, 1);
      const month = localDateString(new Date(date.getFullYear(),date.getMonth(),1)).slice(0,7);
      const monthRange = monthBounds(`${month}-01`);
      const from = monthRange.start < bounds.start ? bounds.start : monthRange.start;
      const to = monthRange.end > bounds.end ? bounds.end : monthRange.end;
      return {
        month,
        label: new Intl.DateTimeFormat("ar",{month:"long"}).format(date),
        absence: getAbsenceBreakdown(data, reportStudent.classId, reportStudent.id, from, to),
      };
    }) : [];
    return <>
      <div className="filters no-print">
        <Field label="الطالب"><select className="select" value={reportStudent?.id ?? ""} onChange={(e) => {setReportStudentId(e.target.value);setReportSubjectId("");}}><option value="">اختر طالباً</option>{data.students.map((student) => <option key={student.id} value={student.id}>{student.name} — {data.classes.find((item) => item.id === student.classId)?.name ?? ""}</option>)}</select></Field>
        <Field label="المادة"><select className="select" value={reportSubject?.id ?? ""} onChange={(e) => setReportSubjectId(e.target.value)} disabled={!reportSubjects.length}><option value="">اختر المادة</option>{reportSubjects.map((subject) => <option key={subject.id} value={subject.id}>{subject.name}</option>)}</select></Field>
        <button className="button primary" onClick={() => window.print()} disabled={!reportStudent || !reportSubject}><Printer /> تصدير PDF</button>
      </div>
      <div className="no-print notice-stack"><div className="notice info"><AlertCircle />اضغط «تصدير PDF»، ثم اختر «حفظ كملف PDF» من نافذة الطباعة. يحافظ المتصفح على النص العربي في التقرير.</div></div>
      {!reportStudent ? <section className="panel"><Empty title="لا يوجد طالب لاختيار تقريره" detail="أضف طالباً من قسم الفصول والطلاب، وسيظهر هنا." action={<button className="button light" onClick={() => navigate("classes")}>إدارة الطلاب <ArrowLeft /></button>} /></section>
      : !reportSubject ? <section className="panel"><Empty title="لا توجد مادة لهذا الطالب" detail="عيّن مادة لفصل الطالب من قسم إدارة الفصول." action={<button className="button light" onClick={() => navigate("classes")}>إدارة المواد <ArrowLeft /></button>} /></section>
      : <section className="panel print-area report-sheet">
        <div className="report-header"><div><div className="eyebrow">دفتر الطالب · التقرير الفصلي</div><div className="report-title">{reportStudent.name}</div><div className="report-meta">{data.schoolName ? `المدرسة: ${data.schoolName} · ` : ""}{reportClass?.name}{reportStudent.code ? ` · رقم ${reportStudent.code}` : ""}<br/>{data.educationAdministration ? `الإدارة التعليمية: ${data.educationAdministration} · ` : ""}{data.educationDirectorate ? `المديرية: ${data.educationDirectorate}<br/>` : ""}المادة: {reportSubject.name}<br/>الفترة: {shortDate(bounds.start)} — {shortDate(bounds.end)} · 19 أسبوعاً</div></div>
          <div className="report-total"><strong>{result?.total === null || result?.total === undefined ? "—" : displayNumber(result.total)}</strong><span>من 40 · {result?.isComplete ? "مكتمل" : "بيانات غير مكتملة"}</span></div>
        </div>
        <div className="report-kpis">
          <div className="report-kpi"><span>متوسط الواجب · من 5</span><strong>{displayNumber(result?.homeworkAverage ?? null)}</strong></div>
          <div className="report-kpi"><span>متوسط كراسة الحصة · من 5</span><strong>{displayNumber(result?.notebookAverage ?? null)}</strong></div>
          <div className="report-kpi"><span>متوسط التقييم الأسبوعي · من 10</span><strong>{displayNumber(result?.weeklyAssessmentAverage ?? null)}</strong></div>
          <div className="report-kpi"><span>متوسط المواظبة والسلوك · من 5</span><strong>{displayNumber(result?.conductAverage ?? null)}</strong></div>
          <div className="report-kpi"><span>متوسط البنود · من 25</span><strong>{displayNumber(result?.weeklyAverage ?? null)}</strong></div>
          <div className="report-kpi"><span>متوسط الاختبارين · من 15</span><strong>{displayNumber(result?.examAverage ?? null)}</strong></div>
          <div className="report-kpi"><span>أسابيع مرصودة</span><strong>{(result?.weeklyCount ?? 0).toLocaleString("ar")} / 19</strong></div>
        </div>
        <h3 className="section-title" style={{fontSize:14,margin:"22px 0 10px"}}>تفاصيل المتابعة الأسبوعية</h3>
          {reportRecords.length ? <div className="table-wrap"><table className="data-table" style={{minWidth:570}}><thead><tr><th>الأسبوع</th><th>تاريخ البداية</th><th>واجب / 5</th><th>كراسة الحصة / 5</th><th>أسبوعي / 10</th><th>مواظبة وسلوك / 5</th><th>المجموع / 25</th></tr></thead><tbody>{reportRecords.map((record) => <tr key={record.id}><td>{record.weekNumber.toLocaleString("ar")}</td><td>{shortDate(record.weekStart)}</td><td>{record.homework}</td><td>{record.notebook}</td><td>{record.weekly}</td><td>{record.conduct}</td><td><strong>{scoreOf(record)}</strong></td></tr>)}</tbody></table></div> : <div className="notice info"><AlertCircle />لا توجد متابعة أسبوعية محفوظة في الأسابيع التسعة عشر.</div>}
        <h3 className="section-title" style={{fontSize:14,margin:"22px 0 10px"}}>الاختبارات</h3>
        <div className="table-wrap"><table className="data-table" style={{minWidth:420}}><thead><tr><th>الاختبار الأول / 15</th><th>الاختبار الثاني / 15</th><th>المعدل / 15</th></tr></thead><tbody><tr><td>{reportExam?.testOne ?? "غير مسجل"}</td><td>{reportExam?.testTwo ?? "غير مسجل"}</td><td>{result?.examAverage === null || result?.examAverage === undefined ? "غير مكتمل" : displayNumber(result.examAverage)}</td></tr></tbody></table></div>
        <h3 className="section-title" style={{fontSize:14,margin:"22px 0 10px"}}>الغياب</h3>
         <div className="report-kpis">
           {months.map((month) => <div className="report-kpi" key={month.month}><span>{month.label}</span><strong>{month.absence.total.toLocaleString("ar")} أيام</strong><div className="absence-breakdown">بعذر {month.absence.excused.toLocaleString("ar")} · بدون عذر {month.absence.unexcused.toLocaleString("ar")}</div></div>)}
           <div className="report-kpi"><span>إجمالي غياب الفصل</span><strong>{(result?.absenceCount ?? 0).toLocaleString("ar")} أيام</strong></div>
           <div className="report-kpi"><span>غياب بعذر</span><strong>{(result?.excusedAbsenceCount ?? 0).toLocaleString("ar")} أيام</strong></div>
           <div className="report-kpi"><span>غياب بدون عذر</span><strong>{(result?.unexcusedAbsenceCount ?? 0).toLocaleString("ar")} أيام</strong></div>
           {(result?.unclassifiedAbsenceCount ?? 0) > 0 && <div className="report-kpi"><span>غياب يحتاج تصنيفاً</span><strong>{result?.unclassifiedAbsenceCount.toLocaleString("ar")} أيام</strong></div>}
         </div>
        <div className="section-copy" style={{marginTop:18}}>الحساب: متوسط الأسابيع المرصودة + متوسط الاختبارين. لا تدخل القيم غير المسجلة في الحساب.</div>
      </section>}
    </>;
  };

  const page = sectionMeta[section];
  return <div className="app-shell" dir="rtl" lang="ar">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">د</span><div><div className="brand-name">دفتر</div><div className="brand-caption">متابعة دراسية بلا تعقيد</div></div></div>
      <div className="nav-label">مساحة العمل</div>
      <Nav section={section} onNavigate={navigate} />
      <div className="sidebar-bottom"><div className="local-note"><strong><LockKeyhole /> بياناتك في مكانها</strong>تُحفظ بياناتك في هذا المتصفح وعلى هذا الجهاز فقط، ولا تتم مزامنتها إلى جهاز آخر.</div></div>
    </aside>
    <div className="main-area">
      <header className="topbar">
        <div className="mobile-brand"><span className="brand-mark">د</span><span className="brand-name">دفتر</span></div>
        <div><div className="topbar-title">{page.label}</div><div className="topbar-date">{todayLabel()}</div></div>
        <div className="topbar-right"><span className="today-chip local-chip"><LockKeyhole /> محفوظ على هذا الجهاز</span><span className="today-chip"><ShieldCheck /> {todayLabel()}</span></div>
      </header>
      <main className="content">
        <div className="page-heading"><div><div className="eyebrow">{section === "overview" ? "لوحة المتابعة" : `دفتر / ${page.label}`}</div><h1>{page.title}</h1><p className="heading-copy">{page.subtitle}</p></div>
          {section === "overview" && <button className="button primary" onClick={() => navigate("attendance")}><CheckCheck /> تسجيل حضور اليوم</button>}
        </div>
        {notice && section !== "grades" && section !== "attendance" && section !== "reports" && <div className="notice-stack"><div className={`notice ${notice.kind}`}><AlertCircle />{notice.text}</div></div>}
        {section === "overview" && renderOverview()}
        {section === "classes" && renderClasses()}
        {section === "grades" && renderGrades()}
        {section === "attendance" && renderAttendance()}
        {section === "reports" && renderReports()}
      </main>
    </div>
    <Nav section={section} onNavigate={navigate} mobile />
    {toast && <div className="toast" role="status"><Check size={15} style={{verticalAlign:"middle",marginInlineEnd:7}} />{toast}</div>}
  </div>;
}
