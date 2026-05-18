import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, X, Loader2, Trash2, Plus, Search } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { collection, getDocs, getDoc, doc, updateDoc, setDoc, query, where, addDoc, deleteDoc, serverTimestamp, writeBatch, Timestamp, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { AppUser, useAuth } from '../components/AuthProvider';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { UnifiedQuizPlayer } from '../components/quiz/UnifiedQuizPlayer';
import { getAllAttendanceForBatch } from '../lib/exam-session-utils';

export function PageHeader({ title, backTo, description }: { title: string, backTo: string, description?: string }) {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col mb-6">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => navigate(backTo)}
          className="p-2 border-2 border-zinc-900 dark:border-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors shrink-0"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h2 className="text-2xl sm:text-3xl font-black italic uppercase leading-none">{title}</h2>
          {description && <p className="text-sm font-bold text-zinc-500 mt-1">{description}</p>}
        </div>
      </div>
    </div>
  );
}

// ADMIN PAGES
export function AdminStudents() {
  const [students, setStudents] = useState<AppUser[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [studentLastActive, setStudentLastActive] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [confirmDeleteStudentId, setConfirmDeleteStudentId] = useState<string | null>(null);

  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEmail, setNewStudentEmail] = useState('');
  const [newStudentBatch, setNewStudentBatch] = useState('');
  const [addingNewStudent, setAddingNewStudent] = useState(false);
  const [studentTab, setStudentTab] = useState<string>('pending');
  const [selectedStudentForModal, setSelectedStudentForModal] = useState<AppUser | null>(null);

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName || !newStudentEmail || !newStudentBatch) return;
    try {
      const mockUid = "student_" + Date.now() + Math.floor(Math.random()*1000);
      await setDoc(doc(db, 'users', mockUid), {
        uid: mockUid,
        email: newStudentEmail.toLowerCase(),
        fullName: newStudentName,
        role: 'student',
        status: 'active',
        batchId: newStudentBatch,
        isProfileComplete: true,
        monthlyFee: 500, // Default fee
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      alert(`Student ${newStudentName} created successfully!`);
      setNewStudentName('');
      setNewStudentEmail('');
      setNewStudentBatch('');
      setAddingNewStudent(false);
      window.location.reload();
    } catch (err) {
      alert("Error creating student: " + String(err));
    }
  };

  const [attendanceData, setAttendanceData] = useState<
    Record<string, Array<{ date: string; presentStudentIds: string[] }>>
  >({});
  
  const [activeBatchTab, setActiveBatchTab] = useState<string>('');
  const [attendanceSearchQuery, setAttendanceSearchQuery] = useState('');
  const [attendanceDateFilter, setAttendanceDateFilter] = useState('');

  useEffect(() => {
    if (!batches.length) return;
    if (!activeBatchTab) setActiveBatchTab(batches[0].id);
    const fetchAll = async () => {
      const result: Record<string, Array<{ date: string; presentStudentIds: string[] }>> = {};
      for (const batch of batches) {
        result[batch.id] = await getAllAttendanceForBatch(batch.id);
      }
      setAttendanceData(result);
    };
    fetchAll();
  }, [batches, activeBatchTab]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [studentsSnap, batchesSnap, resultsSnap] = await Promise.all([
          getDocs(collection(db, 'users')),
          getDocs(collection(db, 'batches')),
          getDocs(collection(db, 'results'))
        ]);
        
        const studentsData: AppUser[] = [];
        studentsSnap.forEach((doc) => {
          const data = doc.data();
          if (data.role !== 'admin') {
            studentsData.push({ uid: doc.id, ...data } as AppUser);
          }
        });
        setStudents(studentsData);

        const batchesData: Batch[] = [];
        batchesSnap.forEach((doc) => {
          batchesData.push({ id: doc.id, ...doc.data() } as Batch);
        });
        setBatches(batchesData);

        const lastActive: Record<string, number> = {};
        resultsSnap.forEach((doc) => {
          const r = doc.data();
          if (r.studentId && r.createdAt) {
            const time = r.createdAt.toMillis();
            if (!lastActive[r.studentId] || time > lastActive[r.studentId]) {
              lastActive[r.studentId] = time;
            }
          }
        });
        setStudentLastActive(lastActive);

      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users/batches');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleStatusChange = async (uid: string, newStatus: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { status: newStatus });
      setStudents(students.map(s => s.uid === uid ? { ...s, status: newStatus as any } : s));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleBatchChange = async (uid: string, batchId: string) => {
    try {
      await updateDoc(doc(db, 'users', uid), { batchId });
      setStudents(students.map(s => s.uid === uid ? { ...s, batchId } : s));
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `users/${uid}`);
    }
  };

  const handleDeleteStudent = async (uid: string) => {
    try {
      await deleteDoc(doc(db, 'users', uid));
      setStudents(students.filter(s => s.uid !== uid));
    } catch (error) {
       alert("Error deleting student: " + String(error));
    }
  };

  const getAbsenceDays = (lastActiveTime?: number) => {
    if (!lastActiveTime) return Infinity; // Never attended
    const diff = Date.now() - lastActiveTime;
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Manage Students (Attendance & Settings)" backTo="/admin" />

      {selectedStudentForModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-zinc-900 border-4 border-black p-6 shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full relative">
            <button 
              onClick={() => setSelectedStudentForModal(null)} 
              className="absolute top-4 right-4 bg-red-100 text-red-600 p-2 border-2 border-red-600 hover:bg-red-200 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
            <h3 className="text-2xl font-black uppercase mb-6 flex items-center gap-4">
               {selectedStudentForModal.profilePhotoUrl ? (
                  <img src={selectedStudentForModal.profilePhotoUrl} alt="Profile" className="w-16 h-16 object-cover border-4 border-black" />
               ) : (
                  <div className="w-16 h-16 bg-zinc-200 border-4 border-black flex items-center justify-center text-xs font-bold">N/A</div>
               )}
               {selectedStudentForModal.fullName || selectedStudentForModal.displayName || 'Unknown'}
            </h3>
            
            <div className="space-y-4">
               <div className="bg-zinc-100 dark:bg-zinc-800 p-3 border-2 border-zinc-900 dark:border-zinc-100">
                 <div className="text-xs font-bold uppercase text-zinc-500">Email</div>
                 <div className="font-mono mt-1">{selectedStudentForModal.email}</div>
               </div>
               
               <div className="bg-zinc-100 dark:bg-zinc-800 p-3 border-2 border-zinc-900 dark:border-zinc-100 flex gap-4">
                 <div className="flex-1">
                   <div className="text-xs font-bold uppercase text-zinc-500">Phone</div>
                   <div className="font-bold mt-1">{selectedStudentForModal.phone || 'Not provided'}</div>
                 </div>
                 <div className="flex-1 border-l-2 border-zinc-300 dark:border-zinc-700 pl-4">
                   <div className="text-xs font-bold uppercase text-zinc-500">Status</div>
                   <div className="font-bold mt-1 uppercase text-emerald-600">{selectedStudentForModal.status}</div>
                 </div>
               </div>

               <div className="bg-zinc-100 dark:bg-zinc-800 p-3 border-2 border-zinc-900 dark:border-zinc-100">
                 <div className="text-xs font-bold uppercase text-zinc-500">Home Address</div>
                 <div className="font-mono mt-1 text-sm">{selectedStudentForModal.address || 'Not provided'}</div>
               </div>
               
               {selectedStudentForModal.joinDate && (
                 <div className="text-xs font-bold uppercase text-zinc-500 text-right mt-2">
                   Joined Date: {selectedStudentForModal.joinDate}
                 </div>
               )}
            </div>
          </div>
        </div>
      )}

      {/* Add New Mock Student Form */}
      <div className="mb-8 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-900 dark:border-zinc-100 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)]">
        <div className="flex justify-between items-center mb-4">
           <h3 className="font-black text-xl text-yellow-600 dark:text-yellow-400 uppercase">Simulator Test Tools</h3>
           <button 
             onClick={() => setAddingNewStudent(!addingNewStudent)}
             className="px-4 py-2 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold text-xs uppercase"
           >
             {addingNewStudent ? 'Cancel' : '+ Create Virtual Student'}
           </button>
        </div>
        
        {addingNewStudent && (
          <form onSubmit={handleCreateStudent} className="flex flex-col sm:flex-row gap-4 items-end mt-4">
             <div className="flex-1 w-full">
               <label className="block text-xs font-bold uppercase mb-1">Full Name</label>
               <input 
                 value={newStudentName} 
                 onChange={e => setNewStudentName(e.target.value)}
                 className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none" 
                 placeholder="e.g. Rahul Sharma"
                 required
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-xs font-bold uppercase mb-1">Email</label>
               <input 
                 value={newStudentEmail} 
                 onChange={e => setNewStudentEmail(e.target.value)}
                 className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none" 
                 placeholder="e.g. rahul@example.com"
                 required
                 type="email"
               />
             </div>
             <div className="flex-1 w-full">
               <label className="block text-xs font-bold uppercase mb-1">Assign Batch</label>
               <select 
                 value={newStudentBatch} 
                 onChange={e => setNewStudentBatch(e.target.value)}
                 className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
                 required
               >
                 <option value="">-- Select Batch --</option>
                 {batches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                 ))}
               </select>
             </div>
             <button type="submit" className="px-6 py-2 bg-green-500 text-black border-2 border-black font-bold uppercase text-sm whitespace-nowrap shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:-translate-y-0.5">
               Save Student
             </button>
          </form>
        )}
        <p className="text-xs text-zinc-500 font-bold mt-4">Note: Use this to safely generate random student profiles for testing features (Payments, Results, Library) securely. No google sign-in needed.</p>
      </div>

      {batches.length > 0 && (
        <div className="mb-8 border-4 border-black bg-white dark:bg-zinc-900 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col">
          <div className="flex overflow-x-auto border-b-4 border-black scrollbar-hide">
            {batches.map(batch => (
              <button
                key={batch.id}
                onClick={() => {
                   setActiveBatchTab(batch.id);
                   setAttendanceSearchQuery('');
                   setAttendanceDateFilter('');
                }}
                className={`px-4 py-3 font-bold text-sm uppercase whitespace-nowrap border-r-4 border-black transition-colors ${
                  activeBatchTab === batch.id 
                    ? 'bg-yellow-300 text-black' 
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                {batch.name}
              </button>
            ))}
          </div>

          <div className="p-4 flex-1">
            {activeBatchTab && (
              <div className="mb-4 flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase mb-1">Search Student</label>
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Search by name..."
                      value={attendanceSearchQuery}
                      onChange={(e) => setAttendanceSearchQuery(e.target.value)}
                      className="w-full border-2 border-zinc-900 dark:border-zinc-100 pl-10 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-bold uppercase mb-1">Filter by Date</label>
                  <select
                    value={attendanceDateFilter}
                    onChange={(e) => setAttendanceDateFilter(e.target.value)}
                    className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
                  >
                    <option value="">All Days</option>
                    {(attendanceData[activeBatchTab] || []).map(r => (
                      <option key={r.date} value={r.date}>{r.date}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {activeBatchTab && (() => {
              const records = attendanceData[activeBatchTab] || [];
              const rawBatchStudents = students.filter((s) => s.batchId === activeBatchTab);
              
              const filteredStudents = rawBatchStudents.filter(s => {
                if (!attendanceSearchQuery) return true;
                const search = attendanceSearchQuery.toLowerCase();
                return s.fullName?.toLowerCase().includes(search) || s.email.toLowerCase().includes(search);
              });
              
              const filteredRecords = records.filter(r => {
                if (!attendanceDateFilter) return true;
                return r.date === attendanceDateFilter;
              });

              if (rawBatchStudents.length === 0) {
                return <p className="text-sm p-4 text-center font-bold text-zinc-500">There are no students in this batch yet.</p>;
              }
              if (records.length === 0) {
                return <p className="text-sm border-2 border-dashed border-gray-300 dark:border-zinc-700 p-4 text-center">কোনো উপস্থিতির তথ্য নেই</p>;
              }
              if (filteredStudents.length === 0) {
                return <p className="text-sm border-2 border-dashed border-gray-300 dark:border-zinc-700 p-4 text-center">No students match your search.</p>;
              }

              return (
                <div className="overflow-x-auto max-h-[500px] border-2 border-black">
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10">
                      <tr>
                        <th className="border-b-2 border-r-2 border-black px-3 py-2 text-left bg-black text-white w-48 min-w-[192px]">ছাত্র</th>
                        {filteredRecords.map((r) => (
                          <th key={r.date} className="border-b-2 border-r-2 border-black px-3 py-2 bg-yellow-200 text-black text-center whitespace-nowrap min-w-[100px]">
                            {r.date}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStudents.map((student, i) => {
                        return (
                          <tr key={student.uid} className={i % 2 === 0 ? "bg-white dark:bg-zinc-900" : "bg-zinc-50 dark:bg-zinc-800"}>
                            <td className="border-r-2 border-b border-zinc-200 dark:border-zinc-700 border-l border-zinc-200 px-3 py-2 font-bold whitespace-nowrap overflow-hidden text-ellipsis w-48 max-w-[192px]">
                              {student.fullName || student.email}
                            </td>
                            {filteredRecords.map((r) => (
                              <td key={r.date} className="border-r border-b border-zinc-200 dark:border-zinc-700 px-3 py-2 text-center text-xl">
                                {r.presentStudentIds.includes(student.uid) ? '✅' : '❌'}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {(() => {
        const pendingStudents = students.filter(s => s.status === 'pending');
        const displayStudents = studentTab === 'pending' 
          ? pendingStudents
          : studentTab === 'all'
            ? students.filter(s => s.status === 'active')
            : students.filter(s => s.status === 'active' && s.batchId === studentTab);

        return (
          <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] overflow-x-auto w-full">
            <div className="mb-6 flex overflow-x-auto border-b-4 border-black scrollbar-hide">
              <button
                onClick={() => setStudentTab('pending')}
                className={`px-4 py-3 font-bold text-sm uppercase whitespace-nowrap border-r-4 border-black transition-colors ${
                  studentTab === 'pending' ? 'bg-yellow-300 text-black' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                Approval Requests ({pendingStudents.length})
              </button>
              {batches.map(batch => (
                <button
                  key={batch.id}
                  onClick={() => setStudentTab(batch.id)}
                  className={`px-4 py-3 font-bold text-sm uppercase whitespace-nowrap border-r-4 border-black transition-colors ${
                    studentTab === batch.id ? 'bg-blue-300 text-black' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {batch.name}
                </button>
              ))}
              <button
                onClick={() => setStudentTab('all')}
                className={`px-4 py-3 font-bold text-sm uppercase whitespace-nowrap border-r-4 border-black transition-colors ${
                  studentTab === 'all' ? 'bg-purple-300 text-black' : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                All Active
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8" /></div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-zinc-900 dark:border-zinc-100 text-zinc-900 dark:text-zinc-100">
                    <th className="p-2 font-bold uppercase text-xs">Profile</th>
                    <th className="p-2 font-bold uppercase text-xs">Name / Email</th>
                    <th className="p-2 font-bold uppercase text-xs">Last Active</th>
                    <th className="p-2 font-bold uppercase text-xs hidden md:table-cell">Contact</th>
                    <th className="p-2 font-bold uppercase text-xs">Batch</th>
                    <th className="p-2 font-bold uppercase text-xs">Status</th>
                    <th className="p-2 font-bold uppercase text-xs text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {displayStudents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-zinc-500 font-medium">No students found in this category.</td>
                    </tr>
                  )}
                  {displayStudents.map((student) => {
                    const absentDays = getAbsenceDays(studentLastActive[student.uid]);
                    return (
                    <tr key={student.uid} className="border-b border-zinc-200 dark:border-zinc-800">
                      <td className="p-2">
                        {student.profilePhotoUrl ? (
                          <a href={student.profilePhotoUrl} target="_blank" rel="noopener noreferrer">
                             <img src={student.profilePhotoUrl} alt="Profile" className="w-10 h-10 object-cover border border-zinc-300" />
                          </a>
                        ) : (
                          <div className="w-10 h-10 bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center text-xs font-bold text-zinc-400">N/A</div>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="font-bold cursor-pointer hover:underline text-blue-600 dark:text-blue-400" onClick={() => setSelectedStudentForModal(student)}>
                          {student.fullName || student.displayName || 'Unknown'}
                        </div>
                        <div className="text-xs text-zinc-500">{student.email}</div>
                      </td>
                  <td className="p-2">
                    {absentDays === Infinity ? (
                      <span className="text-xs font-bold text-zinc-400 uppercase">Never tested</span>
                    ) : absentDays >= 3 ? (
                      <span className="inline-block px-2 py-1 bg-red-100 text-red-900 text-[10px] font-black uppercase border border-red-300">
                        Absent: {absentDays} days
                      </span>
                    ) : absentDays === 0 ? (
                      <span className="text-xs font-bold text-emerald-600 uppercase">Today</span>
                    ) : (
                      <span className="text-xs font-bold text-yellow-600 uppercase">
                        {absentDays} day{absentDays > 1 ? 's' : ''} ago
                      </span>
                    )}
                  </td>
                  <td className="p-2 hidden md:table-cell text-sm">
                    {student.phone ? <div className="font-bold">{student.phone}</div> : null}
                    {student.address ? <div className="text-xs text-zinc-500 line-clamp-1">{student.address}</div> : null}
                    {student.joinDate ? <div className="text-[10px] text-zinc-400 uppercase mt-1">Joined: {student.joinDate}</div> : null}
                  </td>
                  <td className="p-2">
                    <select
                      value={student.batchId || ''}
                      onChange={(e) => handleBatchChange(student.uid, e.target.value)}
                      className="border-2 border-zinc-200 dark:border-zinc-800 p-1 bg-transparent text-sm w-full max-w-[150px] text-zinc-900 dark:text-zinc-100"
                    >
                      <option value="" className="text-zinc-900">No Batch</option>
                      {batches.map(b => (
                        <option key={b.id} value={b.id} className="text-zinc-900">{b.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="p-2">
                    <span className={`px-2 py-1 text-[10px] font-bold uppercase ${
                      student.status === 'active' ? 'bg-emerald-100 text-emerald-800 border-[1px] border-emerald-300' :
                      student.status === 'pending' ? 'bg-yellow-100 text-yellow-800 border-[1px] border-yellow-300' :
                      'bg-red-100 text-red-800 border-[1px] border-red-300'
                    }`}>
                      {student.status}
                    </span>
                  </td>
                      <td className="p-2 text-right">
                        <div className="flex justify-end gap-2">
                          {student.status === 'pending' && (
                            <>
                              <button onClick={() => { handleStatusChange(student.uid, 'active'); setStudentTab(student.batchId || 'all'); }} className="p-1 px-2 border-2 border-emerald-600 bg-emerald-500 text-white font-bold text-xs uppercase hover:-translate-y-0.5 transition-transform" title="Approve">
                                Approve
                              </button>
                              <button onClick={() => handleStatusChange(student.uid, 'rejected')} className="p-1 px-2 border-2 border-red-600 bg-red-500 text-white font-bold text-xs uppercase hover:-translate-y-0.5 transition-transform" title="Reject">
                                Reject
                              </button>
                            </>
                          )}
                          
                          {confirmDeleteStudentId === student.uid ? (
                             <div className="flex gap-1">
                               <button onClick={() => { handleDeleteStudent(student.uid); setConfirmDeleteStudentId(null); }} className="p-1 px-2 border-2 border-red-600 bg-red-600 text-white font-bold text-[10px] uppercase">Yes</button>
                               <button onClick={() => setConfirmDeleteStudentId(null)} className="p-1 px-2 border-2 border-zinc-500 bg-zinc-200 text-black font-bold text-[10px] uppercase">No</button>
                             </div>
                          ) : (
                             <button onClick={() => setConfirmDeleteStudentId(student.uid)} className="p-1 px-2 border-2 border-red-600 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 font-bold text-xs uppercase hover:-translate-y-0.5 transition-transform flex items-center justify-center" title="Delete Student">
                               <Trash2 className="w-3.5 h-3.5" />
                             </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )})}
                </tbody>
              </table>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export interface Batch {
  id: string;
  name: string;
  schedule: string;
  createdAt?: any;
}

export function AdminBatches() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [schedule, setSchedule] = useState('');
  const [confirmDeleteBatchId, setConfirmDeleteBatchId] = useState<string | null>(null);

  const fetchBatches = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'batches'));
      const data: Batch[] = [];
      querySnapshot.forEach((doc) => {
        data.push({ id: doc.id, ...doc.data() } as Batch);
      });
      setBatches(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !schedule) return;
    try {
      setLoading(true);
      await addDoc(collection(db, 'batches'), {
        name,
        schedule,
        createdAt: serverTimestamp()
      });
      setName('');
      setSchedule('');
      await fetchBatches();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'batches');
      setLoading(false);
    }
  };

  const handleDeleteBatch = async (id: string) => {
    try {
      setLoading(true);

      const batchFn = writeBatch(db);

      // detach users
      const usersSnap = await getDocs(query(collection(db, 'users'), where('batchId', '==', id)));
      usersSnap.forEach(d => batchFn.update(d.ref, { batchId: null }));

      // delete notes
      const notesSnap = await getDocs(query(collection(db, 'notes'), where('batchId', '==', id)));
      notesSnap.forEach(d => batchFn.delete(d.ref));

      // delete exams
      const examsSnap = await getDocs(query(collection(db, 'exams'), where('batchId', '==', id)));
      examsSnap.forEach(d => batchFn.delete(d.ref));

      // delete assignments
      const assignsSnap = await getDocs(query(collection(db, 'batchAssignments'), where('batchId', '==', id)));
      assignsSnap.forEach(d => batchFn.delete(d.ref));

      // commit cascaded items
      await batchFn.commit();

      // finally delete batch
      await deleteDoc(doc(db, 'batches', id));
      await fetchBatches();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `batches/${id}`);
      setLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Manage Batches" backTo="/admin" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)]">
          <h3 className="font-black uppercase mb-4">Add New Batch</h3>
          <form onSubmit={handleAddBatch} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Batch Name</label>
              <input 
                type="text" 
                value={name} 
                onChange={e => setName(e.target.value)} 
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
                placeholder="e.g. Class 10 Math"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Schedule</label>
              <input 
                type="text" 
                value={schedule} 
                onChange={e => setSchedule(e.target.value)} 
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
                placeholder="e.g. Mon, Wed 5 PM"
              />
            </div>
            <button type="submit" disabled={loading || !name || !schedule} className="mt-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-xs px-4 py-3 flex justify-center items-center gap-2 hover:-translate-y-0.5 transition-transform border-2 border-transparent disabled:opacity-50">
              <Plus className="w-4 h-4" /> Add Batch
            </button>
          </form>
        </div>
        
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] overflow-x-auto w-full">
          <h3 className="font-black uppercase mb-4">Current Batches</h3>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8" /></div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-900 dark:border-zinc-100">
                  <th className="p-2 font-bold uppercase text-xs">Name</th>
                  <th className="p-2 font-bold uppercase text-xs">Schedule</th>
                  <th className="p-2 font-bold uppercase text-xs text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {batches.length === 0 && (
                  <tr>
                    <td colSpan={3} className="p-4 text-center text-zinc-500 font-medium">No batches found.</td>
                  </tr>
                )}
                {batches.map((batch) => (
                  <tr key={batch.id} className="border-b border-zinc-200 dark:border-zinc-800">
                    <td className="p-2 font-bold">{batch.name}</td>
                    <td className="p-2 text-sm">{batch.schedule}</td>
                    <td className="p-2 flex justify-end gap-2 items-center">
                       <button onClick={() => {
                           const newName = window.prompt("New Name:", batch.name);
                           if (!newName) return;
                           const newSchedule = window.prompt("New Schedule:", batch.schedule);
                           if (!newSchedule) return;
                           setLoading(true);
                           updateDoc(doc(db, 'batches', batch.id), { name: newName.trim(), schedule: newSchedule.trim() })
                             .then(fetchBatches)
                             .catch(err => {
                                handleFirestoreError(err, OperationType.UPDATE, 'batches');
                                setLoading(false);
                             });
                       }} className="p-1 px-3 bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200 dark:bg-blue-900 dark:text-blue-200 dark:border-blue-700 font-bold uppercase text-[10px]">
                          Edit
                       </button>
                      {confirmDeleteBatchId === batch.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => { handleDeleteBatch(batch.id); setConfirmDeleteBatchId(null); }} className="p-1 px-3 bg-red-600 text-white font-bold uppercase text-[10px]">Yes</button>
                          <button onClick={() => setConfirmDeleteBatchId(null)} className="p-1 px-3 bg-zinc-200 text-black font-bold uppercase text-[10px]">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteBatchId(batch.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export interface Note {
  id: string;
  title: string;
  contentUrl: string;
  fileName?: string;
  trackingId?: string;
  batchId: string;
  createdAt?: any;
  isChunked?: boolean;
  chunkCount?: number;
  localUrl?: string; // used for chunked blob URLs
}

export function AdminNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [contentUrl, setContentUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [batchId, setBatchId] = useState('');
  const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [notesSnap, batchesSnap] = await Promise.all([
        getDocs(collection(db, 'notes')),
        getDocs(collection(db, 'batches'))
      ]);
      
      const notesData: Note[] = [];
      notesSnap.forEach((doc) => {
        notesData.push({ id: doc.id, ...doc.data() } as Note);
      });
      setNotes(notesData);

      const batchesData: Batch[] = [];
      batchesSnap.forEach((doc) => {
        batchesData.push({ id: doc.id, ...doc.data() } as Batch);
      });
      setBatches(batchesData);
      
      if (batchesData.length > 0 && !batchId) {
        setBatchId(batchesData[0].id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'notes / batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const generateTrackingId = (filename: string) => {
    const base = filename.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9]/g, "-").toUpperCase().slice(0, 15);
    const randomSuffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `${base}-${randomSuffix}`;
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !batchId || (!contentUrl && !file)) return;
    try {
      setLoading(true);
      
      let finalUrl = contentUrl;
      let trackingId = '';
      let fileName = '';

      if (file) {
        if (file.size > 800000) {
           alert("File is too large for simple notes. Please use the Central Library for larger files.");
           setLoading(false);
           return;
        }
        finalUrl = await new Promise<string>((resolve, reject) => {
           const reader = new FileReader();
           reader.onload = (e) => resolve(e.target?.result as string);
           reader.onerror = (e) => reject(e);
           reader.readAsDataURL(file);
        });
        fileName = file.name;
        trackingId = generateTrackingId(file.name);
      }

      await addDoc(collection(db, 'notes'), {
        title,
        contentUrl: finalUrl,
        batchId,
        trackingId,
        fileName,
        createdAt: serverTimestamp()
      });
      setTitle('');
      setContentUrl('');
      setFile(null);
      await fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'notes');
      setLoading(false);
    }
  };

  const handleDeleteNote = async (id: string) => {
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'notes', id));
      await fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `notes/${id}`);
      setLoading(false);
    }
  };

  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown Batch';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Central Library" backTo="/admin" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)]">
          <h3 className="font-black uppercase mb-4">Upload Note</h3>
          <form onSubmit={handleAddNote} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Select Batch</label>
              <select
                value={batchId}
                onChange={e => setBatchId(e.target.value)}
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
              >
                {batches.map(b => (
                  <option key={b.id} value={b.id} className="text-zinc-900">{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Note Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
                placeholder="e.g. Chapter 1: Real Numbers"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Upload PDF</label>
              <input 
                type="file" 
                accept="application/pdf"
                onChange={e => setFile(e.target.files?.[0] || null)}
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none text-xs"
              />
            </div>
            <div className="text-center text-xs font-bold uppercase opacity-50 border-t-2 border-b-2 border-dashed border-zinc-900 dark:border-zinc-100 py-2 my-2">OR</div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">External Link</label>
              <input 
                type="url" 
                value={contentUrl} 
                onChange={e => setContentUrl(e.target.value)} 
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none text-xs"
                placeholder="Google Drive, Video Link..."
                disabled={!!file}
              />
            </div>
            <button type="submit" disabled={loading || !title || !batchId || (!contentUrl && !file)} className="mt-2 bg-orange-500 text-white font-bold uppercase text-xs px-4 py-3 flex justify-center items-center gap-2 hover:-translate-y-0.5 transition-transform border-2 border-transparent disabled:opacity-50 shadow-[4px_4px_0px_0px_rgba(234,88,12,1)]">
              <Plus className="w-4 h-4" /> Upload Note
            </button>
          </form>
        </div>
        
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] overflow-x-auto w-full">
          <h3 className="font-black uppercase mb-4">Uploaded Notes</h3>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-orange-500" /></div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-900 dark:border-zinc-100">
                  <th className="p-2 font-bold uppercase text-xs">Title & Info</th>
                  <th className="p-2 font-bold uppercase text-xs">Batch</th>
                  <th className="p-2 font-bold uppercase text-xs">Access</th>
                  <th className="p-2 font-bold uppercase text-xs text-right">Delete</th>
                </tr>
              </thead>
              <tbody>
                {notes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-zinc-500 font-medium">No notes uploaded yet.</td>
                  </tr>
                )}
                {notes.map((note) => (
                  <tr key={note.id} className="border-b border-zinc-200 dark:border-zinc-800">
                    <td className="p-2">
                       <span className="font-bold block">{note.title}</span>
                       <span className="text-[10px] text-zinc-500 font-mono tracking-wider">{note.trackingId || 'NO-TRACKING'} {note.fileName ? ` | ${note.fileName}` : ''}</span>
                    </td>
                    <td className="p-2 text-sm">{getBatchName(note.batchId)}</td>
                    <td className="p-2">
                       <a href={note.contentUrl} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline text-sm font-bold uppercase">View Link</a>
                    </td>
                    <td className="p-2 text-right">
                      {confirmDeleteNoteId === note.id ? (
                        <div className="flex justify-end gap-1">
                          <button onClick={() => { handleDeleteNote(note.id); setConfirmDeleteNoteId(null); }} className="p-1 px-3 bg-red-600 text-white font-bold uppercase text-[10px]">Yes</button>
                          <button onClick={() => setConfirmDeleteNoteId(null)} className="p-1 px-3 bg-zinc-200 text-black font-bold uppercase text-[10px]">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteNoteId(note.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

import { ExamType, InteractiveQuizPayload } from '../types/QuizData';

export interface Exam {
  id: string;
  title: string;
  examDate: string;
  examType?: ExamType; // e.g. 'Online Link', 'PDF Upload', 'Cloze Test', etc.
  contentUrl?: string; // Optional link to question paper or form
  analysisUrl?: string; // Link to detailed analysis or answer key
  quizData?: string; // Stored JSON payload for interactive quizzes
  batchId: string;
  createdAt?: any;
}

export function AdminExams() {
  const [exams, setExams] = useState<Exam[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmDeleteExamId, setConfirmDeleteExamId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [examDate, setExamDate] = useState('');
  const [examType, setExamType] = useState<ExamType>('Online Link');
  const [contentUrl, setContentUrl] = useState('');
  const [analysisUrl, setAnalysisUrl] = useState('');
  const [quizDataStr, setQuizDataStr] = useState('');
  const [batchId, setBatchId] = useState('');

  const fetchData = async () => {
    try {
      setLoading(true);
      const [examsSnap, batchesSnap] = await Promise.all([
        getDocs(collection(db, 'exams')),
        getDocs(collection(db, 'batches'))
      ]);
      
      const examsData: Exam[] = [];
      examsSnap.forEach((doc) => {
        examsData.push({ id: doc.id, ...doc.data() } as Exam);
      });
      setExams(examsData);

      const batchesData: Batch[] = [];
      batchesSnap.forEach((doc) => {
        batchesData.push({ id: doc.id, ...doc.data() } as Batch);
      });
      setBatches(batchesData);
      
      if (batchesData.length > 0 && !batchId) {
        setBatchId(batchesData[0].id);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'exams / batches');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleAddExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !examDate || !batchId) return;
    try {
      setLoading(true);
      const newExam: any = {
        title,
        examDate,
        examType,
        batchId,
        createdAt: serverTimestamp()
      };
      if (contentUrl) newExam.contentUrl = contentUrl;
      if (analysisUrl) newExam.analysisUrl = analysisUrl;
      if (quizDataStr) newExam.quizData = quizDataStr;
      
      await addDoc(collection(db, 'exams'), newExam);
      setTitle('');
      setExamDate('');
      setContentUrl('');
      setAnalysisUrl('');
      setQuizDataStr('');
      setExamType('Online Link');
      await fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'exams');
      setLoading(false);
    }
  };

  const handleDeleteExam = async (id: string) => {
    try {
      setLoading(true);
      await deleteDoc(doc(db, 'exams', id));
      await fetchData();
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `exams/${id}`);
      setLoading(false);
    }
  };

  const getBatchName = (id: string) => batches.find(b => b.id === id)?.name || 'Unknown Batch';

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Exam Engine" backTo="/admin" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)]">
          <h3 className="font-black uppercase mb-4">Create Exam</h3>
          <form onSubmit={handleAddExam} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Select Batch</label>
              <select
                value={batchId}
                onChange={e => setBatchId(e.target.value)}
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
              >
                {batches.map(b => (
                  <option key={b.id} value={b.id} className="text-zinc-900">{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Exam Title</label>
              <input 
                type="text" 
                value={title} 
                onChange={e => setTitle(e.target.value)} 
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
                placeholder="e.g. Unit Test 1"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Date & Time</label>
              <input 
                type="datetime-local" 
                value={examDate} 
                onChange={e => setExamDate(e.target.value)} 
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Exam Type</label>
              <select
                value={examType}
                onChange={e => setExamType(e.target.value as ExamType)}
                className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
              >
                <option value="Online Link" className="text-zinc-900">Online Link (Form)</option>
                <option value="PDF Upload" className="text-zinc-900">PDF Upload (Offline/Subjective)</option>
                <option value="Cloze Test" className="text-zinc-900">Interactive: Cloze Test</option>
                <option value="Error Correction" className="text-zinc-900">Interactive: Error Correction</option>
                <option value="Parajumble" className="text-zinc-900">Interactive: Parajumble</option>
                <option value="Comprehension" className="text-zinc-900">Interactive: Comprehension</option>
                <option value="Bilingual MCQ" className="text-zinc-900">Interactive: GK/Math/Reasoning</option>
              </select>
            </div>
            
            {['Cloze Test', 'Error Correction', 'Parajumble', 'Comprehension', 'Bilingual MCQ'].includes(examType) ? (
               <div>
                 <label className="block text-xs font-bold uppercase mb-1">Quiz JSON Data</label>
                 <textarea 
                   rows={6}
                   value={quizDataStr} 
                   onChange={e => setQuizDataStr(e.target.value)} 
                   className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none font-mono text-xs"
                   placeholder='Paste window.__PREPARSED_JSON__ payload here...'
                 />
                 <p className="text-[10px] opacity-70 mt-1">Format: Copy the JSON array/object from the provided exam HTML files.</p>
               </div>
            ) : (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Exam Link / Paper Link</label>
                    <input 
                      type="url" 
                      value={contentUrl} 
                      onChange={e => setContentUrl(e.target.value)} 
                      className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
                      placeholder="Google Form / Drive PDF Link"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Result Analysis / Answer Key Link</label>
                    <input 
                      type="url" 
                      value={analysisUrl} 
                      onChange={e => setAnalysisUrl(e.target.value)} 
                      className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none"
                      placeholder="Link to Analysis or Answers (Optional)"
                    />
                  </div>
                </>
            )}
            <button type="submit" disabled={loading || !title || !examDate || !batchId} className="mt-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-xs px-4 py-3 flex justify-center items-center gap-2 hover:-translate-y-0.5 transition-transform border-2 border-transparent disabled:opacity-50 shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] dark:shadow-[4px_4px_0px_0px_rgba(82,82,91,1)]">
              <Plus className="w-4 h-4" /> Add Exam
            </button>
          </form>
        </div>
        
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] overflow-x-auto w-full">
          <h3 className="font-black uppercase mb-4">Scheduled Exams</h3>
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-zinc-500" /></div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-900 dark:border-zinc-100">
                  <th className="p-2 font-bold uppercase text-xs">Title & Type</th>
                  <th className="p-2 font-bold uppercase text-xs">Batch</th>
                  <th className="p-2 font-bold uppercase text-xs">Date</th>
                  <th className="p-2 font-bold uppercase text-xs text-right">Delete</th>
                </tr>
              </thead>
              <tbody>
                {exams.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-zinc-500 font-medium">No exams scheduled yet.</td>
                  </tr>
                )}
                {exams.map((exam) => (
                  <tr key={exam.id} className="border-b border-zinc-200 dark:border-zinc-800">
                    <td className="p-2">
                      <div className="font-bold">{exam.title}</div>
                      <div className="text-[10px] uppercase font-bold text-zinc-500">{exam.examType || 'Online Link'}</div>
                      {exam.analysisUrl && <a href={exam.analysisUrl} target="_blank" rel="noopener noreferrer" className="text-[10px] text-blue-500 hover:underline uppercase font-bold block mt-1">View Analysis</a>}
                    </td>
                    <td className="p-2 text-sm">{getBatchName(exam.batchId)}</td>
                    <td className="p-2 text-sm text-zinc-500 dark:text-zinc-400">{exam.examDate}</td>
                    <td className="p-2 text-right flex justify-end items-center gap-2">
                       <Link to={`/admin/results/${exam.id}`} className="p-1 px-2 text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900 border border-blue-200 dark:border-blue-700 font-bold uppercase hover:bg-blue-200">
                          Results
                       </Link>
                      {confirmDeleteExamId === exam.id ? (
                        <div className="flex gap-1">
                          <button onClick={() => { handleDeleteExam(exam.id); setConfirmDeleteExamId(null); }} className="p-1 px-3 bg-red-600 text-white font-bold uppercase text-[10px]">Yes</button>
                          <button onClick={() => setConfirmDeleteExamId(null)} className="p-1 px-3 bg-zinc-200 text-black font-bold uppercase text-[10px]">No</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteExamId(exam.id)} className="p-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900 rounded">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

export interface Payment {
  id: string;
  studentId: string;
  studentName: string;
  studentEmail: string;
  amount: number;
  month: string;
  status: 'pending' | 'approved' | 'rejected';
  remarks?: string;
  createdAt?: any;
}

export function AdminPayments() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [rejectingPaymentId, setRejectingPaymentId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  
  const [editingAmountId, setEditingAmountId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState('');

  const [addingOfflinePayment, setAddingOfflinePayment] = useState(false);
  const [offlineMonth, setOfflineMonth] = useState('');
  const [offlineAmount, setOfflineAmount] = useState('');
  const [offlineSubmitting, setOfflineSubmitting] = useState(false);
  
  const currentYear = new Date().getFullYear();
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthOptions = [
    ...monthNames.map(m => `${m} ${currentYear - 1}`),
    ...monthNames.map(m => `${m} ${currentYear}`),
    ...monthNames.map(m => `${m} ${currentYear + 1}`)
  ];

  const fetchAll = async () => {
    try {
      setLoading(true);
      const [pSnap, uSnap, bSnap] = await Promise.all([
        getDocs(collection(db, 'payments')),
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'batches'))
      ]);
      
      const pData: Payment[] = [];
      pSnap.forEach(d => pData.push({ id: d.id, ...d.data() } as Payment));
      pData.sort((a,b) => b.createdAt?.toMillis() - a.createdAt?.toMillis());
      setPayments(pData);

      const uData: any[] = [];
      uSnap.forEach(d => {
         const data = d.data();
         if (data.role !== 'admin') {
            uData.push({ id: d.id, ...data });
         }
      });
      setStudents(uData);

      const bData: any[] = [];
      bSnap.forEach(d => bData.push({ id: d.id, ...d.data() }));
      setBatches(bData);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, []);

  const updateStudentPaymentDetails = async (studentId: string, updates: any) => {
    try {
       await updateDoc(doc(db, 'users', studentId), updates);
       setStudents(students.map(s => s.id === studentId ? { ...s, ...updates } : s));
    } catch (err) {
       alert("Error updating student: " + String(err));
    }
  };

  const updatePaymentStatus = async (id: string, status: 'approved' | 'rejected', remarks: string = '') => {
    if (status === 'rejected' && !remarks) {
      setRejectingPaymentId(id);
      return;
    }
    try {
      const payload: any = { status };
      if (remarks) payload.remarks = remarks;
      await updateDoc(doc(db, 'payments', id), payload);
      setPayments(payments.map(p => p.id === id ? { ...p, status, remarks } : p));
      if (status === 'rejected') {
         setRejectingPaymentId(null);
         setRejectReason('');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, 'payments');
    }
  };

  const updatePaymentAmount = async (id: string) => {
    if (!editingAmount) {
       setEditingAmountId(null);
       return;
    }
    try {
      const newAmount = Number(editingAmount);
      await updateDoc(doc(db, 'payments', id), { amount: newAmount });
      setPayments(payments.map(p => p.id === id ? { ...p, amount: newAmount } : p));
      setEditingAmountId(null);
      setEditingAmount('');
    } catch (error) {
      alert("Error updating payment amount: " + String(error));
    }
  };

  const handleAddOfflinePayment = async () => {
     if (!selectedStudentId || !offlineMonth || !offlineAmount) return;
     const student = students.find(s => s.id === selectedStudentId);
     if (!student) return;
     setOfflineSubmitting(true);
     try {
       const newPayment = {
          studentId: student.id,
          studentName: student.fullName || student.displayName || student.email,
          studentEmail: student.email || '',
          amount: Number(offlineAmount),
          month: offlineMonth,
          status: 'approved',
          remarks: 'Offline Payment (Cash/Direct)',
          createdAt: serverTimestamp()
       };
       const pRef = await addDoc(collection(db, 'payments'), newPayment);
       
       setPayments([{ id: pRef.id, ...newPayment, createdAt: Timestamp.now() } as any, ...payments]);
       setAddingOfflinePayment(false);
       setOfflineMonth('');
       setOfflineAmount('');
     } catch(err) {
       handleFirestoreError(err, OperationType.CREATE, 'payments');
     } finally {
       setOfflineSubmitting(false);
     }
  };

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin w-8 h-8" /></div>;

  if (selectedStudentId) {
     const student = students.find(s => s.id === selectedStudentId);
     if (!student) return <div>Student not found</div>;
     const studentPayments = payments.filter(p => p.studentId === selectedStudentId);

     return (
       <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full space-y-6 relative">
          {rejectingPaymentId && (
            <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-[100] p-4">
              <div className="bg-white dark:bg-zinc-900 border-4 border-red-600 dark:border-red-500 w-full max-w-md p-6 transform transition-all scale-100 shadow-[8px_8px_0px_0px_rgba(220,38,38,1)]">
                <h3 className="font-black text-xl text-red-600 uppercase mb-4">Reject Payment Request</h3>
                <p className="text-zinc-500 font-bold text-xs mb-2 uppercase">Please provide a reason for the rejection.</p>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 text-sm bg-transparent mb-4 outline-none focus:border-red-500" placeholder="e.g. Transaction ID invalid" rows={3} />
                <div className="flex gap-4">
                  <button onClick={() => updatePaymentStatus(rejectingPaymentId, 'rejected', rejectReason || 'Payment declined by admin.')} className="flex-1 border-2 border-red-600 bg-red-600 text-white shadow-[4px_4px_0px_0px_rgba(153,27,27,1)] font-bold uppercase py-2 hover:-translate-y-0.5 transition-transform">Reject</button>
                  <button onClick={() => setRejectingPaymentId(null)} className="flex-1 border-2 border-zinc-900 dark:border-zinc-100 bg-zinc-200 dark:bg-zinc-800 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] font-bold uppercase py-2 hover:-translate-y-0.5 transition-transform">Cancel</button>
                </div>
              </div>
            </div>
          )}

         <div className="flex items-center gap-4">
            <button onClick={() => setSelectedStudentId(null)} className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 font-bold uppercase text-xs hover:-translate-y-0.5 border-2 border-zinc-900 dark:border-zinc-100 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5"/> Back</button>
            <h2 className="text-xl font-black uppercase">Payment Details: {student.fullName || student.email}</h2>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)]">
               <h3 className="font-black uppercase mb-4 border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">Student Payment Config</h3>
               <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Monthly Salary / Fee (₹)</label>
                    <input type="number" 
                       value={student.monthlyFee || 0} 
                       onChange={(e) => updateStudentPaymentDetails(student.id, { monthlyFee: Number(e.target.value) })}
                       className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent font-mono" />
                    <p className="text-[10px] text-zinc-500 mt-1">Set to 0 if not eligible to pay monthly fees.</p>
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Exemption Reason</label>
                    <input type="text" 
                       value={student.exemptReason || ''} 
                       onChange={(e) => updateStudentPaymentDetails(student.id, { exemptReason: e.target.value })}
                       placeholder="e.g. Scholarship, relative, etc."
                       className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent text-sm" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Pending Months</label>
                    <input type="number" 
                       value={student.pendingMonths || 0} 
                       onChange={(e) => updateStudentPaymentDetails(student.id, { pendingMonths: Number(e.target.value) })}
                       className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent font-mono" />
                  </div>
                  <label className="flex items-center gap-2 mt-4 cursor-pointer">
                     <input type="checkbox" 
                        checked={!!student.showPaymentNudge}
                        onChange={(e) => updateStudentPaymentDetails(student.id, { showPaymentNudge: e.target.checked })}
                        className="w-4 h-4 accent-zinc-900 dark:accent-zinc-100" />
                     <span className="text-sm font-bold uppercase text-red-600 dark:text-red-400">Activate App Nudge (Show Popup)</span>
                  </label>
               </div>
            </div>

            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] h-[32rem] flex flex-col">
               <div className="flex justify-between items-center mb-4 border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">
                 <h3 className="font-black uppercase">Payment Requests</h3>
                 <button onClick={() => { setAddingOfflinePayment(!addingOfflinePayment); setOfflineAmount(String(student.monthlyFee || 500)); }} className="px-3 py-1 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-bold uppercase hover:-translate-y-0.5 transition-transform flex items-center gap-1">
                    <Plus className="w-3.5 h-3.5" /> Offline
                 </button>
               </div>

               {addingOfflinePayment && (
                 <div className="mb-4 space-y-3 p-3 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-900 dark:border-zinc-100">
                    <div>
                      <select value={offlineMonth} onChange={e => setOfflineMonth(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none">
                         <option value="">Select Month...</option>
                         {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <div>
                      <div className="flex bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 text-sm">
                         <span className="p-2 font-bold bg-zinc-200 dark:bg-zinc-800">₹</span>
                         <input type="number" value={offlineAmount} onChange={e => setOfflineAmount(e.target.value)} className="w-full p-2 bg-transparent focus:outline-none font-bold" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                       <button onClick={handleAddOfflinePayment} disabled={offlineSubmitting || !offlineMonth || !offlineAmount} className="flex-1 bg-green-500 text-black font-bold uppercase text-xs py-2 disabled:opacity-50">Save</button>
                       <button onClick={() => setAddingOfflinePayment(false)} className="flex-1 bg-zinc-300 dark:bg-zinc-700 font-bold uppercase text-xs py-2 text-black dark:text-white">Cancel</button>
                    </div>
                 </div>
               )}

               <div className="flex-1 overflow-y-auto pr-2">
                 {studentPayments.length === 0 ? (
                    <div className="text-center text-zinc-500 font-bold py-8 border-2 border-dashed border-zinc-300 dark:border-zinc-700">No payment history.</div>
                 ) : (
                    <div className="space-y-4">
                       {studentPayments.map(p => (
                          <div key={p.id} className="border-2 border-zinc-200 dark:border-zinc-800 p-3">
                             <div className="flex justify-between items-center mb-2">
                                <span className="font-black uppercase text-sm">{p.month}</span>
                                {editingAmountId === p.id ? (
                                   <div className="flex bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 text-sm">
                                      <input type="number" value={editingAmount} onChange={e => setEditingAmount(e.target.value)} className="w-16 p-1 bg-transparent focus:outline-none font-bold text-black dark:text-white" />
                                      <button onClick={() => updatePaymentAmount(p.id)} className="bg-emerald-500 text-white px-2 py-1"><Check className="w-3 h-3"/></button>
                                      <button onClick={() => setEditingAmountId(null)} className="bg-red-500 text-white px-2 py-1"><X className="w-3 h-3"/></button>
                                   </div>
                                ) : (
                                   <span className="font-mono font-bold hover:underline cursor-pointer" onClick={() => {setEditingAmountId(p.id); setEditingAmount(p.amount.toString());}}>₹{p.amount} ✎</span>
                                )}
                             </div>
                             <div className="flex justify-between items-center">
                                <span className={`text-[10px] font-bold text-black uppercase px-2 py-0.5 ${p.status === 'pending' ? 'bg-yellow-300' : p.status === 'approved' ? 'bg-emerald-300' : 'bg-red-300'}`}>{p.status}</span>
                                {p.status === 'pending' && (
                                   <div className="flex gap-2">
                                      <button onClick={() => updatePaymentStatus(p.id, 'approved')} className="text-[10px] bg-emerald-500 text-white font-bold uppercase px-2 py-1 flex items-center gap-1 shadow-[2px_2px_0px_0px_#064e3b]"><Check className="w-3 h-3"/>Approve</button>
                                      <button onClick={() => updatePaymentStatus(p.id, 'rejected')} className="text-[10px] bg-red-500 text-white font-bold uppercase px-2 py-1 flex items-center gap-1 shadow-[2px_2px_0px_0px_#450a0a]"><X className="w-3 h-3"/>Reject</button>
                                   </div>
                                )}
                             </div>
                             {p.remarks && <div className="text-[10px] text-zinc-500 mt-2 italic border-t border-zinc-200 dark:border-zinc-800 pt-1">Remark: {p.remarks}</div>}
                          </div>
                       ))}
                    </div>
                 )}
               </div>
            </div>
         </div>
       </div>
     );
  }

  if (selectedBatchId) {
     const bName = selectedBatchId === 'unassigned' ? 'Unassigned' : batches.find(b => b.id === selectedBatchId)?.name;
     const bStudents = students.filter(s => selectedBatchId === 'unassigned' ? !s.batchId : s.batchId === selectedBatchId);
     
     return (
       <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
         <div className="flex items-center gap-4 mb-6">
            <button onClick={() => setSelectedBatchId(null)} className="px-3 py-1.5 bg-zinc-200 dark:bg-zinc-800 font-bold uppercase text-xs hover:-translate-y-0.5 border-2 border-zinc-900 dark:border-zinc-100 flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5"/> Back</button>
            <h2 className="text-xl font-black uppercase text-yellow-600 dark:text-yellow-400">Batch: {bName}</h2>
         </div>
         <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)]">
            <h3 className="font-black uppercase mb-4 border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">Students</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
               {bStudents.length === 0 ? (
                  <div className="col-span-full py-8 text-center border-2 border-dashed border-zinc-300 dark:border-zinc-700 font-bold text-zinc-500">
                     No students in this batch. To add students, go to the 'Students Management' module and click '+ Create Virtual Student'.
                  </div>
               ) : bStudents.map(s => {
                  const pendingCount = payments.filter(p => p.studentId === s.id && p.status === 'pending').length;
                  return (
                    <button key={s.id} onClick={() => setSelectedStudentId(s.id)} className="w-full text-left p-4 border-2 border-zinc-200 dark:border-zinc-800 hover:border-zinc-900 dark:hover:border-zinc-100 flex flex-col items-start gap-1">
                      <span className="font-bold">{s.fullName || s.email}</span>
                      {s.monthlyFee > 0 ? (
                         <span className="text-xs font-mono text-zinc-500">Fee: ₹{s.monthlyFee}</span>
                      ) : (
                         <span className="text-xs font-mono text-zinc-500 flex flex-col gap-1 w-full"><div className="opacity-60">Fee: None</div> <div className="text-[10px] bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400 p-1 font-bold">⚠️ Profile Incomplete</div></span>
                      )}
                      {pendingCount > 0 && <span className="text-[10px] bg-yellow-100 text-yellow-800 font-bold uppercase px-2 py-0.5 mt-1">{pendingCount} Pending Req</span>}
                    </button>
                  );
               })}
            </div>
         </div>
       </div>
     );
  }

  // Display batches & Global Pending
  const allPending = payments.filter(p => p.status === 'pending');

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Payments Management" backTo="/admin" />

      <div className="mb-8 border-4 border-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 p-6">
         <h3 className="font-black text-xl uppercase mb-4 text-yellow-800 dark:text-yellow-400">Needs Verification ({allPending.length})</h3>
         {allPending.length === 0 ? (
           <div className="text-zinc-600 dark:text-zinc-400 font-bold italic">You're all caught up! No pending payments to verify.</div>
         ) : (
         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
           {allPending.map(p => (
              <div key={p.id} className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)]">
                <div className="text-xs font-bold uppercase text-zinc-500 mb-1">{p.studentName || p.studentEmail}</div>
                <div className="flex justify-between items-center mb-3">
                  <span className="font-black">{p.month}</span>
                  {editingAmountId === p.id ? (
                     <div className="flex bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 text-sm">
                        <input type="number" value={editingAmount} onChange={e => setEditingAmount(e.target.value)} className="w-20 p-1 bg-transparent focus:outline-none font-bold text-black dark:text-white" />
                        <button onClick={() => updatePaymentAmount(p.id)} className="bg-emerald-500 text-white px-2 py-1 flex items-center justify-center"><Check className="w-3 h-3"/></button>
                        <button onClick={() => setEditingAmountId(null)} className="bg-red-500 text-white px-2 py-1 flex items-center justify-center"><X className="w-3 h-3"/></button>
                     </div>
                  ) : (
                     <span className="font-mono font-bold text-lg hover:underline cursor-pointer" onClick={() => {setEditingAmountId(p.id); setEditingAmount(p.amount.toString());}}>₹{p.amount} ✎</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => updatePaymentStatus(p.id, 'approved')} className="flex-1 text-[10px] bg-emerald-500 text-white font-black uppercase px-2 py-2 flex justify-center items-center gap-1 shadow-[2px_2px_0px_0px_#064e3b] hover:-translate-y-0.5"><Check className="w-3 h-3"/>Approve</button>
                  <button onClick={() => updatePaymentStatus(p.id, 'rejected')} className="flex-1 text-[10px] bg-red-500 text-white font-black uppercase px-2 py-2 flex justify-center items-center gap-1 shadow-[2px_2px_0px_0px_#450a0a] hover:-translate-y-0.5"><X className="w-3 h-3"/>Reject</button>
                </div>
              </div>
           ))}
         </div>
         )}
      </div>

      <h3 className="font-black uppercase mb-4 opacity-70">Students by Batch</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
        {batches.map(b => (
           <button key={b.id} onClick={() => setSelectedBatchId(b.id)} className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] hover:-translate-y-1 transition-transform text-left">
              <h3 className="text-xl font-black uppercase text-yellow-600 dark:text-yellow-400 mb-2">{b.name}</h3>
              <p className="text-sm font-bold text-zinc-500">{students.filter(s => s.batchId === b.id).length} Students</p>
           </button>
        ))}
        <button onClick={() => setSelectedBatchId('unassigned')} className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] hover:-translate-y-1 transition-transform text-left opacity-70">
           <h3 className="text-xl font-black uppercase mb-2">Unassigned</h3>
           <p className="text-sm font-bold text-zinc-500">{students.filter(s => !s.batchId).length} Students</p>
        </button>
      </div>
    </div>
  );
}

// STUDENT PAGES
export function StudentPayments() {
  const { user } = useAuth();
  
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [settings, setSettings] = useState({ adminUpiId: '', enablePaymentSystem: true });

  const monthlyFeeAmount = Number((user as any)?.monthlyFee) || 0;
  const isFeeWaived = monthlyFeeAmount === 0 && (user as Record<string,any>).monthlyFee !== undefined;
  
  const calculatedAmount = selectedMonths.length > 0 ? selectedMonths.length * (monthlyFeeAmount > 0 ? monthlyFeeAmount : 500) : (monthlyFeeAmount > 0 ? monthlyFeeAmount : 500);

  useEffect(() => {
     if (!user) return;
     
     const loadSettings = async () => {
       try {
         const docSnap = await getDoc(doc(db, 'settings', 'general'));
         if (docSnap.exists()) {
           const data = docSnap.data();
           setSettings({
             adminUpiId: data.adminUpiId || 'mondal.saikat185@okaxis', // default
             enablePaymentSystem: data.enablePaymentSystem !== false
           });
         }
       } catch (err) {
         console.error("Failed to load settings:", err);
       }
     };
     loadSettings();

     const q = query(collection(db, 'payments'), where('studentId', '==', user.uid));
     const unsubscribe = onSnapshot(q, (snap) => {
       const data: Payment[] = [];
       snap.forEach((doc) => {
         data.push({ id: doc.id, ...doc.data() } as Payment);
       });
       data.sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
       setPayments(data);
       setLoading(false);
     }, (error) => {
       console.error("Payment fetch error:", error);
       setLoading(false);
     });

     return () => unsubscribe();
  }, [user?.uid]);

  const currentYear = new Date().getFullYear();
  const nextYear = currentYear + 1;
  const prevYear = currentYear - 1;
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const monthOptions = [
    ...monthNames.map(m => `${m} ${prevYear}`),
    ...monthNames.map(m => `${m} ${currentYear}`),
    ...monthNames.map(m => `${m} ${nextYear}`)
  ];

  const toggleMonth = (m: string) => {
    if (selectedMonths.includes(m)) {
      setSelectedMonths(selectedMonths.filter(x => x !== m));
    } else {
      setSelectedMonths([...selectedMonths, m]);
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedMonths.length === 0 || !user) {
      alert("Please select at least one month.");
      return;
    }
    
    // Validate Sequential Month Selection
    const paidMonths = payments
      .filter(p => p.status !== 'rejected')
      .flatMap(p => p.month.split(',').map(m => m.trim()));
    const paidIndices = paidMonths.map(m => monthOptions.indexOf(m)).filter(idx => idx !== -1);
    const maxPaidIndex = paidIndices.length > 0 ? Math.max(...paidIndices) : -1;
    
    const selectedIndices = selectedMonths.map(m => monthOptions.indexOf(m)).sort((a, b) => a - b);
    
    // Check if the selected months themselves are consecutive
    for (let i = 1; i < selectedIndices.length; i++) {
       if (selectedIndices[i] !== selectedIndices[i-1] + 1) {
          alert("Please select strictly consecutive months.");
          return;
       }
    }
    
    // Check if they start exactly after the last paid month
    if (maxPaidIndex !== -1) {
       // Check if they are trying to pay an already paid month
       const alreadyPaid = selectedIndices.some(idx => paidIndices.includes(idx));
       if (alreadyPaid) {
          alert("You have already submitted a payment for one or more of the selected months.");
          return;
       }
       
       if (selectedIndices[0] !== maxPaidIndex + 1) {
          alert(`You must pay consecutively. Your next due month is ${monthOptions[maxPaidIndex + 1]}.`);
          return;
       }
    }
    
    if (isFeeWaived) {
      alert("আপনার fee waived করা আছে। Payment submit করার প্রয়োজন নেই।");
      return;
    }
    
    if ((user as any).isSimulatedAdmin) {
       const isRealStudent = localStorage.getItem('simulatedStudentId');
       if (!isRealStudent) {
         alert("Please select a real student from the dropdown above to test the payment submission flow. Submitting as the 'Default Admin UID' is blocked.");
         return;
       }
       // Removed window.confirm as it crashes in isolated iframes
    }
    
    try {
      setSubmitting(true);
      await addDoc(collection(db, 'payments'), {
        studentId: user.uid,
        studentName: user.fullName || user.displayName || 'Unknown Student',
        studentEmail: user.email || '',
        month: selectedMonths.join(', '),
        amount: calculatedAmount,
        status: 'pending',
        createdAt: serverTimestamp()
      });
      setSelectedMonths([]);
      setPaymentSuccess(true);
      setTimeout(() => setPaymentSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'payments');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Fees & Payments" backTo="/student" />
      
      {user && (user as any).pendingMonths > 0 && (
         <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border-2 border-red-600 dark:border-red-500 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-[4px_4px_0px_0px_rgba(220,38,38,1)]">
            <div>
               <h3 className="font-black text-red-800 dark:text-red-400 uppercase">Payment Pending</h3>
               <p className="text-sm font-bold text-red-700 dark:text-red-300">You have {(user as any).pendingMonths} month{((user as any).pendingMonths || 1) > 1 ? 's' : ''} of fees pending. Please clear them as soon as possible.</p>
            </div>
         </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 bg-yellow-300 dark:bg-yellow-600 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] h-max flex flex-col text-zinc-900">
          <h3 className="font-black uppercase mb-4 text-xl">Submit Payment Details</h3>
          
          {!settings.enablePaymentSystem ? (
             <div className="mb-6 p-4 bg-zinc-100 dark:bg-zinc-800 border-2 border-zinc-400 flex flex-col justify-center items-center gap-4 text-center mt-4">
                <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300">Online payment submission is currently disabled by the administrator.</p>
             </div>
          ) : isFeeWaived ? (
             <div className="mb-6 p-4 bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-600 flex flex-col justify-center items-center gap-4 text-center mt-4">
                <h3 className="font-black text-emerald-800 dark:text-emerald-400 uppercase text-lg">Fee Waived</h3>
                <p className="text-sm font-bold text-emerald-700 dark:text-emerald-300">Your monthly fee is set to ₹0. You don't have any pending fees.</p>
                {(user as any)?.exemptReason && (
                   <div className="mt-2 text-xs font-bold bg-emerald-200 text-emerald-900 border border-emerald-600 px-2 py-1">
                      REASON: {(user as any)?.exemptReason}
                   </div>
                )}
             </div>
          ) : (
          <>
          <div className="mb-6 p-4 bg-white dark:bg-zinc-900 border-2 border-dashed border-zinc-900 dark:border-zinc-100 text-center flex flex-col items-center">
             <div className="text-xs font-bold uppercase mb-2 dark:text-yellow-100">Scan to Pay via UPI</div>
             {settings.adminUpiId ? (
                (() => {
                   const upiId = (settings.adminUpiId || '').trim();
                   const am = calculatedAmount || 500;
                   const genericUpi = `upi://pay?pa=${upiId}&pn=Tutor&am=${am}&cu=INR`;
                   return (
                      <>
                         <div className="bg-white p-2 border-2 border-zinc-900 inline-block mb-2">
                            <QRCodeSVG value={genericUpi} size={120} />
                         </div>
                         <div className="text-[10px] font-bold opacity-70 dark:text-yellow-100 mb-2">{settings.adminUpiId}</div>
                         
                         <p className="text-xs font-bold text-zinc-500 mt-2 mb-2">OR PAY USING APP</p>
                         <div className="flex flex-wrap justify-center gap-2 mb-2 w-full">
                            <a href={genericUpi} className="px-3 py-1.5 bg-purple-600 text-white font-bold text-xs hover:-translate-y-0.5 transition-transform">PhonePe / App</a>
                            <a href={`tez://upi/pay?pa=${upiId}&pn=Tutor&am=${am}&cu=INR`} className="px-3 py-1.5 bg-white text-zinc-900 border-2 border-zinc-200 font-bold text-xs hover:-translate-y-0.5 transition-transform flex items-center gap-1"><span className="text-blue-500 font-black">G</span>Pay</a>
                            <a href={`paytmmp://pay?pa=${upiId}&pn=Tutor&am=${am}&cu=INR`} className="px-3 py-1.5 bg-[#00b9f1] text-white font-bold text-xs hover:-translate-y-0.5 transition-transform">Paytm</a>
                            <a href={genericUpi} className="px-3 py-1.5 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 font-bold text-xs hover:-translate-y-0.5 transition-transform">Any UPI</a>
                         </div>
                         
                         {!settings.adminUpiId.includes('@') && (
                            <div className="mt-2 text-red-600 dark:text-red-400 text-[10px] bg-red-100 dark:bg-red-900/30 p-2 font-bold text-justify">
                               Warning: The configured UPI ID "{settings.adminUpiId}" appears to be a regular phone number. It MUST include an "@" suffix (e.g. @ybl, @okaxis) for direct payment links to work. If apps crash, this is why!
                            </div>
                         )}
                         
                         <div className="mt-4 border-t-2 border-zinc-200 dark:border-zinc-800 pt-4 w-full">
                            <p className="text-[11px] font-bold text-zinc-700 dark:text-zinc-300">UPI links not working or failing?</p>
                            <p className="text-[10px] mt-1 text-zinc-500">You can copy the UPI ID below and paste it directly into your UPI app (like GPay, PhonePe, or Paytm):</p>
                            <div className="flex items-center justify-center gap-2 mt-2">
                               <div className="text-sm font-black text-zinc-900 dark:text-white p-2 border-2 border-zinc-300 select-all">{upiId}</div>
                               <button 
                                 onClick={(e) => {
                                    e.preventDefault();
                                    navigator.clipboard.writeText(upiId);
                                    alert('UPI ID copied to clipboard!');
                                 }}
                                 className="p-2 bg-blue-100 text-blue-700 hover:bg-blue-200 font-bold text-xs uppercase"
                               >
                                 Copy ID
                               </button>
                            </div>
                         </div>
                      </>
                   );
                })()
             ) : (
                <div className="text-red-500 font-bold text-sm bg-red-100 p-3 w-full border border-red-500">
                   ⚠️ Setup Required: Admin UPI ID is not configured.
                </div>
             )}
          </div>

          <p className="text-sm font-medium mb-6 dark:text-yellow-100 text-center px-2">After completing the payment via UPI, explicitly select your target months and submit for approval.</p>
          
          {paymentSuccess && (
            <div className="mb-4 bg-emerald-100 dark:bg-emerald-900/30 border-2 border-emerald-600 p-4 text-emerald-800 dark:text-emerald-400 font-bold uppercase text-xs flex items-center justify-center text-center shadow-[4px_4px_0px_0px_rgba(5,150,105,1)]">
              ✅ Payment request submitted! Admin will verify shortly.
            </div>
          )}

          <form onSubmit={handleSubmitPayment} className="flex flex-col gap-4">
             <div className="bg-white dark:bg-zinc-900 p-4 border-2 border-zinc-900 dark:border-zinc-100 dark:text-white">
               <label className="block text-xs font-bold uppercase mb-2">Select Month(s)<span className="ml-2 text-[10px] text-emerald-600 dark:text-emerald-400 font-black tracking-widest">{selectedMonths.length} SELECTED</span></label>
               <div className="h-44 overflow-y-auto border-2 border-zinc-200 dark:border-zinc-700 p-1 space-y-1 bg-zinc-50 dark:bg-zinc-950">
                 {monthOptions.map(m => (
                   <button
                     key={m}
                     type="button"
                     onClick={() => toggleMonth(m)}
                     className={`w-full text-left px-3 py-2 text-sm font-bold transition-colors ${
                       selectedMonths.includes(m) 
                         ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                         : 'bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300'
                     }`}
                   >
                     {m}
                     {selectedMonths.includes(m) && <span className="float-right text-xs">✓</span>}
                   </button>
                 ))}
               </div>
               <p className="text-[10px] text-zinc-500 mt-2 font-bold italic">Tip: Click to toggle selections for multiple adjacent months.</p>
             </div>
            <div className="bg-white dark:bg-zinc-900 p-4 border-2 border-zinc-900 dark:border-zinc-100 dark:text-white">
              <label className="block text-xs font-bold uppercase mb-1">Total Amount Paid (₹)</label>
              <div className="w-full border-b-2 border-zinc-200 dark:border-zinc-700 p-2 bg-transparent text-2xl font-black text-center">
                ₹{calculatedAmount}
              </div>
            </div>
            
            <button type="submit" disabled={submitting || selectedMonths.length === 0} className="mt-2 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-bold uppercase text-xs px-4 py-4 hover:-translate-y-0.5 transition-transform border-2 border-transparent disabled:opacity-50 disabled:hover:translate-y-0">
              {submitting ? 'Submitting...' : 'Submit to Admin'}
            </button>
          </form>
          </>
          )}
        </div>
        
        <div className="md:col-span-2 bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-6 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)]">
          <h3 className="font-black text-xl uppercase mb-6 flex gap-2 items-center">
            Payment History
          </h3>
          
          {loading ? (
            <div className="flex justify-center p-8"><Loader2 className="animate-spin w-8 h-8 text-yellow-500" /></div>
          ) : (
            <div className="flex flex-col gap-4">
              {payments.length === 0 && (
                <div className="p-6 border-2 border-dashed border-zinc-300 dark:border-zinc-700 text-center text-zinc-500 font-medium">
                  No payment history found.
                </div>
              )}
              {payments.map(payment => (
                <div key={payment.id} className="flex flex-col sm:flex-row justify-between sm:items-center p-4 border-2 border-zinc-200 dark:border-zinc-800 gap-4">
                  <div>
                    <h4 className="font-black text-lg uppercase">{payment.month}</h4>
                    <div className="text-zinc-500 font-bold font-mono mt-1">₹{payment.amount}</div>
                  </div>
                  <div>
                    {payment.status === 'pending' && <span className="px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-bold uppercase rounded-full border-2 border-yellow-200">Pending Review</span>}
                    {payment.status === 'approved' && <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-bold uppercase rounded-full border-2 border-emerald-200">Approved</span>}
                    {payment.status === 'rejected' && <span className="px-3 py-1 bg-red-100 text-red-800 text-xs font-bold uppercase rounded-full border-2 border-red-200">Rejected</span>}
                    {payment.remarks && <div className="text-[10px] text-zinc-500 mt-2 italic flex justify-end">Remark: {payment.remarks}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}