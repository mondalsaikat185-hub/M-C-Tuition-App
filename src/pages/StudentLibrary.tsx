import React, { useState, useEffect, useRef } from 'react';
import { db } from '../lib/firebase';
import { collection, query, getDocs, where, doc, getDoc, deleteDoc, updateDoc, onSnapshot } from 'firebase/firestore';
import { PageHeader } from './Pages';
import { Loader2, Eye, FileText, FileDown, BookOpen, Folder, ChevronRight, Clock, Search, FolderOpen, PenTool } from 'lucide-react';
import { useAuth } from '../components/AuthProvider';
import { UnifiedQuizPlayer } from '../components/quiz/UnifiedQuizPlayer';
import { LibraryItem } from './AdminLibrary';
import { verifyAndJoinSession, joinSessionWithoutCode } from '../lib/exam-session-utils';
import { useSearchParams } from 'react-router-dom';

export function StudentLibrary() {
  const { user } = useAuth();
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation
  const [searchParams, setSearchParams] = useSearchParams();
  const viewMode = (searchParams.get('mode') as 'folders' | 'latest') || 'folders';
  const currentFolderId = searchParams.get('folder') || null;
  const previewId = searchParams.get('preview') || null;
  const previewItem = items.find(i => i.id === previewId) || null;

  const setViewMode = (mode: 'folders' | 'latest') => {
    setSearchParams(prev => { prev.set('mode', mode); return prev; });
  };
  
  const setCurrentFolderId = (id: string | null) => {
    setSearchParams(prev => { 
       if (id) prev.set('folder', id); 
       else prev.delete('folder'); 
       return prev; 
    });
  };

  const setPreviewItem = (item: LibraryItem | null) => {
    setSearchParams(prev => {
       if (item && item.id) prev.set('preview', item.id);
       else prev.delete('preview');
       return prev;
    });
  };
  
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadMessage, setDownloadMessage] = useState<{title: string; body: string; isWarning?: boolean} | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Exam session
  const [codeInputItem, setCodeInputItem] = useState<LibraryItem | null>(null);
  const [enteredCode, setEnteredCode] = useState('');
  const [codeError, setCodeError] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);

  const [weeksToShow, setWeeksToShow] = useState(2);
  const [allAssigns, setAllAssigns] = useState<any[]>([]);
  const [libraryCache, setLibraryCache] = useState<Map<string, LibraryItem>>(() => {
    try {
      const saved = localStorage.getItem('libraryCache');
      const cacheTime = localStorage.getItem('libraryCacheTime');
      const CACHE_MAX_AGE = 24 * 60 * 60 * 1000;

      if (saved && cacheTime) {
        const age = Date.now() - parseInt(cacheTime);
        if (age < CACHE_MAX_AGE) {
          const parsed = JSON.parse(saved);
          return new Map(Object.entries(parsed)) as Map<string, LibraryItem>;
        } else {
          localStorage.removeItem('libraryCache');
          localStorage.removeItem('libraryCacheTime');
          localStorage.removeItem('fetchedFolders');
        }
      }
    } catch(e) { console.error('Cache load error', e); }
    return new Map();
  });
  const [fetchedFolders, setFetchedFolders] = useState<Set<string>>(() => {
    try {
      const saved = localStorage.getItem('fetchedFolders');
      if (saved) return new Set(JSON.parse(saved));
    } catch(e) {}
    return new Set();
  });
  const sessionCacheRef = useRef<Map<string, {data: any[], time: number}>>(new Map());

  useEffect(() => {
    try {
       if (fetchedFolders.size > 0) {
          localStorage.setItem('fetchedFolders', JSON.stringify(Array.from(fetchedFolders)));
       }
    } catch(e) {}
  }, [fetchedFolders]);
  const [libraryMode, setLibraryMode] = useState<'EXAM' | 'NOTE' | null>(null);

  useEffect(() => {
    try {
       if (libraryCache.size > 0) {
          localStorage.setItem('libraryCache', JSON.stringify(Object.fromEntries(libraryCache)));
          localStorage.setItem('libraryCacheTime', Date.now().toString());
       }
    } catch(e) { }
  }, [libraryCache]);

  useEffect(() => {
    if (!user?.batchId) {
       setLoading(false);
       return;
    }
    setLoading(true);

    const q = query(collection(db, 'batchAssignments'), where('batchId', '==', user.batchId));
    const unsubscribe = onSnapshot(q, (assignSnaps) => {
       const assigns = assignSnaps.docs.map(d => ({id: d.id, ...d.data()} as any));
       assigns.sort((a,b) => {
           const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
           const tA = getMs(a.assignedAt);
           const tB = getMs(b.assignedAt);
           return tB - tA;
       });
       setAllAssigns(assigns);
    }, (err) => {
       console.error(err);
       setLoading(false);
    });

    return () => unsubscribe();
  }, [user?.batchId]);

  // Derive visible items synchronously
  useEffect(() => {
      if (allAssigns.length === 0) {
          setItems([]);
          return;
      }

      const cutoff = Date.now() - (weeksToShow * 7 * 24 * 60 * 60 * 1000);
      const visibleAssigns = allAssigns.filter(a => {
         const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
         const t = getMs(a.assignedAt);
         return t === 0 || t >= cutoff; // t===0 includes legacy without timestamp
      });
      const neededRootIds = Array.from(new Set<string>(visibleAssigns.map(a => a.libraryItemId)));
      
      const accessible = new Set<string>();
      for (const id of neededRootIds) {
          accessible.add(id);
      }
      
      // Add loaded descendants of accessible folders
      const addLoadedChildren = (parentId: string) => {
          const children = Array.from<LibraryItem>(libraryCache.values()).filter(i => i.parentId === parentId);
          for (const c of children) {
              accessible.add(c.id);
              addLoadedChildren(c.id);
          }
      };
      for (const id of Array.from(accessible)) {
          addLoadedChildren(id);
      }

      // Add ancestors to visibility
      const addAncestors = (itemId: string) => {
          const item = libraryCache.get(itemId);
          if (item?.parentId) {
              accessible.add(item.parentId);
              addAncestors(item.parentId);
          }
      };
      for (const id of Array.from(accessible)) {
          addAncestors(id);
      }

      const filteredItems = Array.from<LibraryItem>(libraryCache.values())
          .filter(i => accessible.has(i.id));
      
      setItems(filteredItems);
  }, [allAssigns, weeksToShow, libraryCache]);

  useEffect(() => {
    const processVisibleItems = async () => {
        if (allAssigns.length === 0) {
           setLoading(false);
           return;
        }

        const cutoff = Date.now() - (weeksToShow * 7 * 24 * 60 * 60 * 1000);
        
        const visibleAssigns = allAssigns.filter(a => {
           const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
           const t = getMs(a.assignedAt);
           return t === 0 || t >= cutoff; // t===0 includes legacy without timestamp
        });

        const neededRootIds = Array.from(new Set<string>(visibleAssigns.map(a => a.libraryItemId)));
        
        // Use functional state update to ensure we have the very latest cache
        let currentCache = new Map<string, LibraryItem>();
        setLibraryCache((prev: Map<string, LibraryItem>) => { currentCache = new Map(prev); return prev; });
        
        const missingIds = neededRootIds.filter(id => !currentCache.has(id));

        if (missingIds.length > 0) {
           setLoading(true);
           let currentIdsToCheck = [...missingIds];
           while (currentIdsToCheck.length > 0) {
               const chunks = [];
               for (let i = 0; i < currentIdsToCheck.length; i += 30) {
                   chunks.push(currentIdsToCheck.slice(i, i + 30));
               }
               
               const nextIds = new Set<string>();
               for (const chunk of chunks) {
                   try {
                     const q = query(collection(db, 'library'), where('__name__', 'in', chunk));
                     const snaps = await getDocs(q);
                     snaps.forEach(snap => {
                        const data = { id: snap.id, ...snap.data() } as LibraryItem;
                        if (data.isChunked) return;
                        currentCache.set(data.id, data);
                        if (data.parentId && !currentCache.has(data.parentId)) {
                            nextIds.add(data.parentId);
                        }
                     });
                   } catch (err) {
                     console.error("Chunk fetch error:", err);
                   }
               }
               currentIdsToCheck = Array.from(nextIds);
           }
           setLibraryCache(currentCache);
        }
        
        setLoading(false);
    };

    processVisibleItems();
  }, [allAssigns, weeksToShow]); // Don't include libraryCache to prevent infinite loop

  const handleOpenFolder = async (folderId: string | null) => {
      setCurrentFolderId(folderId);
      if (folderId && !fetchedFolders.has(folderId)) {
          setLoading(true);
          try {
             const q = query(collection(db, 'library'), where('parentId', '==', folderId));
             const snaps = await getDocs(q);
             const newCache = new Map(libraryCache);
             snaps.forEach(snap => {
                const data = snap.data();
                if (data.isChunked) return;
                newCache.set(snap.id, { id: snap.id, ...data } as LibraryItem);
             });
             setLibraryCache(newCache);
             setFetchedFolders(f => new Set(f).add(folderId));
          } catch(err) {
             console.error("Folder fetch error", err);
          } finally {
             setLoading(false);
          }
      }
  };

  const ORACLE_SERVER_URL = 'https://saikat-tuition.duckdns.org';
  const ORACLE_API_KEY = import.meta.env.VITE_ORACLE_API_KEY || 'tuition-secret-2026-change-this';

  const handleDownloadUrl = async (item: LibraryItem) => {
    try {
      setDownloadingId(item.id);

      const fileIdMatch = item.contentUrl?.match(/[-\w]{25,}/);
      const fileId = fileIdMatch ? fileIdMatch[0] : null;
      if (!fileId) { alert('Invalid file link.'); return; }

      const studentName = (user as any)?.fullName || user?.displayName || user?.email || 'Student';
      const phone = (user as any)?.phone || '0000000000';
      const fileName = `${item.title || 'document'}.pdf`;
      const password = phone;

      const response = await fetch(`${ORACLE_SERVER_URL}/download`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: ORACLE_API_KEY, fileId, name: studentName, phone, fileName })
      });

      if (!response.ok) {
        setDownloadMessage({ title: '❌ Download Failed', body: 'Server error. Please try again later.', isWarning: true });
        return;
      }

      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      // Detect restricted environments
      const ua = navigator.userAgent;
      const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
      const isInAppBrowser = /(Instagram|FBAN|FBAV|TwitterAndroid|Line\/|WhatsApp|Snapchat|MicroMessenger|GSA\/)/i.test(ua);

      if (isInAppBrowser) {
        // In-app browsers (Facebook, Instagram, WhatsApp, etc.) silently block all downloads.
        // The blob is useless here — revoke it and tell the user to open in system browser.
        URL.revokeObjectURL(blobUrl);
        setDownloadMessage({
          title: '⚠️ Browser Not Supported',
          body: `আপনি WhatsApp / Instagram-এর ভেতরের browser ব্যবহার করছেন। এই browser-এ PDF download হয় না।\n\nPlease open this app in Chrome (Android) or Safari (iOS):\n\nAndroid: উপরের ⋮ মেনু → "Open in Chrome"\niOS: নিচের Share বাটন → "Open in Safari"\n\nতারপর আবার Download করুন।\n\nPassword হবে: ${password}`,
          isWarning: true
        });
        return;
      }

      if (isIOS) {
        const newTab = window.open(blobUrl, '_blank');
        if (!newTab) window.location.href = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 90000);
        setDownloadMessage({
          title: '📄 PDF Opened in Browser',
          body: `PDF টি browser-এ খুলেছে।\n\nসেভ করতে:\n1. Share বাটন (📤) এ ট্যাপ করুন\n2. "Save to Files" বেছে নিন\n\nPassword: ${password}\n(আপনার ফোন নম্বর)`,
          isWarning: false
        });
        return;
      }

      // Web Share API (Best for Android PWA / Chrome)
      const file = new File([blob], fileName, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
          try {
              await navigator.share({
                  files: [file],
                  title: fileName
              });
              setDownloadMessage({
                  title: '✅ PDF Shared / Saved',
                  body: `PDF টি সফলভাবে খোলা বা সেভ করা হয়েছে।\n\nPassword: ${password}\n(আপনার ফোন নম্বর)`,
                  isWarning: false
              });
              return;
          } catch (err: any) {
              console.log("Share failed or user cancelled:", err);
              if (err.name === 'AbortError') return; // User cancelled manually
              // Fallthrough to standard download
          }
      }

      // Standard download: fallback
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);

      setDownloadMessage({
        title: '✅ Download শুরু হয়েছে!',
        body: `PDF টি Downloads folder-এ সেভ হচ্ছে।\n\nPassword: ${password}\n(আপনার ফোন নম্বর)\n\nFile টি open করতে এই password দিন।`,
        isWarning: false
      });

    } catch (error) {
      setDownloadMessage({ title: '❌ Connection Error', body: 'Download করা যাচ্ছে না। Internet connection চেক করুন এবং adaptive try করুন।', isWarning: true });
      console.error(error);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadChunked = async (item: LibraryItem) => {
     if (!item.isChunked || !item.chunkCount || !item.id) return;
     try {
        setDownloadingId(item.id);
        const promises = Array.from({ length: item.chunkCount }, (_, i) =>
           getDoc(doc(db, 'libraryChunks', `${item.id}_${i}`))
        );
        const snapshots = await Promise.all(promises);
        const base64String = snapshots
           .map(snap => (snap.exists() ? snap.data().data : ''))
           .join('');
        
        const byteCharacters = atob(base64String);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        let byteArray: any = new Uint8Array(byteNumbers);

        try {
           const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
           const pdfDoc = await PDFDocument.load(byteArray);
           const pages = pdfDoc.getPages();
           const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
           const watermarkText = `Downloaded by: ${user?.fullName || user?.displayName || user?.email || 'Student'} | ${new Date().toLocaleString('en-IN')}`;
           
           for (const page of pages) {
             const { width, height } = page.getSize();
             const textSize = 9;
             const textWidth = font.widthOfTextAtSize(watermarkText, textSize);
             page.drawText(watermarkText, {
               x: width - textWidth - 15,
               y: height - 20,
               size: textSize,
               font: font,
               color: rgb(0.5, 0.5, 0.5),
               opacity: 0.4,
             });
           }
           byteArray = await pdfDoc.save();
        } catch (watermarkErr) {
           console.warn("Could not add watermark:", watermarkErr);
        }

        try {
           if (user?.phone && user.phone.trim()) {
               const { encryptPDF } = await import('@pdfsmaller/pdf-encrypt');
               const phonePassword = user.phone.trim();
               byteArray = (await encryptPDF(byteArray, phonePassword)) as any;
               /* alert moved */
           }
        } catch (pdfErr) {
           console.warn("Could not encrypt PDF with phone number:", pdfErr);
        }
        
        const blob = new Blob([byteArray], { type: 'application/pdf' });
        
        const blobUrl = URL.createObjectURL(blob);
        const password = user?.phone?.trim() || '';

        // Detect restricted environments
        const ua = navigator.userAgent;
        const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
        const isInAppBrowser = /(Instagram|FBAN|FBAV|TwitterAndroid|Line\/|WhatsApp|Snapchat|MicroMessenger|GSA\/)/i.test(ua);

        if (isInAppBrowser) {
          URL.revokeObjectURL(blobUrl);
          setDownloadMessage({
            title: '⚠️ Browser Not Supported',
            body: `আপনি WhatsApp / Instagram-এর ভেতরের browser ব্যবহার করছেন। এই browser-এ PDF download হয় না।\n\nPlease open this app in Chrome (Android) or Safari (iOS):\n\nAndroid: উপরের ⋮ মেনু → "Open in Chrome"\niOS: নিচের Share বাটন → "Open in Safari"\n\nতারপর আবার Download করুন।\n\nPassword হবে: ${password}`,
            isWarning: true
          });
          return;
        }

        if (isIOS) {
          const newTab = window.open(blobUrl, '_blank');
          if (!newTab) window.location.href = blobUrl;
          setTimeout(() => URL.revokeObjectURL(blobUrl), 90000);
          setDownloadMessage({
            title: '📄 PDF Opened in Browser',
            body: `PDF টি browser-এ খুলেছে।\n\nসেভ করতে:\n1. Share বাটন (📤) এ ট্যাপ করুন\n2. "Save to Files" বেছে নিন\n\nPassword: ${password}\n(আপনার ফোন নম্বর)`,
            isWarning: false
          });
          return;
        }

        // Web Share API (Best for Android PWA / Chrome)
        const fileName = item.fileName || 'note.pdf';
        const file = new File([blob], fileName, { type: 'application/pdf' });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    title: fileName
                });
                setDownloadMessage({
                    title: '✅ PDF Shared / Saved',
                    body: `PDF টি সফলভাবে খোলা বা সেভ করা হয়েছে।\n\nPassword: ${password}\n(আপনার ফোন নম্বর)`,
                    isWarning: false
                });
                return;
            } catch (err: any) {
                console.log("Share failed or user cancelled:", err);
                if (err.name === 'AbortError') return; // User cancelled manually
                // Fallthrough to standard download
            }
        }

        // Download fallback
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = fileName;
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link); 
        setTimeout(() => { URL.revokeObjectURL(link.href); }, 60000); 
        
        if (password) {
            setTimeout(() => { 
                setDownloadMessage({ 
                    title: '✅ Download শুরু হয়েছে!', 
                    body: `PDF টি Downloads folder-এ সেভ হচ্ছে।\n\nPassword: ${password}\n(আপনার ফোন নম্বর)\n\nFile টি open করতে এই password দিন।` 
                }); 
            }, 500); 
        }

     } catch (err) {
        console.error('Download failed:', err);
        setDownloadMessage({ title: '❌ Error', body: 'Download failed. Please try again.', isWarning: true });
     } finally {
        setDownloadingId(null);
     }
  };

  const handleItemClick = async (item: LibraryItem) => {
     try {
         if (item.type !== 'exam') {
            setPreviewItem(item);
            return;
         }

         if (!user || !(user as any).batchId) {
            alert("প্রথমে একটি batch-এ যোগ দিন (Join a batch first)");
            return;
         }

         const CACHE_TTL = 60 * 1000;
         const cached = sessionCacheRef.current.get(item.id);
         let snap: any;

         if (cached && Date.now() - cached.time < CACHE_TTL) {
             snap = { docs: cached.data };
         } else {
             const q = query(
                collection(db, 'examSessions'),
                where('examId', '==', item.id)
             );
             const realSnap = await getDocs(q);
             // Manually create an array of "docs" with data() so we can cache safely
             const docsArray = realSnap.docs.map(d => ({ data: () => d.data(), id: d.id }));
             sessionCacheRef.current.set(item.id, { data: docsArray, time: Date.now() });
             snap = { docs: docsArray };
         }

         const batchSessionDocs = snap.docs.filter((doc: any) => doc.data().batchId === (user as any).batchId);
         const activeSessionDocs = batchSessionDocs.filter(doc => doc.data().isActive === true);
         const endedSessionDocs = batchSessionDocs.filter(doc => doc.data().isActive === false);

         if (batchSessionDocs.length === 0) {
            // No sessions at all -> just a mock test or open assignment
            setPreviewItem(item);
            return;
         }

         if (activeSessionDocs.length === 0) {
            if (endedSessionDocs.length > 0) {
               // Session ended -> direct access without code
               setPreviewItem(item);
            } else {
               alert('এই পরীক্ষা এখনো শুরু হয়নি। দয়া করে লাইভ সেশন শুরু হওয়া পর্যন্ত অপেক্ষা করুন।');
            }
            return;
         }

         const activeSessionDoc = activeSessionDocs[0];
         const activeSession = activeSessionDoc.data();

         // Check if already a participant
         const participants = activeSession.participantUids || [];
         if (participants.includes(user.uid)) {
            setPreviewItem(item);
            return;
         }

         // Check if code is required
         if (activeSession.codeEnabled === false) {
             // No code needed — join directly
             const result = await joinSessionWithoutCode(
                 activeSessionDoc.id,
                 activeSession,
                 user.uid,
                 (user as any).batchId
             );
             if (result === 'ok' || result === 'already_participated') {
                 setPreviewItem(item);
             }
             return;
         }

         // Require code for new participant
         setCodeInputItem(item);
         setEnteredCode('');
         setCodeError('');
     } catch (err: any) {
         console.error("handleItemClick error:", err);
         alert("ফাইল খুলতে একটি সমস্যা হয়েছে (Error): " + err.message);
     }
  };

  const handleCodeSubmit = async () => {
     if (!codeInputItem || !user || !(user as any).batchId) return;
     try {
       setCodeLoading(true);
       setCodeError('');

       const result = await verifyAndJoinSession(
          codeInputItem.id,
          (user as any).batchId,
          user.uid,
          enteredCode
       );
       setCodeLoading(false);

       switch (result) {
          case 'ok':
             setCodeInputItem(null);
             setPreviewItem(codeInputItem);
             break;
          case 'wrong_code':
             setCodeError('❌ কোডটি ভুল। আবার চেষ্টা করুন।');
             break;
          case 'already_participated':
             setCodeError('আপনি এই session-এ ইতিমধ্যে যোগ দিয়েছেন।');
             setCodeInputItem(null);
             setPreviewItem(codeInputItem);
             break;
          case 'session_inactive':
             setCodeError('❌ এই session আর সক্রিয় নেই।');
             break;
       }
     } catch (err) {
       console.error("Code verification failed:", err);
       setCodeError('❌ একটি সমস্যা হয়েছে। দয়া করে আবার চেষ্টা করুন।');
       setCodeLoading(false);
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
  const isFolderVisible = (folder: LibraryItem, mode: 'EXAM' | 'NOTE'): boolean => {
     const checkContents = (parentId: string): boolean => {
         const children = items.filter(i => i.parentId === parentId);
         for (const child of children) {
             if (!child.isFolder) {
                 if (mode === 'EXAM' && child.type === 'exam') return true;
                 if (mode === 'NOTE' && child.type !== 'exam') return true;
             } else {
                 if (checkContents(child.id)) return true;
             }
         }
         return false;
     };
     
     const hasMatchingContent = checkContents(folder.id);
     if (!hasMatchingContent) {
         if (mode === 'EXAM' && (folder.title.toLowerCase().includes('exam') || folder.title.toLowerCase().includes('test'))) return true;
         if (mode === 'NOTE' && !(folder.title.toLowerCase().includes('exam') || folder.title.toLowerCase().includes('test'))) return true;
         return false;
     }
     return true;
  };

  const currentItems = items.filter(i => 
    searchQuery 
     ? i.title.toLowerCase().includes(searchQuery.toLowerCase()) && (libraryMode === 'NOTE' ? i.type !== 'exam' : i.type === 'exam')
     : (i.parentId || null) === currentFolderId && (
         (i.isFolder && isFolderVisible(i, libraryMode as 'EXAM' | 'NOTE')) || 
         (!i.isFolder && i.type === (libraryMode === 'NOTE' ? 'note' : 'exam'))
       )
  );
  const getMs = (t: any) => t?.toMillis?.() || (t?.seconds ? t.seconds * 1000 : 0) || 0;
  const folders = currentItems.filter(i => i.isFolder).sort((a,b) => a.title.localeCompare(b.title));
  const files = currentItems.filter(i => !i.isFolder).sort((a,b) => getMs(b.createdAt) - getMs(a.createdAt));

  const allFilesSorted = searchQuery 
    ? files 
    : items.filter(i => !i.isFolder && i.type === (libraryMode === 'NOTE' ? 'note' : 'exam')).sort((a,b) => getMs(b.createdAt) - getMs(a.createdAt));

  const formatDate = (timestamp: any) => {
     if (!timestamp) return 'No date';
     const d = timestamp.toDate();
     return d.toLocaleString('en-IN', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', hour12: true
     });
  };

  const handleBackNavigation = () => {
     if (currentFolderId) {
        const folder = items.find(i => i.id === currentFolderId);
        setCurrentFolderId(folder?.parentId || null);
     } else {
        setLibraryMode(null);
     }
  };

  if (!libraryMode) {
      return (
         <div className="p-4 sm:p-6 max-w-4xl mx-auto flex flex-col items-center justify-center min-h-[70vh] w-full text-center">
             <h1 className="text-3xl font-black mb-8 uppercase text-zinc-900 dark:text-zinc-100">Welcome to Library</h1>
             <p className="text-zinc-600 dark:text-zinc-400 font-bold mb-10">What would you like to access today?</p>
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 w-full max-w-2xl px-4">
                 <button onClick={() => setLibraryMode('NOTE')} className="flex flex-col items-center gap-4 bg-zinc-50 dark:bg-zinc-900/50 border-4 border-zinc-900 dark:border-zinc-100 p-8 hover:-translate-y-2 transition-transform shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)] group">
                    <div className="bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 p-6 rounded-full group-hover:scale-110 transition-transform"><BookOpen className="w-10 h-10" /></div>
                    <h2 className="text-2xl font-black uppercase text-zinc-900 dark:text-zinc-100">Study Materials</h2>
                    <p className="text-zinc-700 dark:text-zinc-400 font-medium">Access PDF notes, assignments & study guides</p>
                 </button>
                 <button onClick={() => setLibraryMode('EXAM')} className="flex flex-col items-center gap-4 bg-blue-50 dark:bg-blue-900/20 border-4 border-blue-600 p-8 hover:-translate-y-2 transition-transform shadow-[8px_8px_0px_0px_rgba(37,99,235,1)] group">
                    <div className="bg-blue-600 text-white p-6 rounded-full group-hover:scale-110 transition-transform"><PenTool className="w-10 h-10" /></div>
                    <h2 className="text-2xl font-black uppercase text-blue-900 dark:text-blue-100">Take an Exam</h2>
                    <p className="text-blue-700 dark:text-blue-300 font-medium">Participate in live exams or past mock tests</p>
                 </button>
             </div>
         </div>
      );
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto flex flex-col h-full w-full">
      {downloadMessage && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-zinc-900 border-4 border-black p-6 w-full max-w-sm shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)]">
            <h3 className={`text-xl font-black uppercase mb-4 ${downloadMessage.isWarning ? 'text-red-600 dark:text-red-500' : 'text-green-600 dark:text-green-500'}`}>{downloadMessage.title}</h3>
            <p className="text-sm font-bold text-zinc-600 dark:text-zinc-400 whitespace-pre-line mb-6">
               {downloadMessage.body}
            </p>
            <button
               onClick={() => setDownloadMessage(null)}
               className="w-full bg-black text-white hover:bg-zinc-800 px-4 py-3 font-bold text-sm uppercase transition-colors"
            >
               OK
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
          <div className="flex items-center gap-4">
             <PageHeader 
                title="My Target Library" 
                backTo="/" 
                onBack={currentFolderId ? handleBackNavigation : undefined} 
             />
             <button 
                onClick={() => {
                   localStorage.removeItem('libraryCache');
                   localStorage.removeItem('libraryCacheTime');
                   localStorage.removeItem('fetchedFolders');
                   window.location.reload();
                }}
                className="bg-black dark:bg-white text-white dark:text-black font-bold uppercase text-xs px-4 py-2 border-2 border-transparent hover:-translate-y-0.5 transition-transform"
             >
                Refresh
             </button>
          </div>
          
          <div className="w-full sm:max-w-md relative">
             <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
             <input 
                type="text" 
                placeholder="Search materials..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border-2 border-zinc-900 dark:border-zinc-100 bg-white dark:bg-zinc-900 focus:outline-none"
             />
          </div>

          <div className="flex bg-zinc-200 dark:bg-zinc-800 p-1 w-full sm:w-auto">
             <button 
                onClick={() => setViewMode('folders')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase transition-all ${viewMode === 'folders' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow px-6' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
             >
                <FolderOpen className="w-4 h-4" /> Folders
             </button>
             <button 
                onClick={() => setViewMode('latest')}
                className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold uppercase transition-all ${viewMode === 'latest' ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow px-6' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100'}`}
             >
                <Clock className="w-4 h-4" /> Latest Updates
             </button>
          </div>
      </div>
      
      {loading ? (
          <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin" /></div>
      ) : viewMode === 'folders' ? (
          <>
            <div className="flex gap-2 items-center mb-6 overflow-x-auto text-sm font-bold pb-2 text-zinc-600 dark:text-zinc-400">
               <button onClick={() => handleOpenFolder(null)} className="hover:text-zinc-900 dark:hover:text-zinc-100 flex items-center gap-1 shrink-0">
                  <Folder className="w-4 h-4"/> Home
               </button>
               {breadcrumbs.map(bc => (
                   <React.Fragment key={bc.id}>
                      <ChevronRight className="w-4 h-4 shrink-0" />
                      <button onClick={() => handleOpenFolder(bc.id)} className="hover:text-zinc-900 dark:hover:text-zinc-100 shrink-0">
                         {bc.title}
                      </button>
                   </React.Fragment>
               ))}
            </div>

            <div className="grid grid-cols-1 mb-8 gap-4">
              {folders.length === 0 && files.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 font-bold border-2 border-dashed border-zinc-300 dark:border-zinc-700">Content will appear here once assigned by the administrator.</div>
              ) : (
                  <>
                     {folders.map(folder => (
                        <div key={folder.id} 
                             className="bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors" 
                             onClick={() => handleOpenFolder(folder.id)}>
                           <div className="flex items-center gap-3 w-full">
                              <Folder className="w-6 h-6 text-blue-500 shrink-0" fill="currentColor" />
                              <h4 className="font-black text-lg truncate flex-1">{folder.title}</h4>
                           </div>
                           <div className="shrink-0 text-xs text-zinc-400 font-bold hidden sm:block">
                              Directory
                           </div>
                        </div>
                     ))}
                     
                     {files.map(item => (
                        <FileCard key={item.id} item={item} onPreview={() => handleItemClick(item)} formatDate={formatDate} onDownloadChunked={() => handleDownloadChunked(item)} onDownloadUrl={() => handleDownloadUrl(item)} downloadingId={downloadingId} showPath={!!searchQuery} items={items} />
                     ))}
                  </>
              )}
            </div>
            
            <div className="flex justify-center mt-4">
                <button 
                   onClick={() => setWeeksToShow(w => w + 2)}
                   className="px-6 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold bg-white dark:bg-zinc-900 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)] transition-all"
                >
                   Load Older Materials
                </button>
            </div>
          </>
      ) : (
          <div className="flex flex-col gap-8 mb-8">
             {allFilesSorted.length === 0 ? (
                  <div className="p-8 text-center text-zinc-500 font-bold border-2 border-dashed border-zinc-300 dark:border-zinc-700">No materials available yet.</div>
             ) : (
                 Array.from(Object.entries(
                    allFilesSorted.reduce((acc: any, item) => {
                       const d = item.createdAt?.toDate();
                       const dateStr = d ? d.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : 'Older';
                       if (!acc[dateStr]) acc[dateStr] = [];
                       acc[dateStr].push(item);
                       return acc;
                    }, {})
                 )).map(([dateLabel, itemsInDate]: any) => (
                    <div key={dateLabel}>
                       <h3 className="font-black text-xl uppercase mb-4 text-zinc-900 dark:text-zinc-100 border-b-2 border-zinc-200 dark:border-zinc-800 pb-2">{dateLabel}</h3>
                       <div className="grid grid-cols-1 gap-4">
                          {itemsInDate.map((item: any) => (
                             <FileCard key={item.id} item={item} onPreview={() => handleItemClick(item)} formatDate={formatDate} showPath items={items} onDownloadChunked={() => handleDownloadChunked(item)} onDownloadUrl={() => handleDownloadUrl(item)} downloadingId={downloadingId} />
                          ))}
                       </div>
                    </div>
                 ))
             )}
             
             <div className="flex justify-center mt-4">
                <button 
                   onClick={() => setWeeksToShow(w => w + 2)}
                   className="px-6 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold bg-white dark:bg-zinc-900 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:hover:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)] transition-all"
                >
                   Load Older Materials
                </button>
             </div>
          </div>
      )}

      {codeInputItem && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-white border-4 border-black shadow-[8px_8px_0px_black] p-8 max-w-sm w-full">
            
            <h2 className="text-xl font-black mb-1 text-black">{codeInputItem.title}</h2>
            <p className="text-sm mb-6 opacity-70 text-black">
              আপনার শিক্ষক যে কোডটি বলেছেন সেটি এখানে লিখুন:
            </p>

            <input
              type="text"
              value={enteredCode}
              onChange={(e) => setEnteredCode(e.target.value.toUpperCase())}
              placeholder="যেমন: K7X2M"
              maxLength={5}
              className="w-full border-4 border-black px-4 py-3 text-3xl font-black tracking-widest text-center uppercase mb-4 text-black focus:outline-none focus:bg-yellow-50"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCodeSubmit()}
            />

            {codeError && (
              <p className="text-red-600 font-bold text-sm mb-4 text-center">{codeError}</p>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setCodeInputItem(null)}
                className="flex-1 py-3 border-4 border-black font-bold text-black bg-gray-100 hover:bg-gray-200 transition-colors"
                disabled={codeLoading}
              >
                বাতিল
              </button>
              <button
                onClick={handleCodeSubmit}
                disabled={enteredCode.length < 5 || codeLoading}
                className="flex-[2] px-6 py-3 bg-green-400 border-4 border-black font-black text-black shadow-[4px_4px_0px_black] hover:shadow-none hover:translate-x-[4px] hover:translate-y-[4px] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {codeLoading ? '...' : '▶ পরীক্ষা শুরু করুন'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FileCard({ item, onPreview, formatDate, showPath, items, onDownloadChunked, onDownloadUrl, downloadingId }: { key?: React.Key, item: LibraryItem, onPreview: () => void, formatDate: (ts: any) => string, showPath?: boolean, items?: LibraryItem[], onDownloadChunked?: () => void, onDownloadUrl?: () => void, downloadingId?: string | null }) {
   const renderPath = () => {
      if (!showPath || !items || !item.parentId) return null;
      const getPathStr = (id: string): string => {
         const p = items.find(i => i.id === id);
         if (!p) return '';
         const parentStr = p.parentId ? getPathStr(p.parentId) : '';
         return parentStr ? `${parentStr} / ${p.title}` : p.title;
      };
      const pstr = getPathStr(item.parentId);
      return <div className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 mt-2 inline-block">📁 {pstr}</div>;
   };

   return (
      <div className={`bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-4 shadow-[4px_4px_0px_0px_rgba(24,24,27,1)] dark:shadow-[4px_4px_0px_0px_rgba(244,244,245,1)] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4`}>
         <div>
            <div className="flex items-center gap-2 mb-1">
              <h4 className="font-black text-lg text-zinc-900 dark:text-zinc-100">{item.title}</h4>
              <span className="text-[10px] bg-zinc-200 dark:bg-zinc-800 px-2 py-0.5 font-bold uppercase text-zinc-700 dark:text-zinc-300">
                {item.type === 'exam' ? item.examType : 'PDF Note'}
              </span>
            </div>
            <div className="flex items-center gap-3">
               <span className="text-xs text-zinc-500 font-bold flex items-center gap-1">
                 <Clock className="w-3.5 h-3.5" /> 
                 {formatDate(item.createdAt)}
               </span>
            </div>
            {renderPath()}
         </div>
         
         <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
           {item.type === 'note' && item.contentUrl && onDownloadUrl && (
               <button onClick={onDownloadUrl} disabled={downloadingId === item.id} className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-4 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold text-xs hover:-translate-y-0.5 transition-transform whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]">
                 {downloadingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} 
                 {downloadingId === item.id ? 'Processing...' : 'Download PDF'}
               </button>
           )}
           {item.type === 'note' && item.contentUrl && !onDownloadUrl && (
               <a href={item.contentUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-4 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold text-xs hover:-translate-y-0.5 transition-transform whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]">
                 <FileDown className="w-3.5 h-3.5" /> View/Download PDF
               </a>
           )}
           {item.type === 'note' && !item.contentUrl && item.isChunked && onDownloadChunked && (
               <button onClick={onDownloadChunked} disabled={downloadingId === item.id} className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white px-4 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold text-xs hover:-translate-y-0.5 transition-transform whitespace-nowrap shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)]">
                 {downloadingId === item.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />} 
                 {downloadingId === item.id ? 'Processing...' : 'Download PDF'}
               </button>
           )}
           {item.type === 'exam' && item.examType === 'Online Link' && item.contentUrl ? (
              <button 
                 onClick={() => {
                    window.open(item.contentUrl, '_blank');
                 }}
                 className='flex items-center gap-1 bg-blue-100 text-blue-900 px-4 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold text-xs hover:-translate-y-0.5 transition-transform shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)] whitespace-nowrap'
              >
                 <BookOpen className="w-3.5 h-3.5" /> Take Exam
              </button>
           ) : item.type === 'exam' ? (
              <button 
                onClick={onPreview} 
                className='flex items-center gap-1 bg-blue-100 text-blue-900 hover:-translate-y-0.5 transition-transform shadow-[2px_2px_0px_0px_rgba(24,24,27,1)] dark:shadow-[2px_2px_0px_0px_rgba(244,244,245,1)] px-4 py-2 border-2 border-zinc-900 dark:border-zinc-100 font-bold text-xs whitespace-nowrap'
              >
                 <BookOpen className="w-3.5 h-3.5" /> Take Exam
              </button>
           ) : null}
         </div>
      </div>
   );
}
