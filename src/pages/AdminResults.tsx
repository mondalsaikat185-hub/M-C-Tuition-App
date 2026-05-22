import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, orderBy, where, deleteDoc, doc, writeBatch, limit } from 'firebase/firestore';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { PageHeader } from './Pages';
import { Loader2, Trash2, Search } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { cachedGetDocs } from '../lib/cache';

export function AdminResults() {
  const { examId } = useParams();
  const [results, setResults] = useState<any[]>([]);
  const [batches, setBatches] = useState<any[]>([]);
  const [activeBatchId, setActiveBatchId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showConfirm, setShowConfirm] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [examFilter, setExamFilter] = useState('');
  const [tab, setTab] = useState<'latest' | 'student' | 'exam'>('latest');
  const [refreshKey, setRefreshKey] = useState(0);

  // Maintain user cache outside useEffect so the second one can use it
  const userDictRef = useRef<Record<string, any>>({});

  useEffect(() => {
    const init = async () => {
      try {
        const bSnap = await cachedGetDocs(query(collection(db, 'batches')), 'all_batches');
        const bData: any[] = [];
        bSnap.forEach(d => bData.push({ id: d.id, ...d.data() }));
        setBatches(bData);
        if (!examId && bData.length > 0 && !activeBatchId) {
           setActiveBatchId(bData[0].id);
        }
      } catch (error) {
        console.error("fetchBatches error:", error);
      }

      try {
        setLoading(true);
        let q;
        if (examId) {
           q = query(collection(db, 'results'), where('examId', '==', examId));
        } else {
           q = query(collection(db, 'results'), orderBy('createdAt', 'desc'), limit(100)); // Limit to 100 recent results by default to save quota
        }
        
        const qSnap = await cachedGetDocs(q, examId ? `results_${examId}` : `results_recent_100`);
        const data: any[] = [];
          
        qSnap.forEach(d => {
           const dData = d.data() as any;
           data.push({ id: d.id, ...dData });
        });

        // Lazily fetch missing users to prevent massive quota usage
        const uniqueUserIds = Array.from(new Set(data.map(r => r.studentId).filter(id => !userDictRef.current[id])));
        uniqueUserIds.sort(); // Sort to ensure stable chunk cache keys
        try {
           for (let i = 0; i < uniqueUserIds.length; i += 30) {
               const chunk = uniqueUserIds.slice(i, i + 30);
               const uQuery = query(collection(db, 'users'), where('__name__', 'in', chunk));
               chunk.sort();
               const uSnap = await cachedGetDocs(uQuery, `users_chunk_${chunk.join('_')}`);
               uSnap.forEach(d => {
                   userDictRef.current[d.id] = {
                       name: d.data().fullName || d.data().displayName || d.data().email || 'Unknown',
                       batchId: d.data().batchId
                   };
               });
           }
        } catch(err) {
           console.error("Error fetching chunked users", err);
        }

        // Match students using userDictRef
        data.forEach(r => {
           const cachedUser = userDictRef.current[r.studentId] || {};
           r.studentName = r.studentName || cachedUser.name || 'Unknown Student';
           r.studentBatchId = r.studentBatchId || cachedUser.batchId || null;
           r.formattedDate = r.createdAt?.toDate().toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric'
           }) || 'Unknown Date';
        });

        setResults(data);
        setLoading(false);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'results');
        setLoading(false);
      }
    };

    init();
  }, [examId, refreshKey]);

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(displayResults.map(r => r.id)));
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
      const idsArray = Array.from(selectedIds) as string[];

      // Delete in chunks of 490 to avoid 500 limit
      for (let i = 0; i < idsArray.length; i += 490) {
        const chunk = idsArray.slice(i, i + 490);
        const batchOp = writeBatch(db);
        chunk.forEach(id => batchOp.delete(doc(db, 'results', id)));
        await batchOp.commit();
      }
      
      setResults(results.filter(r => !selectedIds.has(r.id)));
      setSelectedIds(new Set());
      alert("Results deleted successfully.");
    } catch (error: any) {
      handleFirestoreError(error, OperationType.DELETE, 'results');
    } finally {
      setDeleting(false);
    }
  };

  let displayResults = [...results];
  let uniqueExams: string[] = [];

  if (!examId) {
     displayResults = displayResults.filter(r => r.studentBatchId === activeBatchId);
     
     uniqueExams = Array.from(new Set(displayResults.map(r => r.examTitle).filter(d => Boolean(d))));
     
     if (searchQuery) {
       displayResults = displayResults.filter(r => 
         (r.studentName || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
         (r.examTitle || '').toLowerCase().includes(searchQuery.toLowerCase())
       );
     }
     
     if (examFilter) {
       displayResults = displayResults.filter(r => r.examTitle === examFilter);
     }
  } else {
     if (tab === 'student') {
        displayResults.sort((a,b) => (a.studentName || '').localeCompare(b.studentName || ''));
     } else if (tab === 'exam') {
        displayResults.sort((a,b) => (a.examTitle || '').localeCompare(b.examTitle || ''));
     }
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <div className="flex justify-between items-center mb-4">
        <PageHeader title="Exam Results" backTo={examId ? "/admin/library" : "/admin"} />
        <button 
           onClick={() => setRefreshKey(k => k + 1)} 
           disabled={loading}
           className="bg-black dark:bg-white text-white dark:text-black font-bold uppercase text-xs px-4 py-2 border-2 border-transparent hover:-translate-y-0.5 transition-transform disabled:opacity-50"
        >
           {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
      
      {!examId && batches.length > 0 && (
        <div className="mb-6 border-4 border-black bg-white dark:bg-zinc-900 shadow-[6px_6px_0px_0px_rgba(24,24,27,1)] dark:shadow-[6px_6px_0px_0px_rgba(244,244,245,1)] flex flex-col">
          <div className="flex overflow-x-auto border-b-4 border-black scrollbar-hide">
            {batches.map(batch => (
                <button
                key={batch.id}
                onClick={() => {
                   setActiveBatchId(batch.id);
                   setSearchQuery('');
                   setExamFilter('');
                }}
                className={`px-4 py-3 font-bold text-sm uppercase whitespace-nowrap border-r-4 border-black transition-colors ${
                  activeBatchId === batch.id 
                    ? 'bg-yellow-300 text-black' 
                    : 'bg-zinc-100 dark:bg-zinc-900 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-800'
                }`}
              >
                {batch.name}
              </button>
            ))}
          </div>
          
          <div className="p-4 flex flex-col sm:flex-row gap-4">
             <div className="flex-1">
               <label className="block text-xs font-bold uppercase mb-1">Search Student Name</label>
               <div className="relative">
                 <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                 <input
                   type="text"
                   placeholder="Search..."
                   value={searchQuery}
                   onChange={(e) => setSearchQuery(e.target.value)}
                   className="w-full border-2 border-zinc-900 dark:border-zinc-100 pl-10 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
                 />
               </div>
             </div>
             <div className="flex-1">
               <label className="block text-xs font-bold uppercase mb-1">Filter by Exam Title</label>
               <select
                 value={examFilter}
                 onChange={(e) => setExamFilter(e.target.value)}
                 className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 text-sm focus:outline-none"
               >
                 <option value="">All Exams</option>
                 {uniqueExams.map(d => (
                   <option key={d} value={d}>{d}</option>
                 ))}
               </select>
             </div>
          </div>
        </div>
      )}

      <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 sm:p-6 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)] w-full overflow-x-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
           <h3 className="font-black uppercase text-xl">Score Board {examId ? '(Specific Exam)' : ''}</h3>
           
           {!!examId && (
             <div className="flex bg-zinc-200 dark:bg-zinc-800 p-1">
                <button onClick={() => setTab('latest')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${tab === 'latest' ? 'bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]' : 'opacity-70 hover:opacity-100'}`}>Latest</button>
                <button onClick={() => setTab('student')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${tab === 'student' ? 'bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]' : 'opacity-70 hover:opacity-100'}`}>By Student</button>
                <button onClick={() => setTab('exam')} className={`px-4 py-1.5 text-xs font-bold uppercase transition-colors ${tab === 'exam' ? 'bg-white dark:bg-zinc-900 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]' : 'opacity-70 hover:opacity-100'}`}>By Exam</button>
             </div>
           )}
           
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
          <div className="text-zinc-500 font-bold p-4 border-2 border-dashed border-zinc-300 dark:border-zinc-700">No results found for this selection.</div>
        ) : (
          <div className="min-w-[600px]">
             <table className="w-full text-left border-collapse">
               <thead>
                 <tr className="border-b-2 border-zinc-900 dark:border-zinc-100">
                   <th className="p-2 w-10">
                     <input 
                       type="checkbox" 
                       checked={selectedIds.size === displayResults.length && displayResults.length > 0} 
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
                     <td className="p-2 font-bold text-sm">{r.studentName}</td>
                     <td className="p-2 text-sm text-zinc-600 dark:text-zinc-400">{r.examTitle}</td>
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
