import React, { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';

// Use CDN for the worker to avoid Vite build/import issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

interface DocumentViewerProps {
  fileUrl?: string;
  fileType?: string;
  fileName?: string; // Additional fallback for type detection
  content?: string; // Fallback text content
  children?: React.ReactNode; // For overlaying signature fields
}

export default function DocumentViewer({ fileUrl, fileType, fileName, content, children }: DocumentViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRendering, setIsRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pdfCanvases, setPdfCanvases] = useState<string[]>([]); // data URLs for each PDF page
  const [wordHtml, setWordHtml] = useState<string | null>(null);

  const isPdf = fileType === 'application/pdf' || 
                fileType === 'application/octet-stream' || 
                (fileUrl && fileUrl.toLowerCase().includes('.pdf')) ||
                (fileName && fileName.toLowerCase().includes('.pdf'));
  
  const isWordDoc =
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType === 'application/msword' ||
    (fileUrl && (fileUrl.toLowerCase().includes('.docx') || fileUrl.toLowerCase().includes('.doc'))) ||
    (fileName && (fileName.toLowerCase().includes('.docx') || fileName.toLowerCase().includes('.doc')));

  // Render PDF from blob URL
  useEffect(() => {
    if (!isPdf || !fileUrl) return;
    setIsRendering(true);
    setError(null);
    setPdfCanvases([]);

    let cancelled = false;
    const loadingTask = pdfjsLib.getDocument(fileUrl);

    loadingTask.promise
      .then(async (pdf) => {
        const pages: string[] = [];
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNum);
          const viewport = page.getViewport({ scale: 1.8 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;

          await page.render({ canvasContext: ctx, viewport } as any).promise;
          pages.push(canvas.toDataURL());
        }
        if (!cancelled) {
          setPdfCanvases(pages);
          setIsRendering(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          console.error('PDF render error:', err);
          setError(err.message || 'Failed to render PDF');
          setIsRendering(false);
        }
      });

    return () => { cancelled = true; loadingTask.destroy(); };
  }, [fileUrl, isPdf]);

  // Convert Word doc blob URL → HTML using mammoth
  useEffect(() => {
    if (!isWordDoc || !fileUrl) return;
    setIsRendering(true);
    setError(null);
    setWordHtml(null);

    fetch(fileUrl)
      .then((r) => r.arrayBuffer())
      .then((buf) => mammoth.convertToHtml({ arrayBuffer: buf }))
      .then(({ value }) => {
        setWordHtml(value);
        setIsRendering(false);
      })
      .catch((err) => {
        console.error('Word render error:', err);
        setError(err.message || 'Failed to render Word document');
        setIsRendering(false);
      });
  }, [fileUrl, isWordDoc]);

  // Loading spinner
  if (isRendering) {
    return (
      <div className="w-full max-w-[800px] mx-auto bg-white min-h-[800px] flex items-center justify-center shadow-2xl">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent animate-spin rounded-full" />
          <p className="text-sm font-semibold text-gray-500">Rendering document…</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="w-full max-w-[800px] mx-auto bg-white min-h-[200px] flex items-center justify-center p-8 shadow-2xl">
        <div className="text-center text-red-600">
          <p className="font-bold mb-1">Failed to render document</p>
          <p className="text-xs">{error}</p>
        </div>
      </div>
    );
  }

  // PDF — render all pages as images with signature overlay
  if (isPdf && pdfCanvases.length > 0) {
    return (
      <div className="relative w-full max-w-[800px] mx-auto shadow-2xl bg-white">
        {pdfCanvases.map((dataUrl, i) => (
          <img key={i} src={dataUrl} alt={`Page ${i + 1}`} className="w-full block" />
        ))}
        {/* Signature field overlay covers entire document */}
        <div className="absolute inset-0 z-10">
          {children}
        </div>
      </div>
    );
  }

  // Word doc — render as styled HTML
  if (isWordDoc && wordHtml) {
    return (
      <div className="relative w-full max-w-[800px] mx-auto bg-white shadow-2xl">
        <div
          className="p-16 prose prose-sm max-w-none text-black"
          dangerouslySetInnerHTML={{ __html: wordHtml }}
          style={{ fontFamily: 'Georgia, serif', lineHeight: '1.8', fontSize: '13px' }}
        />
        <div className="absolute inset-0 z-10 pointer-events-none">
          {children}
        </div>
      </div>
    );
  }

  // Fallback — text content view
  return (
    <div className="relative w-full max-w-[800px] bg-white text-black shadow-2xl mx-auto overflow-hidden min-h-[800px]">
      <div className="relative w-full h-full p-20">
        <div className="flex justify-between items-start mb-12 border-b border-black/10 pb-6">
          <div>
            <h1 className="text-2xl font-serif font-black tracking-tighter mb-2 uppercase">Document Preview</h1>
            <div className="text-[10px] font-bold text-black/40 uppercase tracking-[0.2em]">Text Extracted View</div>
          </div>
        </div>

        {content === 'Text extraction unavailable.' || !content ? (
          <div className="bg-red-50 text-red-800 p-6 rounded-2xl border border-red-200 mt-8">
            <h3 className="text-lg font-bold mb-2">No Document Content</h3>
            <p className="text-sm mb-4 leading-relaxed">
              The document could not be loaded. Please try re-uploading the file.
            </p>
          </div>
        ) : (
          <div className="space-y-6 text-[12px] leading-[2] text-black/80 font-sans whitespace-pre-wrap break-words">
            {content}
          </div>
        )}

        <div className="absolute inset-0 z-10 pointer-events-none">
          {children}
        </div>
      </div>
    </div>
  );
}
