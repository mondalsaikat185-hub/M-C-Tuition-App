import {
  collection, doc, addDoc, updateDoc, getDocs, getDoc, setDoc, writeBatch,
  query, where, orderBy, arrayUnion, serverTimestamp, Timestamp, limit
} from 'firebase/firestore';
import { db } from './firebase';
import { cachedGetDocs } from './cache';

// ─── Generate a 5-character access code ─────────────────────────────────────
// Excludes visually ambiguous characters: 0, O, 1, I, L
export function generateAccessCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

// ─── Create a new exam session ───────────────────────────────────────────────
export async function createExamSession(
  examId: string,
  batchId: string,
  adminUid: string,
  codeEnabled: boolean = true
): Promise<{ sessionId: string; accessCode: string }> {
  const accessCode = generateAccessCode();
  const docRef = await addDoc(collection(db, 'examSessions'), {
    examId,
    batchId,
    accessCode,
    isActive: true,
    codeEnabled,
    participantUids: [],
    createdAt: serverTimestamp(),
    createdBy: adminUid,
  });

  // Initialize attendance ONLY if the session requires a code (live session)
  if (codeEnabled) {
    const today = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local time
    const attendanceId = `${batchId}_${today}`;
    const attendanceRef = doc(db, 'attendance', attendanceId);
    const snap = await getDoc(attendanceRef);
    if (!snap.exists()) {
      await setDoc(attendanceRef, {
        date: today,
        batchId,
        presentStudentIds: [],
        examSessionId: docRef.id,
        updatedAt: serverTimestamp(),
      });
    }
  }

  return { sessionId: docRef.id, accessCode };
}

// ─── End an exam session ─────────────────────────────────────────────────────
export async function endExamSession(sessionId: string): Promise<void> {
  await updateDoc(doc(db, 'examSessions', sessionId), {
    isActive: false,
    endedAt: serverTimestamp(),
  });
}

// ─── Verify access code and record attendance ────────────────────────────────
// Returns: 'ok' | 'wrong_code' | 'already_participated' | 'session_inactive'
export async function verifyAndJoinSession(
  examId: string,
  batchId: string,
  studentUid: string,
  enteredCode: string
): Promise<'ok' | 'wrong_code' | 'already_participated' | 'session_inactive'> {
  // Find active session for this exam + batch
  const q = query(
    collection(db, 'examSessions'),
    where('examId', '==', examId),
    where('batchId', '==', batchId),
    where('isActive', '==', true)
  );
  const snap = await getDocs(q);

  if (snap.empty) return 'session_inactive';

  const sessionDoc = snap.docs[0];
  const session = sessionDoc.data();

  if (session.accessCode !== enteredCode.toUpperCase().trim()) return 'wrong_code';
  if (session.participantUids?.includes(studentUid)) return 'already_participated';

  // Mark student as participant in the session
  await updateDoc(sessionDoc.ref, {
    participantUids: arrayUnion(studentUid),
  });

  // Record attendance
  await recordAttendance(batchId, studentUid, sessionDoc.id);

  return 'ok';
}

// ─── Record attendance with rolling 3-day window ────────────────────────────
export async function recordAttendance(
  batchId: string,
  studentUid: string,
  sessionId: string
): Promise<void> {
  const today = new Date().toLocaleDateString('en-CA'); // "YYYY-MM-DD" in local time
  const attendanceId = `${batchId}_${today}`;
  const attendanceRef = doc(db, 'attendance', attendanceId);

  const snap = await getDoc(attendanceRef);
  if (!snap.exists()) {
    await setDoc(attendanceRef, {
      date: today,
      batchId,
      presentStudentIds: [studentUid],
      examSessionId: sessionId,
      updatedAt: serverTimestamp(),
    });
  } else {
    await updateDoc(attendanceRef, {
      presentStudentIds: arrayUnion(studentUid),
      updatedAt: serverTimestamp(),
    });
  }
}

// ─── Get all attendance days for a batch ──────────────────────────────────
export async function getAllAttendanceForBatch(batchId: string, limitCount?: number) {
  // Use a simple equality query to avoid needing a composite index
  let q = query(
    collection(db, 'attendance'),
    where('batchId', '==', batchId)
  );

  const snap = await cachedGetDocs(q, `attendance_batch_${batchId}`);
  
  const mapped = snap.docs.map((d: any) => ({
    date: d.data().date as string,
    presentStudentIds: d.data().presentStudentIds as string[],
  }));

  // Sort descending manually in JS
  mapped.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (limitCount && limitCount > 0) {
     return mapped.slice(0, limitCount);
  }
  return mapped;
}

// ─── Join session without code (when code requirement is off) ───────────────
export async function joinSessionWithoutCode(
  sessionId: string,
  sessionDoc: any,
  studentUid: string,
  batchId: string
): Promise<'ok' | 'already_participated'> {
  if (sessionDoc.participantUids?.includes(studentUid)) {
    return 'already_participated';
  }

  await updateDoc(doc(db, 'examSessions', sessionId), {
    participantUids: arrayUnion(studentUid),
  });

  // DO NOT record attendance for non-coded sessions
  // Only explicitly coded (live) sessions count for attendance
  return 'ok';
}
