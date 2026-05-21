import React, { useState, useEffect } from 'react';
import { X, Bell, Plus, Edit, Trash2, CheckCircle, Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { db } from '../lib/firebase';
import { collection, query, where, getDocs, addDoc, updateDoc, doc, deleteDoc, serverTimestamp, orderBy, arrayUnion, limit } from 'firebase/firestore';

export function NotificationsPanel({ onClose }: { onClose: () => void }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showCreate, setShowCreate] = useState(false);
  const [editItem, setEditItem] = useState<any | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [batches, setBatches] = useState<any[]>([]);

  // Form states
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetBatch, setTargetBatch] = useState('all'); // 'all' or batchId
  const [submitting, setSubmitting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    
    // Fetch batches for dropdown and mapping
    const fetchBatches = async () => {
       const snap = await getDocs(collection(db, 'batches'));
       setBatches(snap.docs.map(doc => ({id: doc.id, ...doc.data()})));
    };
    fetchBatches();
  }, [user?.uid]);
  
  useEffect(() => {
    if (!user) return;

    let q;
    if (user.role === 'admin') {
       // admin sees all
       q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(50));
    } else {
       // student sees admin_to_all, admin_to_batch (where batch matches), and their own sent msgs
       q = query(collection(db, 'notifications'), orderBy('createdAt', 'desc'), limit(30));
    }

    const fetchNotifs = async () => {
       const snap = await getDocs(q);
       let notifs = snap.docs.map(doc => ({id: doc.id, ...(doc.data() as any)}));
       if (user.role === 'student') {
          // Client side filter
          notifs = notifs.filter((n: any) => 
             n.senderId === user.uid ||
             n.targetId === user.uid ||
             n.type === 'admin_to_all' ||
             (n.type === 'admin_to_batch' && n.batchId === (user as any).batchId)
          );
       }
       setNotifications(notifs);
       setLoading(false);
    };
    fetchNotifs();
  }, [user?.uid, user?.role, (user as any)?.batchId, refreshKey]);

  const handleSubmit = async (e: React.FormEvent) => {
     e.preventDefault();
     if (!user) return;
     setSubmitting(true);
     try {
        if (editItem) {
           await updateDoc(doc(db, 'notifications', editItem.id), {
              title, message, batchId: targetBatch, 
              type: targetBatch === 'all' ? 'admin_to_all' : 'admin_to_batch'
           });
        } else {
           const type = user.role === 'admin' ? (targetBatch === 'all' ? 'admin_to_all' : 'admin_to_batch') : 'student_to_admin';
           const selectedBatch = batches.find(b => b.id === targetBatch);
           let studentBatchName = 'Unknown Batch';
           if (user.role === 'student' && (user as any).batchId) {
             const bMatch = batches.find(b => b.id === (user as any).batchId);
             if (bMatch) studentBatchName = bMatch.name;
           }

           await addDoc(collection(db, 'notifications'), {
              senderId: user.uid,
              senderRole: user.role,
              senderName: user.fullName || user.email,
              batchId: user.role === 'admin' ? targetBatch : ((user as any).batchId || 'none'),
              batchName: user.role === 'admin' ? (selectedBatch ? selectedBatch.name : 'All Batches') : studentBatchName,
              title,
              message,
              type,
              createdAt: serverTimestamp(),
              readers: []
           });
        }
        setShowCreate(false);
        setEditItem(null);
        setTitle('');
        setMessage('');
        setTargetBatch('all');
        setRefreshKey(k => k + 1);
     } catch (err) {
        console.error("Failed to save notification", err);
        alert("Action failed.");
     } finally {
        setSubmitting(false);
     }
  };

  const handleEdit = (item: any) => {
     setEditItem(item);
     setTitle(item.title || '');
     setMessage(item.message || '');
     setTargetBatch(item.batchId || 'all');
     setShowCreate(true);
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
     e.stopPropagation();
     if (confirmDeleteId !== id) {
        setConfirmDeleteId(id);
        // Clear confirm state after a few seconds
        setTimeout(() => setConfirmDeleteId(null), 3000);
        return;
     }
     try {
        await deleteDoc(doc(db, 'notifications', id));
        setConfirmDeleteId(null);
     } catch(e) { console.error(e); }
  };

  const markAsRead = async (item: any) => {
     if (!user) return;
     const readers = item.readers || [];
     if (!readers.includes(user.uid)) {
        try {
           await updateDoc(doc(db, 'notifications', item.id), {
              readers: arrayUnion(user.uid)
           });
        } catch(e) { console.error(e); }
     }
  };

  if (!user) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex justify-end bg-black/60 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in">
       <div className="bg-white dark:bg-zinc-900 border-l-4 sm:border-4 border-black dark:border-zinc-100 sm:shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] flex flex-col relative overflow-hidden">
          
          <div className="bg-zinc-100 dark:bg-zinc-800 p-4 font-black uppercase text-xl flex justify-between items-center border-b-4 border-black dark:border-zinc-100 shrink-0">
             <div className="flex items-center gap-4">
                 <div className="flex items-center gap-2">
                    <Bell className="w-5 h-5" /> Notifications
                 </div>
                 <button onClick={() => setRefreshKey(k => k + 1)} className="text-xs uppercase bg-black dark:bg-zinc-100 text-white dark:text-black px-2 py-1 flex items-center gap-1 active:translate-y-px">
                     Refresh
                 </button>
             </div>
             <button onClick={onClose} className="hover:text-red-500 transition-colors bg-white dark:bg-zinc-900 border-2 border-black dark:border-zinc-100 p-1">
                <X className="w-5 h-5" />
             </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
             {!showCreate && (
                <div className="flex justify-between items-center mb-2">
                   <p className="text-xs font-bold uppercase text-zinc-500">Your Messages</p>
                   {user.role === 'admin' ? (
                       <button onClick={() => { setEditItem(null); setTitle(''); setMessage(''); setShowCreate(true); }} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 px-3 py-1 text-xs font-black uppercase border-2 border-emerald-900 flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(6,78,59,1)] hover:-translate-y-0.5 transition-transform">
                          <Plus className="w-3 h-3" /> Create New
                       </button>
                   ) : (
                       <button onClick={() => { setEditItem(null); setTitle(''); setMessage(''); setShowCreate(true); }} className="bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-3 py-1 text-xs font-black uppercase border-2 border-blue-900 flex items-center gap-1 shadow-[2px_2px_0px_0px_rgba(30,58,138,1)] hover:-translate-y-0.5 transition-transform">
                          <Plus className="w-3 h-3" /> Message Admin
                       </button>
                   )}
                </div>
             )}

             {showCreate ? (
                <form onSubmit={handleSubmit} className="border-4 border-black dark:border-zinc-100 p-4 bg-zinc-50 dark:bg-zinc-800/50 flex flex-col gap-3">
                   <h3 className="font-black uppercase text-sm mb-2">{editItem ? 'Edit Notification' : 'New Notification'}</h3>
                   
                   <input required value={title} onChange={e=>setTitle(e.target.value)} placeholder="Title / Subject" className="w-full bg-white dark:bg-zinc-900 border-2 border-black dark:border-zinc-100 p-2 text-sm font-bold placeholder:text-zinc-400" />
                   
                   {user.role === 'admin' && (
                       <select value={targetBatch} onChange={e=>setTargetBatch(e.target.value)} className="w-full bg-white dark:bg-zinc-900 border-2 border-black dark:border-zinc-100 p-2 text-sm font-bold">
                          <option value="all">Everyone (All Batches)</option>
                          {batches.map(b => (
                              <option key={b.id} value={b.id}>{b.name}</option>
                          ))}
                       </select>
                   )}

                   <textarea required rows={4} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Type your message here..." className="w-full bg-white dark:bg-zinc-900 border-2 border-black dark:border-zinc-100 p-2 text-sm font-medium resize-none"></textarea>

                   <div className="flex gap-2 justify-end mt-2">
                       <button type="button" onClick={() => setShowCreate(false)} className="text-xs font-bold uppercase py-2 px-3 border-2 border-zinc-900 hover:bg-zinc-200 dark:hover:bg-zinc-700">Cancel</button>
                       <button type="submit" disabled={submitting} className="text-xs font-black uppercase py-2 px-4 bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1 disabled:opacity-50">
                          {submitting && <Loader2 className="w-3 h-3 animate-spin"/>} {editItem ? 'Save' : 'Send'}
                       </button>
                   </div>
                </form>
             ) : (
                <>
                   {loading && <div className="p-4 text-center"><Loader2 className="w-6 h-6 animate-spin mx-auto text-zinc-400" /></div>}
                   {!loading && notifications.length === 0 && (
                       <div className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 p-6 flex flex-col items-center justify-center text-zinc-400">
                          <Bell className="w-8 h-8 mb-2 opacity-20" />
                          <p className="font-bold text-sm uppercase">No Notifications</p>
                       </div>
                   )}
                   {notifications.map((notif: any) => {
                       const isUnread = notif.senderId !== user.uid && !(notif.readers || []).includes(user.uid);
                       
                       return (
                          <div 
                             key={notif.id} 
                             onClick={() => isUnread && markAsRead(notif)}
                             className={`border-2 p-3 flex flex-col gap-2 relative transition-colors ${
                                isUnread 
                                  ? 'border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-[4px_4px_0px_0px_rgba(37,99,235,1)] dark:shadow-[4px_4px_0px_0px_rgba(59,130,246,1)]' 
                                  : 'border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                             }`}
                          >
                             {isUnread && <span className="absolute -top-1.5 -right-1.5 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span><span className="relative inline-flex rounded-full h-3 w-3 bg-red-600 pb-0.5"></span></span>}

                             <div className="flex justify-between items-start">
                                <div>
                                   <h4 className={`text-sm ${isUnread ? 'font-black' : 'font-bold'}`}>{notif.title || 'Notification'}</h4>
                                   <div className="flex items-center gap-1 mt-0.5">
                                      <span className="text-[10px] font-black uppercase px-1.5 py-0.5 bg-zinc-200 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400">
                                         {notif.senderRole === 'admin' ? 'Admin' : notif.senderName} 
                                         {notif.batchName && notif.batchName !== 'Unknown Batch' ? ` → ${notif.batchName}` : ''}
                                      </span>
                                      <span className="text-[10px] font-medium text-zinc-400">
                                         {notif.createdAt?.toDate().toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                   </div>
                                </div>
                                {user.role === 'admin' && (
                                   <div className="flex items-center gap-1">
                                      <button onClick={(e) => { e.stopPropagation(); handleEdit(notif); }} className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-500 transition-colors"><Edit className="w-3.5 h-3.5" /></button>
                                      <button onClick={(e) => handleDelete(notif.id, e)} className="p-1 hover:bg-red-100 hover:text-red-600 transition-colors">
                                         {confirmDeleteId === notif.id ? <span className="text-[10px] uppercase font-black px-1 text-red-600">Sure?</span> : <Trash2 className="w-3.5 h-3.5" />}
                                      </button>
                                   </div>
                                )}
                             </div>
                             
                             <p className="text-sm font-medium whitespace-pre-wrap mt-1 opacity-90">{notif.message}</p>
                          </div>
                       );
                   })}
                </>
             )}
          </div>

       </div>
    </div>
  );
}
