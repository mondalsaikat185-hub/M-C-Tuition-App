import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy, where, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { PageHeader } from './Pages';
import { Loader2, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';

export function AdminResults() {
  const { examId } = useParams();
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [tab, setTab] = useState<'latest' | 'student' | 'exam'>('latest');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  useEffect(() => {
    fetchResults();
  }, [examId]);

  const fetchResults = async () => {
    try {
      setLoading(true);
      let q;
      if (examId) {
         q = query(collection(db, 'results'), where('examId', '==', examId));
      } else {
         q = query(collection(db, 'results'), orderBy('createdAt', 'desc'));
      }
      
      const qSnap = await getDocs(q);
      const data: any[] = [];
      
      const userIds = new Set<string>();
      qSnap.forEach(d => {
         const dData = d.data() as any;
         data.push({ id: d.id, ...dData });
         if (dData.studentId) userIds.add(dData.studentId);
      });

      // Fetch students
      if (userIds.size > 0) {
         const uSnap = await getDocs(collection(db, 'users'));
         const userDict: Record<string, string> = {};
         uSnap.forEach(d => { userDict[d.id] = d.data().fullName || d.data().displayName || d.data().email || 'Unknown'; });
         
         data.forEach(r => {
            r.studentName = userDict[r.studentId] || r.studentName || 'Unknown Student';
         });
      }
      
      setResults(data);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'results');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(results.map(r => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedIds.size === 0) return;
    
    try {
      setDeleting(true);
      const batchFn = writeBatch(db);
      selectedIds.forEach(id => {
         batchFn.delete(doc(db, 'results', id));
      });
      await batchFn.commit();
      
      setResults(results.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      alert("Results deleted successfully.");
    } catch (error: any) {
      alert("Delete failed: " + error.message);
      handleFirestoreError(error, OperationType.DELETE, 'results');
    } finally {
      setDeleting(false);
    }
  };

  let displayResults = [...results];
  if (tab === 'student') {
     displayResults.sort((a,b) => (a.studentName || '').localeCompare(b.studentName || ''));
  } else if (tab === 'exam') {
     displayResults.sort((a,b) => (a.examTitle || '').localeCompare(b.examTitle || ''));
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader title="Exam Results" backTo={examId ? "/admin/library" : "/admin"} />
      
      <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 sm:p-6 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)] w-full overflow-x-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
           <h3 className="font-black uppercase text-xl">Score Board</h3>
           <div className="flex bg-zinc-200 dark:bg-zinc-800 p-1">
              <button onClick={() => setTab('latest')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${tab === 'latest' ? 'bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]' : 'opacity-70 hover:opacity-100'}`}>Latest</button>
              <button onClick={() => setTab('student')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${tab === 'student' ? 'bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]' : 'opacity-70 hover:opacity-100'}`}>By Student</button>
              <button onClick={() => setTab('exam')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${tab === 'exam' ? 'bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]' : 'opacity-70 hover:opacity-100'}`}>By Exam</button>
           </div>
           
           {selectedIds.size > 0 && (
             <div className="flex items-center gap-2">
               {showConfirm ? (
                 <div className="flex items-center gap-2 bg-red-100 dark:bg-red-900/30 p-1 border-2 border-red-500">
                    <span className="text-xs font-bold text-red-700 dark:text-red-400 px-2">Are you sure?</span>
                    <button disabled={deleting} onClick={() => { setShowConfirm(false); handleDeleteSelected(); }} className="bg-red-500 text-white font-bold uppercase text-xs px-3 py-1.5 hover:-translate-y-0.5 transition-transform flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]">Yes, Delete</button>
                    <button disabled={deleting} onClick={() => setShowConfirm(false)} className="bg-zinc-300 dark:bg-zinc-700 text-black dark:text-white font-bold uppercase text-xs px-3 py-1.5 hover:-translate-y-0.5 transition-transform shadow-[2px_2px_0px_0px_rgba(39,39,42,1)]">Cancel</button>
                 </div>
               ) : (
                 <button onClick={() => setShowConfirm(true)} className="bg-red-500 text-white font-bold uppercase text-xs px-4 py-2 hover:-translate-y-0.5 transition-transform flex items-center gap-2 border-2 border-red-700 shadow-[2px_2px_0px_0px_rgba(185,28,28,1)]">
                   <Trash2 className="w-4 h-4" />
                   Delete ({selectedIds.size})
                 </button>
               )}
             </div>
           )}
        </div>
        
        {loading ? (
          <div className="flex justify-center p-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : displayResults.length === 0 ? (
          <div className="text-zinc-500 font-bold">No results found.</div>
        ) : (
          <div className="min-w-[600px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b-2 border-zinc-900 dark:border-zinc-100">
                  <th className="p-2 w-10">
                    <input 
                      type="checkbox" 
                      checked={selectedIds.size === results.length && results.length > 0} 
                      onChange={handleSelectAll}
                      className="w-4 h-4 accent-zinc-900 dark:accent-zinc-100 cursor-pointer" 
                    />
                  </th>
                  <th className="p-2 font-bold uppercase text-xs">Date</th>
                  <th className="p-2 font-bold uppercase text-xs">Student</th>
                  <th className="p-2 font-bold uppercase text-xs">Exam</th>
                  <th className="p-2 font-bold uppercase text-xs text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {displayResults.map((r, idx) => (
                  <tr key={r.id} className={`border-b border-zinc-200 dark:border-zinc-800 ${selectedIds.has(r.id) ? 'bg-red-50 dark:bg-red-900/20' : ''}`}>
                    <td className="p-2">
                       <input 
                         type="checkbox" 
                         checked={selectedIds.has(r.id)} 
                         onChange={() => handleSelect(r.id)} 
                         className="w-4 h-4 accent-red-600 cursor-pointer"
                       />
                    </td>
                    <td className="p-2 text-xs font-mono opacity-70">
                       {r.createdAt?.toDate().toLocaleString() || 'N/A'}
                    </td>
                    <td className="p-2 font-bold">{r.studentName}</td>
                    <td className="p-2 text-sm">{r.examTitle}</td>
                    <td className="p-2 text-right">
                      <span className="font-black text-blue-600 dark:text-blue-400">{r.score}</span>
                      <span className="text-xs opacity-50 ml-1">/ {r.totalPossible}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
