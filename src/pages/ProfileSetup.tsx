import React, { useState, useEffect } from 'react';
import { useAuth } from '../components/AuthProvider';
import { db } from '../lib/firebase';
import { doc, updateDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { handleFirestoreError, OperationType } from '../lib/firestore-error';
import { Loader2 } from 'lucide-react';

export function ProfileSetup() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState(user?.displayName || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [address, setAddress] = useState(user?.address || '');
  const [joinDate, setJoinDate] = useState(user?.joinDate || '');
  const [batchId, setBatchId] = useState(user?.batchId || '');
  const [loading, setLoading] = useState(false);
  const [batches, setBatches] = useState<{id: string, name: string}[]>([]);

  useEffect(() => {
    const fetchBatches = async () => {
      try {
        const q = collection(db, 'batches');
        const snaps = await getDocs(q);
        const b: any[] = [];
        snaps.forEach(d => b.push({ id: d.id, name: d.data().name }));
        setBatches(b);
      } catch (err) {
        console.error("Failed to fetch batches", err);
      }
    };
    fetchBatches();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    
    // Strict validation
    if (!fullName.trim() || !phone.trim() || !address.trim() || !joinDate.trim() || !batchId.trim()) {
       alert("Please fill in all mandatory fields correctly.");
       return;
    }

    try {
      setLoading(true);

      const statusUpdate = user.status === 'incomplete' ? { status: 'pending' } : {};

      await updateDoc(doc(db, 'users', user.uid), {
         fullName: fullName.trim(),
         phone: phone.trim(),
         address: address.trim(),
         joinDate: joinDate.trim(),
         batchId: batchId.trim(),
         isProfileComplete: true,
         ...statusUpdate,
         updatedAt: serverTimestamp()
      });
      navigate('/student');
    } catch (error: any) {
      alert("Error updating profile: " + String(error.message || error));
      try {
         handleFirestoreError(error, OperationType.UPDATE, 'users');
      } catch (e) {}
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-12">
      <div className="w-full max-w-lg bg-white dark:bg-zinc-900 border-2 border-zinc-900 dark:border-zinc-100 p-8 shadow-[8px_8px_0px_0px_rgba(24,24,27,1)] dark:shadow-[8px_8px_0px_0px_rgba(244,244,245,1)]">
        <h2 className="text-2xl font-black uppercase mb-2">Complete Profile</h2>
        <p className="text-zinc-500 mb-6 font-bold text-sm">Please fill in all mandatory details to request enrollment.</p>
        
        <form onSubmit={handleSubmit} className="flex flex-col gap-5">
          <div>
            <label className="block text-xs font-bold uppercase mb-1">Email Address</label>
            <input type="email" disabled value={user?.email || ''} className="w-full border-b-2 border-zinc-200 dark:border-zinc-700 p-2 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed focus:outline-none" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">Full Name *</label>
            <input type="text" required value={fullName} onChange={e => setFullName(e.target.value)} className="w-full border-b-2 border-zinc-200 dark:border-zinc-700 p-2 bg-transparent focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">WhatsApp Number *</label>
            <input type="tel" required value={phone} onChange={e => setPhone(e.target.value)} className="w-full border-b-2 border-zinc-200 dark:border-zinc-700 p-2 bg-transparent focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100" placeholder="+91 9999999999" />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase mb-1">Address *</label>
            <textarea required value={address} onChange={e => setAddress(e.target.value)} rows={2} className="w-full border-2 border-zinc-200 dark:border-zinc-700 p-2 bg-transparent focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100" />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Date of Joining *</label>
              <input type="date" required value={joinDate} onChange={e => setJoinDate(e.target.value)} className="w-full border-b-2 border-zinc-200 dark:border-zinc-700 p-2 bg-transparent focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase mb-1">Requested Batch *</label>
              <select required value={batchId} onChange={e => setBatchId(e.target.value)} className="w-full border-b-2 border-zinc-200 dark:border-zinc-700 p-2 bg-transparent focus:outline-none focus:border-zinc-900 dark:focus:border-zinc-100 uppercase text-sm font-bold">
                <option value="">-- Select Batch --</option>
                {batches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
          </div>
          
          <button type="submit" disabled={loading} className="mt-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-black uppercase py-4 border-2 border-transparent hover:-translate-y-0.5 transition-transform flex justify-center shadow-[4px_4px_0px_0px_rgba(161,161,170,1)] hover:shadow-[6px_6px_0px_0px_rgba(161,161,170,1)]">
            {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  );
}

