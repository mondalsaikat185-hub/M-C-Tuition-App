import React, { useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Loader2, Maximize2, Minimize2, ZoomIn, ZoomOut, Download, AlertCircle } from 'lucide-react';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Ensure the worker is set up for react-pdf
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

interface SecurePDFViewerProps {
  url: string;
  trackingId?: string;
  studentName?: string;
  onClose: () => void;
}

export function SecurePDFViewer({ url, trackingId, studentName, onClose }: SecurePDFViewerProps) {
  const [numPages, setNumPages] = useState<number>();
  const [pageNumber, setPageNumber] = useState<number>(1);
  const [scale, setScale] = useState(1.2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
  }

  // Generate repeating watermark text
  const watermarkText = `${studentName || 'Student'} - ${trackingId || 'Confidential'}   `.repeat(10);

  return (
    <div className={`fixed inset-0 z-50 bg-zinc-900 flex flex-col ${isFullscreen ? '' : 'sm:p-8'}`}>
      {/* Top Bar */}
      <div className="bg-zinc-950 text-white p-4 flex justify-between items-center z-20 border-b border-zinc-800 shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onClose} className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-sm font-bold uppercase transition-colors">
            Close
          </button>
          <div className="text-sm font-bold opacity-50 hidden sm:block">
            Protected Mode Active
          </div>
        </div>
        
        <div className="flex items-center gap-2">
           <button onClick={() => setPageNumber(p => Math.max(1, p - 1))} disabled={pageNumber <= 1} className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50" title="Previous Page">
             ◀
           </button>
           <span className="text-sm font-mono px-2 hidden sm:inline">{pageNumber} / {numPages || '?'}</span>
           <button onClick={() => setPageNumber(p => Math.min(numPages || 1, p + 1))} disabled={pageNumber >= (numPages || 1)} className="p-2 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50" title="Next Page">
             ▶
           </button>
           <div className="w-px h-8 bg-zinc-800 mx-2"></div>
           <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-2 bg-zinc-800 hover:bg-zinc-700" title="Zoom Out">
             <ZoomOut className="w-5 h-5" />
           </button>
           <span className="text-sm font-mono px-2 hidden sm:inline">{Math.round(scale * 100)}%</span>
           <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-2 bg-zinc-800 hover:bg-zinc-700" title="Zoom In">
             <ZoomIn className="w-5 h-5" />
           </button>
           <div className="w-px h-8 bg-zinc-800 mx-2"></div>
           <button onClick={() => setIsFullscreen(!isFullscreen)} className="p-2 bg-zinc-800 hover:bg-zinc-700">
             {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
           </button>
        </div>
      </div>

      {/* Viewing Area */}
      <div className="flex-1 overflow-auto relative bg-zinc-800 flex justify-center p-4">
        {/* Dynamic Watermark Overlay (Pointer Events None so it doesn't block scrolling) */}
        <div className="fixed inset-0 pointer-events-none z-10 overflow-hidden opacity-10 mix-blend-overlay flex flex-col justify-center gap-32 transform -rotate-12 scale-150">
           {Array.from({ length: 20 }).map((_, i) => (
             <div key={i} className="text-4xl sm:text-6xl font-black uppercase text-white whitespace-nowrap">
               {watermarkText}
             </div>
           ))}
        </div>

        {error ? (
           <div className="flex flex-col items-center justify-center text-red-500 h-full p-8 max-w-md text-center">
              <AlertCircle className="w-12 h-12 mb-4" />
              <p className="font-bold mb-2">Could not load the secure PDF.</p>
              <p className="text-sm opacity-80">{error.message}</p>
              <p className="text-xs mt-4 p-4 bg-zinc-900 border border-red-900 rounded">
                This commonly happens if Firebase Storage rules are blocking access, or CORS is not enabled.
              </p>
           </div>
        ) : (
          <div onContextMenu={e => e.preventDefault()} className="shadow-2xl relative z-0">
            <Document
              file={url}
              onLoadSuccess={onDocumentLoadSuccess}
              onLoadError={setError}
              loading={
                <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin mb-4" />
                  <p className="font-bold text-sm uppercase max-w-[200px] text-center">Decrypting & Loading Secure Document...</p>
                </div>
              }
            >
              <div className="mb-4 bg-white">
                <Page 
                  pageNumber={pageNumber} 
                  scale={scale} 
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                  className="max-w-full"
                />
              </div>
            </Document>
          </div>
        )}
      </div>
    </div>
  );
}
