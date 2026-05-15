import { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      // console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  const close = () => {
    setOfflineReady(false);
    setNeedRefresh(false);
  };

  return (
    <div className="empty:hidden">
      {(offlineReady || needRefresh) && (
        <div className="fixed bottom-4 right-4 z-50 bg-white border-4 border-black p-4 shadow-[8px_8px_0px_0px_black] text-black">
          <div className="mb-2">
            {offlineReady ? (
              <span className="font-bold">অ্যাপটি অফলাইনে ব্যবহারের জন্য প্রস্তুত।</span>
            ) : (
              <span className="font-bold">নতুন আপডেট পাওয়া গেছে!</span>
            )}
          </div>
          {needRefresh && (
            <button
              onClick={() => updateServiceWorker(true)}
              className="mr-2 px-3 py-1 bg-yellow-400 border-2 border-black font-bold shadow-[2px_2px_0px_0px_black] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all"
            >
              Update / Reload
            </button>
          )}
          <button
            onClick={() => close()}
            className="px-3 py-1 bg-white border-2 border-black font-bold shadow-[2px_2px_0px_0px_black] active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all"
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
