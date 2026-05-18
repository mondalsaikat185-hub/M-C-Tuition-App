import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, doc, setDoc, deleteDoc, serverTimestamp, writeBatch, where, addDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { createExamSession, endExamSession } from '../lib/exam-session-utils';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { PageHeader } from './Pages';
import { Loader2, Plus, Eye, Share2, Trash2, FileText, FileDown, BookOpen, Folder, FolderPlus, ChevronRight, Pencil } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { UnifiedQuizPlayer } from '../components/quiz/UnifiedQuizPlayer';

import { encryptPDF } from '@pdfsmaller/pdf-encrypt';

export interface LibraryItem {
  id: string;
  title: string;
  isFolder?: boolean;
  parentId?: string | null;
  type?: "folder" | "exam" | "note" | "pdf";
  examType?: string;
  contentUrl?: string; // Note/PDF URL
  quizData?: string; // JSON
  fileName?: string;
  trackingId?: string;
  timeLimit?: number;
  marksCorrect?: number;
  marksWrong?: number;
  createdAt?: any;
  isChunked?: boolean;
  chunkCount?: number;
}

export function AdminLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [batches, setBatches] = useState<{id: string, name: string}[]>([]);
  const [assignments, setAssignments] = useState<{id: string, libraryItemId: string, batchId: string}[]>([]);
  const [loading, setLoading] = useState(true);

  // ExamSession
  const sessionUnsubscribeRef = useRef<(() => void) | null>(null);
  const [sessionRequireCode, setSessionRequireCode] = useState(true);
  const [isSessionMinimized, setIsSessionMinimized] = useState(false);
  const [activeSession, setActiveSession] = useState<{
    sessionId: string;
    accessCode: string;
    examId: string;
    examTitle: string;
    participantUids: string[];
    codeEnabled: boolean;
  } | null>(null);

  const [activeSessionsList, setActiveSessionsList] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'examSessions'),
      where('isActive', '==', true)
    );
    const unsub = onSnapshot(q, snap => {
      setActiveSessionsList(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    return () => {
      if (sessionUnsubscribeRef.current) {
        sessionUnsubscribeRef.current();
      }
    };
  }, []);
  const [sessionBatchPickerItem, setSessionBatchPickerItem] = useState<LibraryItem | null>(null);

  // Navigation and Folders
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  
  // Modals
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LibraryItem | null>(null);
  const [previewItem, setPreviewItem] = useState<LibraryItem | null>(null);

  // Upload Form
  const [itemType, setItemType] = useState<"exam" | "note">("exam");
  const [title, setTitle] = useState('');
  const [trackingId, setTrackingId] = useState('');
  
  // Exam extra
  const [examType, setExamType] = useState('Bilingual MCQ');
  const [quizData, setQuizData] = useState('');
  const [timeLimit, setTimeLimit] = useState(30);
  const [marksCorrect, setMarksCorrect] = useState(1);
  const [marksWrong, setMarksWrong] = useState(0.25);
  const [allowMultipleAttempts, setAllowMultipleAttempts] = useState(false);
  // Note extra
  const [linkUrl, setLinkUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [pdfPassword, setPdfPassword] = useState('');
  
  const [submitting, setSubmitting] = useState(false);
  const [folderName, setFolderName] = useState('');
  
  const [editItemId, setEditItemId] = useState<string | null>(null);
  const [editItemTitle, setEditItemTitle] = useState('');
  const [autoExtractMsg, setAutoExtractMsg] = useState('');

  useEffect(() => {
    fetchLibrary();
    fetchBatches();
    fetchAssignments();
  }, []);

  const fetchLibrary = async () => {
    try {
      setLoading(true);
      const q = query(collection(db, 'library'));
      const snap = await getDocs(q);
      const data: LibraryItem[] = [];
      snap.forEach(d => data.push({ id: d.id, ...d.data() } as LibraryItem));
      data.sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));
      setItems(data);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'library');
    } finally {
      setLoading(false);
    }
  };

  const fetchBatches = async () => {
    try {
      const q = query(collection(db, 'batches'));
      const snap = await getDocs(q);
      const data: any[] = [];
      snap.forEach(d => data.push({ id: d.id, name: d.data().name }));
      setBatches(data);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'batches');
    }
  };

  const fetchAssignments = async () => {
      try {
        const q = query(collection(db, 'batchAssignments'));
        const snap = await getDocs(q);
        const data: any[] = [];
        snap.forEach(d => data.push({ id: d.id, ...d.data() }));
        setAssignments(data);
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'batchAssignments');
      }
  };

  const handleFileExtraction = (e: React.ChangeEvent<HTMLInputElement>) => {
     const uploadFile = e.target.files?.[0];
     if (!uploadFile) return;

     if (itemType === 'note') {
        setFile(uploadFile);
        return;
     }

     // If it's an exam, try auto-extraction
     setAutoExtractMsg('Extracting...');
     const reader = new FileReader();
     reader.onload = (evo) => {
        const text = evo.target?.result as string;
        try {
          const patterns = [
            /(?:const|let|var)\s+questions\s*=\s*(\[[\s\S]*?\]);/,
            /(?:const|let|var)\s+quizData\s*=\s*(\{[\s\S]*?\});/,
            /(?:const|let|var)\s+examData\s*=\s*(\[[\s\S]*?\]);/,
            /(?:const|let|var)\s+data\s*=\s*(\[[\s\S]*?\]);/,
          ];
          
          let questionsJson = null;
          for (const pattern of patterns) {
            const match = text.match(pattern);
            if (match) {
              try {
                questionsJson = JSON.parse(match[1]);
                break;
              } catch { continue; }
            }
          }
          
          if (!questionsJson && uploadFile.name.endsWith('.html')) {
            const scriptMatch = text.match(/<script[^>]*>([\s\S]*?)<\/script>/gi);
            if (scriptMatch) {
              for (const scriptBlock of scriptMatch) {
                const inner = scriptBlock.replace(/<\/?script[^>]*>/gi, '');
                for (const pattern of patterns) {
                  const match = inner.match(pattern);
                  if (match) {
                    try { questionsJson = JSON.parse(match[1]); break; } catch { continue; }
                  }
                }
                if (questionsJson) break;
              }
            }
          }
          
          // Extract config if present
          const configPatterns = [
            /totalTime\s*[=:]\s*(\d+)/,
            /marksCorrect\s*[=:]\s*([\d.]+)/,
            /marksWrong\s*[=:]\s*(-?[\d.]+)/,
            /timeLimit\s*[=:]\s*(\d+)/,
          ];
          
          let extTotalTime = '';
          let extMarksCorrect = '';
          let extMarksWrong = '';
          
          const totalTimeMatch = text.match(configPatterns[0]);
          if (totalTimeMatch) extTotalTime = totalTimeMatch[1];
          const marksCorrectMatch = text.match(configPatterns[1]);
          if (marksCorrectMatch) extMarksCorrect = marksCorrectMatch[1];
          const marksWrongMatch = text.match(configPatterns[2]);
          if (marksWrongMatch) extMarksWrong = marksWrongMatch[1];

          if (extTotalTime) setTimeLimit(parseInt(extTotalTime));
          if (extMarksCorrect) setMarksCorrect(parseFloat(extMarksCorrect));
          if (extMarksWrong) setMarksWrong(parseFloat(extMarksWrong));

          if (questionsJson) {
            if (Array.isArray(questionsJson)) {
               setQuizData(JSON.stringify(questionsJson, null, 2));
               setAutoExtractMsg(`Successfully extracted ${questionsJson.length} questions!`);
            } else if (questionsJson && (questionsJson as any).questions) {
               setQuizData(JSON.stringify(questionsJson, null, 2));
               setAutoExtractMsg(`Successfully extracted quizData config and ${(questionsJson as any).questions.length} questions!`);
            }
          } else {
             // fallback to function eval
             const fn = new Function(`
               const dummyNode = new Proxy({}, {
                 get: (target, prop) => {
                    if (prop === 'addEventListener') return () => {};
                    if (typeof prop === 'string' && prop.match(/^[A-Z]/)) return function(){}; // dummy constructors
                    return dummyNode;
                 },
                 set: () => true
               });
               var window = dummyNode;
               var document = dummyNode;
               try {
                 ${text}
               } catch(e) {}
               if (typeof questions !== "undefined") return questions;
               if (typeof quizData !== "undefined") return quizData;
               if (typeof examData !== "undefined") return examData;
               if (typeof data !== "undefined") return data;
               return null;
            `);
            const val = fn();
            if (val && Array.isArray(val)) {
                setQuizData(JSON.stringify(val, null, 2));
                setAutoExtractMsg('Successfully extracted ' + val.length + ' questions via function eval!');
            } else if (val && val.questions) {
                setQuizData(JSON.stringify(val, null, 2));
                setAutoExtractMsg('Successfully extracted quizData config and ' + val.questions.length + ' questions via function eval!');
            } else {
                setAutoExtractMsg('Could not find a variable named "questions", "quizData", or "examData" in the file.');
            }
          }
        } catch (err: any) {
           setAutoExtractMsg('Extraction failed: ' + err.message + '. You may need to paste the JSON manually.');
        }
     };
     reader.readAsText(uploadFile);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!folderName.trim()) return;
     try {
       setSubmitting(true);
       await addDoc(collection(db, 'library'), {
          title: folderName.trim(),
          isFolder: true,
          type: 'folder',
          parentId: currentFolderId || null,
          createdAt: serverTimestamp(),
          createdBy: user?.uid,
          isActive: true
       });
       setIsFolderModalOpen(false);
       setFolderName('');
       fetchLibrary();
     } catch (err: any) {
       alert("Operation failed: " + (err.message || String(err)));
       handleFirestoreError(err, OperationType.CREATE, 'library');
     } finally {
       setSubmitting(false);
     }
  };

  const handleLinkUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
     let val = e.target.value;
     
     // Auto convert standard Google Drive link to direct download link
     const driveRegex = /\/file\/d\/([a-zA-Z0-9_-]+)/;
     const idRegex = /[?&]id=([a-zA-Z0-9_-]+)/;
     
     let fileId = null;
     if (driveRegex.test(val)) {
        fileId = val.match(driveRegex)?.[1];
     } else if (idRegex.test(val)) {
        fileId = val.match(idRegex)?.[1];
     }
     
     if (fileId) {
         val = `https://drive.google.com/uc?export=download&id=${fileId}`;
     }
     
     setLinkUrl(val);
  };

  const handleUploadSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     try {
        setSubmitting(true);

        if (itemType === 'note' && !file && !linkUrl.trim()) {
           alert("Please provide a valid document or a link.");
           setSubmitting(false);
           return;
        } else if (itemType === 'exam' && !quizData) {
           alert("Please paste the Quiz JSON or upload a file containing the questions array.");
           setSubmitting(false);
           return;
        }

        const payload: any = {
           title,
           type: itemType,
           parentId: currentFolderId || null,
           trackingId: trackingId || `TRK-${Math.floor(Math.random()*10000)}`,
           createdAt: serverTimestamp(),
           createdBy: user?.uid,
           isActive: true
        };

        if (itemType === 'exam') {
           payload.examType = examType;
           payload.quizData = quizData;
           payload.timeLimit = timeLimit;
           payload.marksCorrect = marksCorrect;
           payload.marksWrong = marksWrong;
           payload.allowMultipleAttempts = allowMultipleAttempts;
           await addDoc(collection(db, 'library'), payload);
           setIsUploadModalOpen(false);
           resetForm();
           fetchLibrary();
           setSubmitting(false);
           return;
        }

        // Note chunking for PDFs
        if (itemType === 'note' && file) {
           payload.fileName = file.name;
           
           const reader = new FileReader();
           reader.onload = async (event) => {
              try {
                let finalBytesStr = (event.target?.result as string).split(',')[1];
                if (pdfPassword.trim()) {
                     const byteCharacters = atob(finalBytesStr);
                     const byteNumbers = new Array(byteCharacters.length);
                     for (let i = 0; i < byteCharacters.length; i++) {
                        byteNumbers[i] = byteCharacters.charCodeAt(i);
                     }
                     const byteArray = new Uint8Array(byteNumbers);
                     const encryptedBytes = await encryptPDF(byteArray, pdfPassword.trim());
                     let binary = '';
                     for (let i = 0; i < encryptedBytes.byteLength; i++) {
                         binary += String.fromCharCode(encryptedBytes[i]);
                     }
                     finalBytesStr = btoa(binary);
                     payload.isPasswordProtected = true;
                }
                const base64String = finalBytesStr;
                const chunkSize = 800000; // ~800KB chunk
                const numChunks = Math.ceil(base64String.length / chunkSize);
                
                payload.isChunked = true;
                payload.chunkCount = numChunks;
                
                const docRef = await addDoc(collection(db, 'library'), payload);
                
                // Write chunks
                for (let i = 0; i < numChunks; i++) {
                   const chunkData = base64String.substring(i * chunkSize, (i + 1) * chunkSize);
                   await setDoc(doc(db, 'libraryChunks', `${docRef.id}_${i}`), {
                      libraryId: docRef.id,
                      chunkIndex: i,
                      data: chunkData
                   });
                }
                
                setIsUploadModalOpen(false);
                resetForm();
                fetchLibrary();
                setSubmitting(false);
              } catch (err: any) {
                 alert("Upload failed: " + (err.message || String(err)));
                 handleFirestoreError(err, OperationType.CREATE, 'libraryChunks');
                 setSubmitting(false);
              }
           };
           reader.onerror = () => {
              alert("Failed to read file");
              setSubmitting(false);
           }
           reader.readAsDataURL(file);
        } else if (itemType === 'note' && linkUrl.trim()) {
           payload.contentUrl = linkUrl.trim();
           await addDoc(collection(db, 'library'), payload);
           setIsUploadModalOpen(false);
           resetForm();
           fetchLibrary();
           setSubmitting(false);
        }

     } catch (err: any) {
        alert("Operation failed: " + (err.message || String(err)));
        handleFirestoreError(err, OperationType.CREATE, 'library');
        setSubmitting(false);
     }
  };

  const resetForm = () => {
     setTitle('');
     setTrackingId('');
     setQuizData('');
     setLinkUrl('');
     setFile(null);
     setPdfPassword('');
     setAutoExtractMsg('');
  };

  const getItemsToDelete = (itemId: string, allItems: LibraryItem[]): string[] => {
     let ids = [itemId];
     const children = allItems.filter(i => i.parentId === itemId);
     for (const child of children) {
        ids = [...ids, ...getItemsToDelete(child.id, allItems)];
     }
     return ids;
  };

  const [deleteItemId, setDeleteItemId] = useState<string | null>(null);

  const handleDelete = async (id: string) => {
     try {
       setSubmitting(true);
       
       const idsToDelete = getItemsToDelete(id, items);
       
       let currentBatch = writeBatch(db);
       let opCount = 0;
       
       const commitBatch = async () => {
          if (opCount > 0) {
             await currentBatch.commit();
             currentBatch = writeBatch(db);
             opCount = 0;
          }
       };

       for (const delId of idsToDelete) {
           const assigns = assignments.filter(a => a.libraryItemId === delId);
           for (const a of assigns) {
              currentBatch.delete(doc(db, 'batchAssignments', a.id));
              opCount++;
              if (opCount >= 490) await commitBatch();
           }
           
           // Cleanup chunks if it's chunked
           const itemToDelete = items.find(i => i.id === delId);
           if (itemToDelete?.isChunked && itemToDelete?.chunkCount) {
              for (let i = 0; i < itemToDelete.chunkCount; i++) {
                 currentBatch.delete(doc(db, 'libraryChunks', `${delId}_${i}`));
                 opCount++;
                 if (opCount >= 490) await commitBatch();
              }
           }

           currentBatch.delete(doc(db, 'library', delId));
           opCount++;
           if (opCount >= 490) await commitBatch();
       }
       await commitBatch();
       
       fetchLibrary();
       fetchAssignments();
       setDeleteItemId(null);
     } catch (err: any) {
       console.error(err);
       alert("Error deleting: " + String(err.message || err));
     } finally {
       setSubmitting(false);
     }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!editItemId || !editItemTitle.trim()) return;
     try {
        setSubmitting(true);
        await setDoc(doc(db, 'library', editItemId), { title: editItemTitle.trim() }, { merge: true });
        setEditItemId(null);
        setEditItemTitle('');
        fetchLibrary();
     } catch (err: any) {
        alert("Error updating: " + String(err.message || err));
     } finally {
        setSubmitting(false);
     }
  };


  // Share logic
  const [currentSharedBatchIds, setCurrentSharedBatchIds] = useState<string[]>([]);
  
  const openShareModal = (item: LibraryItem) => {
     setSelectedItem(item);
     const alreadyAssigned = assignments.filter(a => a.libraryItemId === item.id).map(a => a.batchId);
     setCurrentSharedBatchIds(alreadyAssigned);
     setIsShareModalOpen(true);
  };

  const toggleBatchShare = (batchId: string) => {
     setCurrentSharedBatchIds(p => 
        p.includes(batchId) ? p.filter(x => x !== batchId) : [...p, batchId]
     );
  };

  const handleSaveShare = async () => {
     if (!selectedItem) return;
     try {
        setSubmitting(true);
        const previouslyAssigned = assignments.filter(a => a.libraryItemId === selectedItem.id);
        
        const batchFn = writeBatch(db);
        
        // Remove ones that are no longer selected
        for (const a of previouslyAssigned) {
           if (!currentSharedBatchIds.includes(a.batchId)) {
              batchFn.delete(doc(db, 'batchAssignments', a.id));
           }
        }
        
        // Add new ones
        const existingBatchIds = previouslyAssigned.map(a => a.batchId);
        for (const bId of currentSharedBatchIds) {
           if (!existingBatchIds.includes(bId)) {
              const newRef = doc(collection(db, 'batchAssignments'));
              batchFn.set(newRef, {
                 libraryItemId: selectedItem.id,
                 batchId: bId,
                 assignedAt: serverTimestamp(),
                 assignedBy: user?.uid
              });
           }
        }

        await batchFn.commit();
        setIsShareModalOpen(false);
        fetchAssignments();
     } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'batchAssignments');
     } finally {
        setSubmitting(false);
     }
  };

  if (previewItem) {
     return <UnifiedQuizPlayer exam={previewItem as any} onBack={() => setPreviewItem(null)} />;
  }

  const getBreadcrumbs = () => {
     const crumbs: {id: string, title: string}[] = [];
     let curr = currentFolderId;
     while (curr) {
        const folder = items.find(i => i.id === curr);
        if (folder) {
           crumbs.unshift({ id: folder.id, title: folder.title });
           curr = folder.parentId || null;
        } else {
           break;
        }
     }
     return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();
  const currentItems = items.filter(i => (i.parentId || null) === currentFolderId);
  const folders = currentItems.filter(i => i.isFolder).sort((a,b) => a.title.localeCompare(b.title));
  const files = currentItems.filter(i => !i.isFolder).sort((a,b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0));

  const toggleMultipleAttempts = async (item: LibraryItem) => {
     try {
        setSubmitting(true);
        await updateDoc(doc(db, 'library', item.id), { allowMultipleAttempts: !(item as any).allowMultipleAttempts });
        fetchLibrary();
     } catch (err) {
        alert("Toggle failed: " + String(err));
     } finally {
        setSubmitting(false);
     }
  };

  const handleStartSession = async (batchId: string) => {
    if (!user || !sessionBatchPickerItem) return;
    try {
      const { sessionId, accessCode } = await createExamSession(
        sessionBatchPickerItem.id,
        batchId,
        user.uid,
        sessionRequireCode
      );
      setActiveSession({
        sessionId,
        accessCode,
        examId: sessionBatchPickerItem.id,
        examTitle: sessionBatchPickerItem.title,
        participantUids: [],
        codeEnabled: sessionRequireCode,
      });
      setIsSessionMinimized(false);
      setSessionBatchPickerItem(null);
      setSessionRequireCode(true); // reset for next time
      
      const unsubscribe = onSnapshot(doc(db, 'examSessions', sessionId), (snap) => {
        if (snap.exists()) {
          setActiveSession((prev) =>
            prev ? { 
              ...prev, 
              participantUids: snap.data().participantUids || [],
              codeEnabled: snap.data().codeEnabled ?? true
            } : null
          );
        }
      });
      sessionUnsubscribeRef.current = unsubscribe;
    } catch (err) {
      console.error('Failed to start session:', err);
    }
  };

  const handleEndSession = async () => {
    if (!activeSession) return;
    await endExamSession(activeSession.sessionId);
    setActiveSession(null);
    if (sessionUnsubscribeRef.current) {
      sessionUnsubscribeRef.current();
      sessionUnsubscribeRef.current = null;
    }
  };

  const handleToggleCode = async () => {
    if (!activeSession) return;
    try {
      await updateDoc(doc(db, 'examSessions', activeSession.sessionId), {
        codeEnabled: !activeSession.codeEnabled
      });
    } catch (err) {
      console.error('Failed to toggle code:', err);
    }
  };

  const handleBackNavigation = () => {
     if (currentFolderId) {
        const folder = items.find(i => i.id === currentFolderId);
        setCurrentFolderId(folder?.parentId || null);
     }
  };

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      <PageHeader 
         title="Central Library" 
         backTo="/admin" 
         onBack={currentFolderId ? handleBackNavigation : undefined} 
      />
      
      {!activeSession && activeSessionsList.length > 0 && (
        <div className="mb-6 p-4 bg-yellow-100 border-2 border-yellow-500 text-yellow-900 font-bold text-sm shadow-[4px_4px_0px_0px_rgba(234,179,8,1)] flex items-center justify-between">
           <div>
              <span className="mr-2">⚡</span>
              {activeSessionsList.length} টি Live Exam Session চলছে!
           </div>
           <div className="flex gap-2">
             {activeSessionsList.map(s => {
               const b = batches.find(bx => bx.id === s.batchId);
               return (
                 <button 
                   key={s.id}
                   onClick={() => {
                      const ex = items.find(i => i.id === s.examId);
                      setActiveSession({
                        sessionId: s.id,
                        accessCode: s.accessCode,
                        examId: s.examId,
                        examTitle: ex?.title || 'Unknown Exam',
                        participantUids: s.participantUids || [],
                        codeEnabled: s.codeEnabled ?? true
                      });
                      setIsSessionMinimized(false);
                      
                      const unsubscribe = onSnapshot(doc(db, 'examSessions', s.id), (snap) => {
                        if (snap.exists()) {
                          setActiveSession((prev) =>
                            prev ? { 
                              ...prev, 
                              participantUids: snap.data().participantUids || [],
                              codeEnabled: snap.data().codeEnabled ?? true
                            } : null
                          );
                        }
                      });
                      sessionUnsubscribeRef.current = unsubscribe;
                   }}
                   className="px-3 py-1 bg-yellow-500 text-black border border-black hover:bg-yellow-400 text-xs shadow-[2px_2px_0px_0px_black] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all"
                 >
                   🎛️ Control Panel: {b?.name || s.batchId}
                 </button>
               )
             })}
           </div>
        </div>
      )}

      <div className="flex gap-2 items-center mb-6 overflow-x-auto text-sm font-bold pb-2 text-zinc-600 dark:text-zinc-400">
         <button onClick={() => setCurrentFolderId(null)} className="hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 shrink-0">
            <Folder className="w-4 h-4"/> Home
         </button>
         {breadcrumbs.map(bc => (
             <React.Fragment key={bc.id}>
                <ChevronRight className="w-4 h-4 shrink-0" />
                <button onClick={() => setCurrentFolderId(bc.id)} className="hover:text-zinc-900 dark:hover:text-zinc-100 shrink-0">
                   {bc.title}
                </button>
             </React.Fragment>
         ))}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <h3 className="font-black text-xl md:text-2xl uppercase">
           {currentFolderId ? items.find(i => i.id === currentFolderId)?.title : 'Library Root'}
        </h3>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
             onClick={() => setIsFolderModalOpen(true)}
             className="flex-1 sm:flex-none justify-center bg-zinc-100 text-zinc-900 border-2 border-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 dark:border-zinc-100 font-bold px-4 py-2 uppercase text-xs shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] hover:-translate-y-0.5 transition-transform flex items-center gap-2"
          >
            <FolderPlus className="w-4 h-4" /> New Folder
          </button>
          <button 
             onClick={() => setIsUploadModalOpen(true)}
             className="flex-1 sm:flex-none justify-center bg-zinc-900 border-2 border-zinc-900 dark:bg-zinc-100 dark:text-zinc-900 dark:border-zinc-100 text-white font-bold px-4 py-2 uppercase text-xs shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] hover:-translate-y-0.5 transition-transform flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Upload
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 mb-8 gap-4">
        {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
        ) : folders.length === 0 && files.length === 0 ? (
            <div className="p-8 text-center text-zinc-500 font-bold border-2 border-dashed border-zinc-300 dark:border-zinc-700">This folder is empty. Create a subfolder or upload items!</div>
        ) : (
            <>
               {folders.map(folder => (
                  <div key={folder.id} className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors" onClick={(e) => {
                     // don't navigate if clicking delete
                     if ((e.target as HTMLElement).closest('.action-btn')) return;
                     setCurrentFolderId(folder.id);
                  }}>
                     <div className="flex items-center gap-3 w-full">
                        <Folder className="w-6 h-6 text-blue-500 shrink-0" fill="currentColor" />
                        <h4 className="font-black text-lg truncate flex-1">{folder.title}</h4>
                     </div>
                     <div className="flex flex-wrap items-center gap-2">
                       <button onClick={() => openShareModal(folder)} className="action-btn flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 px-3 py-1.5 font-bold text-xs hover:bg-emerald-200 whitespace-nowrap">
                         <Share2 className="w-3.5 h-3.5" /> Share
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); setEditItemId(folder.id); setEditItemTitle(folder.title); }} className="action-btn flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900 px-3 py-1.5 font-bold text-xs hover:bg-blue-100 whitespace-nowrap">
                         <Pencil className="w-3.5 h-3.5" /> Edit
                       </button>
                       <button onClick={(e) => { e.stopPropagation(); setDeleteItemId(folder.id); }} disabled={submitting} className="action-btn flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900 px-3 py-1.5 font-bold text-xs hover:bg-red-100 ms-auto sm:ms-0">
                         {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} 
                       </button>
                     </div>
                  </div>
               ))}
               
               {files.map(item => (
            <div key={item.id} className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
               <div>
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <h4 className="font-black text-lg">{item.title}</h4>
                    <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 rounded-full font-bold uppercase">
                      {item.type === 'exam' ? item.examType : 'PDF Note'}
                    </span>
                    {item.isChunked && (
                       <span className="text-[10px] bg-red-600 text-white px-2 py-0.5 rounded border border-red-800 font-bold uppercase">
                         WARNING: FILE EXHAUSTS QUOTA - PLEASE DELETE OR RE-UPLOAD AS GOOGLE DRIVE LINK
                       </span>
                    )}
                    {(item as any).isPasswordProtected && (
                       <span className="text-[10px] bg-red-100 text-red-800 px-2 py-0.5 rounded-full font-bold uppercase ml-2 border border-red-200">
                         Password Protected
                       </span>
                    )}
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 font-mono font-bold">
                     Tracking ID: {item.trackingId || 'N/A'}
                  </div>
                  {item.type === 'exam' && (
                     <label className="flex items-center gap-2 cursor-pointer font-bold text-xs mt-2 text-zinc-600 dark:text-zinc-300">
                       <input type="checkbox" checked={!!(item as any).allowMultipleAttempts} onChange={() => toggleMultipleAttempts(item)} disabled={submitting} className="w-3.5 h-3.5 accent-zinc-900 dark:accent-zinc-100" />
                       Allow Multiple Attempts
                     </label>
                  )}
                  <div className="text-xs text-blue-600 dark:text-blue-400 font-bold mt-1">
                     Shared with {assignments.filter(a => a.libraryItemId === item.id).length} batches
                  </div>
               </div>
               
               <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
                 {item.type === 'note' && item.contentUrl && (
                     <a href={item.contentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap">
                       <Eye className="w-3.5 h-3.5" /> Preview
                     </a>
                 )}
                 {item.type === 'exam' && (
                    <>
                     <button onClick={() => setPreviewItem(item)} className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 border border-zinc-300 dark:border-zinc-700 font-bold text-xs hover:bg-zinc-200 dark:hover:bg-zinc-700 whitespace-nowrap">
                       <Eye className="w-3.5 h-3.5" /> Preview
                     </button>
                     <a href={`/admin/results/${item.id}`} className="flex items-center gap-1 bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800 px-3 py-1.5 font-bold text-xs hover:bg-blue-200 whitespace-nowrap">
                       <FileText className="w-3.5 h-3.5" /> Results
                     </a>
                     <button
                       onClick={() => setSessionBatchPickerItem(item)}
                       className="flex items-center gap-1 bg-green-400 border border-black font-bold text-xs px-3 py-1.5 shadow-[2px_2px_0px_black] hover:shadow-none hover:translate-x-[2px] hover:translate-y-[2px] transition-all whitespace-nowrap text-black"
                       title="Start Exam Session"
                     >
                       ▶ Start Session
                     </button>
                    </>
                 )}
                 <button onClick={() => openShareModal(item)} className="flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800 px-3 py-1.5 font-bold text-xs hover:bg-emerald-200 whitespace-nowrap">
                   <Share2 className="w-3.5 h-3.5" /> Share
                 </button>
                 <button onClick={() => { setEditItemId(item.id); setEditItemTitle(item.title); }} className="flex items-center gap-1 bg-blue-50 text-blue-600 border border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900 px-3 py-1.5 font-bold text-xs hover:bg-blue-100 whitespace-nowrap">
                   <Pencil className="w-3.5 h-3.5" /> Edit
                 </button>
                 <button onClick={() => setDeleteItemId(item.id)} disabled={submitting} className="flex items-center gap-1 bg-red-50 text-red-600 border border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900 px-3 py-1.5 font-bold text-xs hover:bg-red-100 whitespace-nowrap ms-auto sm:ms-0">
                   {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />} 
                 </button>
               </div>
            </div>
        ))}
        </>
        )}
      </div>

      {editItemId && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 w-full max-w-md p-6 relative">
               <button onClick={() => { setEditItemId(null); setEditItemTitle(''); }} className="absolute top-4 right-4 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white border-2 border-zinc-900 dark:border-zinc-100 font-black px-2.5 py-0.5">X</button>
               <h2 className="text-xl font-black uppercase mb-4">Edit Resource Title</h2>
               
               <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
                 <div>
                    <label className="block text-xs font-bold uppercase mb-1">New Title *</label>
                    <input type="text" value={editItemTitle} onChange={e => setEditItemTitle(e.target.value)} required className="w-full text-sm p-3 bg-white dark:bg-zinc-950 border-2 border-zinc-900 dark:border-zinc-100 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="e.g. History Notes Chapter 1" />
                 </div>
                 <button type="submit" disabled={submitting} className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase py-4 border-2 border-transparent hover:-translate-y-0.5 transition-transform flex justify-center shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] hover:shadow-[6px_6px_0px_0px_rgba(161,161,170,1)]">
                   {submitting ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Save Changes'}
                 </button>
               </form>
            </div>
         </div>
      )}

      {isFolderModalOpen && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 w-full max-w-md p-6 relative">
               <button onClick={() => setIsFolderModalOpen(false)} className="absolute top-4 right-4 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white border-2 border-zinc-900 dark:border-zinc-100 font-black px-2.5 py-0.5">X</button>
               <h2 className="text-xl font-black uppercase mb-4">Create Folder</h2>
               
               <form onSubmit={handleCreateFolder} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Folder Name</label>
                    <input type="text" required value={folderName} onChange={e => setFolderName(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none" placeholder="e.g. GK Notes" />
                  </div>
                  <div className="pt-2 flex justify-end">
                     <button type="submit" disabled={submitting} className="bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 font-black uppercase tracking-wide border-2 border-zinc-900 dark:border-zinc-100 px-6 py-2 shadow-[2px_2px_0px_0px_rgba(161,161,170,1)] hover:-translate-y-0.5 transition-transform flex items-center gap-2 disabled:opacity-50">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Create
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {isUploadModalOpen && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 w-full max-w-lg p-6 flex flex-col max-h-[90vh] overflow-y-auto relative">
               <button onClick={() => setIsUploadModalOpen(false)} className="absolute top-4 right-4 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white border-2 border-zinc-900 dark:border-zinc-100 font-black px-2.5 py-0.5">X</button>
               <h2 className="text-xl font-black uppercase mb-4">Upload to Library</h2>
               
               <form onSubmit={handleUploadSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Title</label>
                    <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none" placeholder="e.g. English Grammar Chapter 1" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Tracking ID (Optional)</label>
                    <input type="text" value={trackingId} onChange={e => setTrackingId(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none placeholder:opacity-50" placeholder="e.g. ENG-GRAM-001" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase mb-1">Material Type</label>
                    <div className="flex gap-4 mt-2">
                       <label className="flex items-center gap-2 cursor-pointer font-bold text-sm">
                         <input type="radio" checked={itemType === 'exam'} onChange={() => setItemType('exam')} className="w-4 h-4 accent-zinc-900 dark:accent-zinc-100" />
                         <FileText className="w-4 h-4" /> Exam / Interactive Quiz
                       </label>
                       <label className="flex items-center gap-2 cursor-pointer font-bold text-sm">
                         <input type="radio" checked={itemType === 'note'} onChange={() => setItemType('note')} className="w-4 h-4 accent-zinc-900 dark:accent-zinc-100" />
                         <FileDown className="w-4 h-4" /> PDF Note
                       </label>
                    </div>
                  </div>

                  {itemType === 'exam' && (
                     <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700 mt-4 space-y-4">
                       <div>
                         <label className="block text-xs font-bold uppercase mb-1 text-zinc-500">Exam Type</label>
                         <select value={examType} onChange={e => setExamType(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-white dark:bg-zinc-900 focus:outline-none">
                            <option value="Bilingual MCQ">Bilingual MCQ (en/bn)</option>
                            <option value="Cloze Test">Cloze Test</option>
                            <option value="Error Correction">Error Correction</option>
                            <option value="Parajumble">Parajumble</option>
                            <option value="Comprehension">Comprehension</option>
                         </select>
                       </div>
                       
                       <div className="grid grid-cols-3 gap-2">
                         <div>
                            <label className="block text-xs font-bold uppercase mb-1">Time (Mins)</label>
                            <input type="number" min="1" value={timeLimit} onChange={e => setTimeLimit(Number(e.target.value))} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent" />
                         </div>
                         <div>
                            <label className="block text-xs font-bold uppercase mb-1">+ Marks</label>
                            <input type="number" step="0.5" value={marksCorrect} onChange={e => setMarksCorrect(Number(e.target.value))} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent" />
                         </div>
                         <div>
                            <label className="block text-xs font-bold uppercase mb-1">- Marks</label>
                            <input type="number" step="0.25" value={marksWrong} onChange={e => setMarksWrong(Number(e.target.value))} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent" />
                         </div>
                       </div>
                       
                       <label className="flex items-center gap-2 cursor-pointer font-bold text-sm bg-zinc-100 dark:bg-zinc-800 p-3 border-2 border-zinc-900 dark:border-zinc-100">
                         <input type="checkbox" checked={allowMultipleAttempts} onChange={e => setAllowMultipleAttempts(e.target.checked)} className="w-5 h-5 accent-zinc-900 dark:accent-zinc-100" />
                         Allow Students to Re-take Exam Multiple Times
                       </label>

                       <div>
                         <label className="block text-xs font-bold uppercase mb-1 text-emerald-600 dark:text-emerald-400">1. Auto-extract via JS/HTML Upload</label>
                         <input type="file" accept=".js,.html" onChange={handleFileExtraction} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:border-2 file:border-zinc-900 dark:file:border-zinc-100 file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-900 dark:file:text-white file:font-bold file:uppercase file:text-xs" />
                         {autoExtractMsg && <div className="text-xs font-bold text-orange-600 mt-2 bg-orange-50 p-2 border border-orange-200">{autoExtractMsg}</div>}
                       </div>

                       <div>
                         <label className="block text-xs font-bold uppercase mb-1 text-blue-600 dark:text-blue-400">2. Or Paste JSON Data</label>
                         <textarea value={quizData} onChange={e => setQuizData(e.target.value)} rows={4} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none font-mono text-xs" placeholder="[ { question_en: '...' } ]"></textarea>
                       </div>
                     </div>
                  )}

                  {itemType === 'note' && (
                     <div className="bg-zinc-50 dark:bg-zinc-800/50 p-4 border border-zinc-200 dark:border-zinc-700 mt-4 space-y-4">
                        <div>
                           <label className="block text-xs font-bold uppercase mb-1">Upload PDF File</label>
                           <p className="text-xs text-zinc-500 mb-2">Note: Up to 5GB free spacing available. Secure viewing will protect this from external downloads.</p>
                           <input type="file" accept="application/pdf" onChange={handleFileExtraction} className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:border-2 file:border-zinc-900 dark:file:border-zinc-100 file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-900 dark:file:text-white file:font-bold file:uppercase file:text-xs" />
                        </div>
                        <div className="flex items-center gap-4">
                           <div className="h-px bg-zinc-300 dark:bg-zinc-700 flex-1"></div>
                           <span className="text-xs font-bold uppercase text-zinc-400">OR</span>
                           <div className="h-px bg-zinc-300 dark:bg-zinc-700 flex-1"></div>
                        </div>
                        <div>
                           <label className="block text-xs font-bold uppercase mb-1">Direct PDF Link</label>
                           <p className="text-xs text-zinc-500 mb-2">You can paste normal Google Drive links here, it will automatically be converted to a direct download link to save database consumption. The link will be opened directly.</p>
                           <input type="url" value={linkUrl} onChange={handleLinkUrlChange} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none" placeholder="https://..." />
                        </div>
                        <div>
                           <label className="block text-xs font-bold uppercase mb-1">PDF Password (Optional)</label>
                           <input type="text" value={pdfPassword} onChange={e => setPdfPassword(e.target.value)} className="w-full border-2 border-zinc-900 dark:border-zinc-100 p-2 bg-transparent focus:outline-none" placeholder="Encrypt PDF with this password" />
                           <p className="text-xs text-zinc-500 mt-1">If provided, the PDF will be encrypted so users must enter this password to view it after downloading.</p>
                        </div>
                     </div>
                  )}

                  <div className="pt-4 flex justify-end">
                     <button type="submit" disabled={submitting} className="bg-zinc-900 dark:bg-zinc-100 text-zinc-100 dark:text-zinc-900 font-black uppercase tracking-wide border-2 border-zinc-900 dark:border-zinc-100 px-6 py-3 shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] hover:-translate-y-0.5 transition-transform flex items-center gap-2 disabled:opacity-50">
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />} Save to Library
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {isShareModalOpen && selectedItem && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 w-full max-w-sm p-6 relative">
               <button onClick={() => setIsShareModalOpen(false)} disabled={submitting} className="absolute top-4 right-4 bg-zinc-100 text-zinc-900 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-white border-2 border-zinc-900 dark:border-zinc-100 font-black px-2.5 py-0.5">X</button>
               <h2 className="text-xl font-black uppercase mb-1 text-emerald-600">Share Item</h2>
               <p className="text-sm font-bold opacity-70 mb-4">{selectedItem.title}</p>
               
               <div className="space-y-2 mb-6 max-h-60 overflow-y-auto border border-zinc-200 dark:border-zinc-800 p-2">
                  {batches.length === 0 ? <div className="text-sm text-center">No batches found</div> : null}
                  {batches.map(b => (
                     <label key={b.id} className="flex items-center gap-3 p-2 bg-zinc-50 dark:bg-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 cursor-pointer border-b border-zinc-200 dark:border-zinc-700 last:border-0 border-2 border-transparent">
                        <input 
                           type="checkbox" 
                           checked={currentSharedBatchIds.includes(b.id)}
                           onChange={() => toggleBatchShare(b.id)}
                           className="w-5 h-5 accent-emerald-600 cursor-pointer"
                        />
                        <span className="font-bold">{b.name}</span>
                     </label>
                  ))}
               </div>

               <div className="flex justify-end gap-2 text-sm font-bold">
                  <button onClick={() => setIsShareModalOpen(false)} disabled={submitting} className="px-4 border-2 border-zinc-900 dark:border-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
                  <button onClick={handleSaveShare} disabled={submitting} className="bg-emerald-500 text-white border-2 border-zinc-900 px-4 py-2 hover:bg-emerald-600 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] flex items-center gap-2 disabled:opacity-50">
                     {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save Changes'}
                  </button>
               </div>
            </div>
         </div>
      )}

      {sessionBatchPickerItem && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border-4 border-black p-6 w-full max-w-sm">
               <h2 className="text-xl font-black mb-4">Start Session</h2>
               <p className="text-sm font-bold mb-4 text-zinc-600 dark:text-zinc-400">Select which batch this session is for:</p>
               
               {/* Checkbox removed */}

               <div className="space-y-2 mb-6 max-h-60 overflow-y-auto">
                 {batches.filter(b => assignments.some(a => a.libraryItemId === sessionBatchPickerItem.id && a.batchId === b.id)).map(b => (
                    <button
                      key={b.id}
                      onClick={() => handleStartSession(b.id)}
                      className="w-full text-left p-3 border-2 border-black hover:bg-zinc-100 font-bold dark:hover:bg-zinc-800 flex justify-between items-center"
                    >
                      <span>{b.name}</span>
                      <span className="text-xs bg-black text-white px-2 py-1">▶ Start</span>
                    </button>
                 ))}
                 {batches.filter(b => assignments.some(a => a.libraryItemId === sessionBatchPickerItem.id && a.batchId === b.id)).length === 0 && (
                   <p className="text-sm font-bold text-red-500">First share this exam to a batch.</p>
                 )}
               </div>
               <button onClick={() => setSessionBatchPickerItem(null)} className="w-full py-2 border-2 border-black font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800">Cancel</button>
            </div>
         </div>
      )}

      {activeSession && (
        isSessionMinimized ? (
          <div className="fixed bottom-4 right-4 z-50 bg-yellow-300 border-4 border-black shadow-[4px_4px_0px_black] p-4 text-black w-72 flex flex-col gap-2 animate-in slide-in-from-bottom-5">
             <div className="flex justify-between items-start">
               <h3 className="font-black text-sm uppercase truncate max-w-[150px]">{activeSession.examTitle}</h3>
               <button onClick={() => setIsSessionMinimized(false)} className="px-2 py-1 bg-white border-2 border-black text-xs font-bold shadow-[2px_2px_0px_black] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none transition-all">
                 ↗ Maximize
               </button>
             </div>
             <div className="bg-black text-yellow-300 text-2xl font-black py-2 px-2 text-center border-4 border-black tracking-widest select-all">
               {activeSession.accessCode}
             </div>
             <div className="flex justify-between items-center mt-1">
               <p className="text-xs font-bold">{activeSession.participantUids.length} জন উপস্থিত</p>
               <button
                 onClick={handleEndSession}
                 className="px-3 py-1 bg-red-500 border-2 border-black font-black text-white text-xs hover:bg-red-600 transition-colors shadow-[2px_2px_0px_black] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-none"
               >
                 ⬛ End
               </button>
             </div>
          </div>
        ) : (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-yellow-300 border-4 border-black shadow-[8px_8px_0px_black] p-8 max-w-md w-full text-center text-black">
            
            <div className="flex justify-between items-start mb-2">
               <h2 className="text-2xl font-black text-left leading-tight pr-4">{activeSession.examTitle}</h2>
               <button onClick={() => setIsSessionMinimized(true)} className="shrink-0 px-3 py-1 border-4 border-black bg-white hover:bg-zinc-100 font-bold text-sm shadow-[4px_4px_0px_black] hover:translate-x-[4px] hover:translate-y-[4px] hover:shadow-none transition-all">
                 🗕 Minimize
               </button>
            </div>
            <p className="text-sm font-bold mb-6 opacity-70 text-left">SESSION ACTIVE</p>
            
            <div className="bg-black text-yellow-300 text-5xl font-black tracking-[0.3em] py-6 px-4 mb-4 border-4 border-black select-all">
              {activeSession.accessCode}
            </div>

            <div className="mb-6 flex flex-col gap-2">
              {/* Removed toggle code button */}
            </div>
            
            <div className="mb-6">
              <p className="text-lg font-bold">
                {activeSession.participantUids.length} জন উপস্থিত
              </p>
            </div>
            
            <button
              onClick={handleEndSession}
              className="w-full py-3 bg-red-500 border-4 border-black font-black text-white text-xl shadow-[4px_4px_0px_black] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all"
            >
              ⬛ Session শেষ করুন
            </button>
            <p className="text-xs mt-3 opacity-60 font-bold">
              Session শেষ করলে নতুন ছাত্ররা আর enter করতে পারবে না
            </p>
          </div>
        </div>
        )
      )}

      {deleteItemId && (
         <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 w-full max-w-sm p-6 text-center">
               <h2 className="text-xl font-black uppercase mb-4 text-red-600">Confim Deletion</h2>
               <p className="mb-6 font-bold text-sm text-zinc-600 dark:text-zinc-400">Are you sure? This will remove the item (and all contents if it is a folder) from the entire library and all batches.</p>
               <div className="flex justify-center gap-4">
                  <button onClick={() => setDeleteItemId(null)} disabled={submitting} className="border-2 border-zinc-900 dark:border-zinc-100 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-bold uppercase py-2 px-6 hover:-translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]">Cancel</button>
                  <button onClick={() => handleDelete(deleteItemId)} disabled={submitting} className="border-2 border-transparent bg-red-600 text-white font-bold uppercase py-2 px-6 hover:-translate-y-0.5 shadow-[2px_2px_0px_0px_rgba(220,38,38,1)] flex items-center gap-2">
                     {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />} Delete
                  </button>
               </div>
            </div>
         </div>
      )}
    </div>
  );
}
