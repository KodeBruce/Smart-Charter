import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Files, Upload, MoreVertical, Trash2, Edit3, Search, FileText,
  ChevronRight, Calendar, PenTool, X, Download, Share2, Check, AlertCircle, Layout, Plus, Users, CheckCircle2, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, OperationType, handleFirestoreError, formatFirebaseDate } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { suggestESignFields, extractHumanReadableText } from '../services/geminiService';
import { storage } from '../lib/firebase';
import DocumentViewer from '../components/DocumentViewer';
import SignatureCanvas from 'react-signature-canvas';
import { Sparkles } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import ConfirmationModal from '../components/ConfirmationModal';

export interface AuditLogEntry {
  id: string;
  action: string;
  user: string;
  timestamp: any;
}

interface ESignDocument {
  id: string;
  name: string;
  status: 'Draft' | 'Pending' | 'Partially Signed' | 'Completed';
  uploadedAt: any;
  signers: { email: string; signed: boolean; signedAt?: any }[];
  content?: string;
  fileUrl?: string;
  fileType?: string;
  fields?: { type: 'signature' | 'date'; x: number; y: number; signerIndex: number; id: string }[];
  auditLog?: AuditLogEntry[];
}

export default function ESign() {
  const { theme } = useTheme();
  const [documents, setDocuments] = useState<ESignDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<ESignDocument | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [loadingStep, setLoadingStep] = useState<string | null>(null);
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const sigCanvas = useRef<SignatureCanvas | null>(null);
  const docContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload States
  const [newDoc, setNewDoc] = useState({ name: '', signers: [''], file: null as File | null });
  const [isDragging, setIsDragging] = useState(false);
  const [localFileUrl, setLocalFileUrl] = useState<string | null>(null);
  const [localFileType, setLocalFileType] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'document' | 'audit'>('document');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    showCancel?: boolean;
    confirmLabel?: string;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'esign_documents'),
      where('ownerId', '==', auth.currentUser.uid),
      orderBy('uploadedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() })) as ESignDocument[];
      setDocuments(docs);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'esign_documents');
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setNewDoc(prev => ({ ...prev, file, name: prev.name || file.name.replace(/\.[^/.]+$/, "") }));
      setIsUploadModalOpen(true);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewDoc(prev => ({ ...prev, file, name: prev.name || file.name.replace(/\.[^/.]+$/, "") }));
    }
  };

  const handleCreateDocument = async () => {
    if (!newDoc.name || !auth.currentUser || !newDoc.file) return;

    setLoadingStep("AI Mapping Fields...");
    try {
      // 1. Suggest fields and extract text using Gemini
      const [suggestions, cleanText] = await Promise.all([
        suggestESignFields(newDoc.file).catch(() => []), // Fallback to empty if AI fails
        extractHumanReadableText(newDoc.file).catch(() => "Text extraction unavailable.")
      ]);

      // 2. Create the Firestore document first to get an ID
      const docData = {
        name: newDoc.name,
        status: 'Draft',
        uploadedAt: serverTimestamp(),
        ownerId: auth.currentUser.uid,
        content: cleanText,
        fileType: newDoc.file.type,
        signers: newDoc.signers
          .filter(email => email.trim() !== '')
          .map(email => ({ email, signed: false })),
        fields: suggestions.map((s, i) => ({
          id: `suggested-${i}`,
          type: s.type,
          x: s.x,
          y: s.y,
          signerIndex: i % newDoc.signers.length // Cycle through signers
        })),
        auditLog: [{
          id: `audit-${Date.now()}`,
          action: 'Document Uploaded',
          user: auth.currentUser.email || 'System',
          timestamp: new Date().toISOString()
        }]
      };

      const docRef = await addDoc(collection(db, 'esign_documents'), docData);

      // 3. Upload the exact file to Firebase Storage with a timeout
      setLoadingStep("Uploading File to Vault...");
      try {
        const fileRef = ref(storage, `esign_documents/${docRef.id}/${newDoc.file.name}`);
        
        // 15 second timeout for storage upload in case rules are missing
        const uploadPromise = uploadBytes(fileRef, newDoc.file);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Upload timeout')), 15000));
        
        await Promise.race([uploadPromise, timeoutPromise]);
        const fileUrl = await getDownloadURL(fileRef);
        
        // 4. Update the Firestore doc with the file URL
        await updateDoc(docRef, { fileUrl });
      } catch (storageError) {
        // Storage upload failed (likely rules not set) — we'll use local blob URL instead
        console.warn("Firebase Storage not configured, using local blob URL:", storageError);
      }

      // Create local blob URL for immediate visual rendering (no Firebase Storage needed)
      if (newDoc.file) {
        const blobUrl = URL.createObjectURL(newDoc.file);
        setLocalFileUrl(blobUrl);
        setLocalFileType(newDoc.file.type);
      }

      setNewDoc({ name: '', signers: [''], file: null });
      setIsUploadModalOpen(false);
      setSelectedDoc(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'esign_documents');
    } finally {
      setLoadingStep(null);
    }
  };

  const handleAddField = async (e: React.MouseEvent) => {
    if (!selectedDoc || !isPreparing || !docContainerRef.current) return;

    const rect = docContainerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;

    const newField = {
      id: `field-${Date.now()}`,
      type: 'signature' as const,
      x: Math.round(x),
      y: Math.round(y),
      signerIndex: activeSignerIndex
    };

    const updatedFields = [...(selectedDoc.fields || []), newField];
    
    try {
      await updateDoc(doc(db, 'esign_documents', selectedDoc.id), {
        fields: updatedFields
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `esign_documents/${selectedDoc.id}`);
    }
  };

  const handleRemoveField = async (fieldId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedDoc) return;

    const updatedFields = (selectedDoc.fields || []).filter(f => f.id !== fieldId);
    try {
      await updateDoc(doc(db, 'esign_documents', selectedDoc.id), {
        fields: updatedFields
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `esign_documents/${selectedDoc.id}`);
    }
  };

  const handleStartWorkflow = async () => {
    if (!selectedDoc) return;
    try {
      await updateDoc(doc(db, 'esign_documents', selectedDoc.id), {
        status: 'Pending'
      });
      setIsPreparing(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `esign_documents/${selectedDoc.id}`);
    }
  };

  const handleSign = async () => {
    if (!selectedDoc || !signatureData) return;

    try {
      // Find current user's signer index
      const userEmail = auth.currentUser?.email;
      const signerIndex = selectedDoc.signers.findIndex(s => s.email === userEmail);
      
      if (signerIndex === -1) {
          setConfirmModal({
            isOpen: true,
            title: 'Access Denied',
            message: 'You are not listed as a signer for this document. Please contact the workspace owner.',
            onConfirm: () => {},
            showCancel: false,
            confirmLabel: 'Understood'
          });
        return;
      }

      const updatedSigners = [...selectedDoc.signers];
      updatedSigners[signerIndex] = {
        ...updatedSigners[signerIndex],
        signed: true,
        signedAt: new Date().toISOString()
      };

      const allSigned = updatedSigners.every(s => s.signed);
      const status = allSigned ? 'Completed' : 'Partially Signed';

      await updateDoc(doc(db, 'esign_documents', selectedDoc.id), {
        signers: updatedSigners,
        status,
        updatedAt: serverTimestamp()
      });

      setIsSigning(false);
      setSignatureData(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `esign_documents/${selectedDoc.id}`);
    }
  };

  const clearSignature = () => {
    sigCanvas.current?.clear();
    setSignatureData(null);
  };

  const saveSignature = () => {
    if (sigCanvas.current?.isEmpty()) return;
    setSignatureData(sigCanvas.current?.getTrimmedCanvas().toDataURL('image/png') || null);
  };

  const handleDeleteDocument = () => {
    if (!selectedDoc) return;
    setConfirmModal({
      isOpen: true,
      title: 'Delete Document',
      message: 'Are you sure you want to delete this document? This action cannot be undone.',
      isDestructive: true,
      confirmLabel: 'Delete Document',
      onConfirm: async () => {
        try {
          if (selectedDoc.fileUrl) {
            try {
              const fileRef = ref(storage, selectedDoc.fileUrl);
              await deleteObject(fileRef);
            } catch (storageError) {
              console.error("Failed to delete file from storage:", storageError);
            }
          }
          await deleteDoc(doc(db, 'esign_documents', selectedDoc.id));
          setSelectedDoc(null);
        } catch (error) {
          handleFirestoreError(error, OperationType.DELETE, `esign_documents/${selectedDoc.id}`);
        }
      }
    });
  };

  return (
    <div className="flex flex-col h-full bg-surface text-on-surface">
      {/* Header */}
      <header className="px-8 py-6 border-b border-outline/50 flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <PenTool className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">E-Signature Hub</h1>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-on-surface-variant">Secure digital signing workflow</p>
        </div>
        
        <button 
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl text-[10px] font-bold uppercase tracking-widest text-on-primary shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Upload className="h-3.5 w-3.5" />
          Prepare Document
        </button>
      </header>

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Document List */}
        <div className="w-full md:w-[400px] border-b md:border-b-0 md:border-r border-outline/50 bg-surface-container-low flex flex-col">
          <div className="p-6 border-b border-outline/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface-variant/70" />
              <input 
                type="text" 
                placeholder="Search signing requests..."
                className="w-full bg-surface-container-high border border-outline rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold outline-none focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-4">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                <p className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-widest">Loading vault...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center bg-surface-container rounded-[32px] border border-dashed border-outline">
                <Layout className="h-8 w-8 text-on-surface-variant/50 mx-auto mb-4" />
                <p className="text-xs font-bold text-on-surface-variant mb-2">No documents yet</p>
                <p className="text-[10px] text-on-surface-variant/70 uppercase tracking-widest leading-relaxed">Start your first signing workflow</p>
              </div>
            ) : (
              documents.map(docItem => (
                <button
                  key={docItem.id}
                  onClick={() => { setSelectedDoc(docItem); setLocalFileUrl(null); setLocalFileType(null); }}
                  className={`w-full p-4 rounded-2xl border transition-all text-left group ${
                    selectedDoc?.id === docItem.id 
                      ? 'bg-primary/10 border-primary shadow-lg shadow-primary/5' 
                      : 'bg-surface-container border-outline/50 hover:border-outline-variant'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className={`p-2 rounded-lg ${selectedDoc?.id === docItem.id ? 'bg-primary text-white' : 'bg-surface-container-high text-on-surface-variant group-hover:text-on-surface group-hover:bg-outline/50'}`}>
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.1em] ${
                      docItem.status === 'Completed' ? 'bg-secondary/20 text-secondary' :
                      docItem.status === 'Draft' ? 'bg-outline/50 text-on-surface-variant' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {docItem.status}
                    </div>
                  </div>
                  <h3 className="text-xs font-bold mb-1 group-hover:text-primary transition-colors">{docItem.name}</h3>
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[9px] font-bold text-on-surface-variant/70 uppercase tracking-wider mb-1.5">
                      <div className="flex items-center gap-1">
                        <Users className="h-3 w-3" />
                        {docItem.signers.filter(s => s.signed).length} OF {docItem.signers.length} SIGNED
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatFirebaseDate(docItem.uploadedAt)}
                      </div>
                    </div>
                    <div className="w-full bg-outline/30 rounded-full h-1.5 overflow-hidden">
                      <div 
                        className={`h-full rounded-full transition-all duration-500 ${
                          docItem.status === 'Completed' ? 'bg-secondary' : 
                          docItem.status === 'Draft' ? 'bg-outline' : 'bg-primary'
                        }`}
                        style={{ width: `${docItem.signers.length > 0 ? (docItem.signers.filter(s => s.signed).length / docItem.signers.length) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 bg-surface-container relative flex flex-col">
          {selectedDoc ? (
            <div className="h-full flex flex-col">
              <div className="p-6 border-b border-outline/50 flex justify-between items-center bg-surface">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold tracking-tight">{selectedDoc.name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${
                      selectedDoc.status === 'Completed' ? 'bg-secondary/20 text-secondary' :
                      selectedDoc.status === 'Draft' ? 'bg-outline/50 text-on-surface-variant' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {selectedDoc.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    {selectedDoc.signers.map((s, i) => (
                      <div 
                        key={`${selectedDoc.id}-signer-${i}`}
                        onClick={() => isPreparing && setActiveSignerIndex(i)}
                        className={`px-2 py-0.5 rounded border text-[8px] font-bold uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer ${
                          activeSignerIndex === i && isPreparing ? 'ring-1 ring-primary border-primary' : ''
                        } ${
                          s.signed ? 'bg-secondary/10 border-secondary/20 text-secondary' : 'bg-surface-container-high border-outline text-on-surface-variant'
                        }`}
                      >
                        {s.signed && <Check className="h-2 w-2" />}
                        {s.email}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  <div className="flex bg-surface-container-high rounded-lg p-1 mr-4">
                    <button 
                      onClick={() => setActiveTab('document')}
                      className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'document' ? 'bg-surface dark:bg-surface-container-high shadow-sm text-primary' : 'text-on-surface-variant/70 hover:text-on-surface'}`}
                    >
                      Document
                    </button>
                    <button 
                      onClick={() => setActiveTab('audit')}
                      className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-widest transition-all ${activeTab === 'audit' ? 'bg-surface dark:bg-surface-container-high shadow-sm text-primary' : 'text-on-surface-variant/70 hover:text-on-surface'}`}
                    >
                      Audit Trail
                    </button>
                  </div>
                  {selectedDoc.status === 'Draft' && !isPreparing && (
                    <button 
                      onClick={() => setIsPreparing(true)}
                      className="px-6 py-2 border border-outline hover:bg-surface-container-high rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      Prepare Fields
                    </button>
                  )}
                  {isPreparing && (
                    <button 
                      onClick={handleStartWorkflow}
                      className="px-6 py-2 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all"
                    >
                      Send for Signing
                    </button>
                  )}
                  {selectedDoc.signers.find(s => s.email === auth.currentUser?.email && !s.signed) && selectedDoc.status !== 'Draft' && (
                    <button 
                      onClick={() => setIsSigning(true)}
                      className="px-6 py-2 bg-secondary text-secondary-content rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-secondary/20 hover:scale-105 transition-all"
                    >
                      Sign Document
                    </button>
                  )}
                  <button className="p-2 hover:bg-surface-container-high text-on-surface-variant rounded-lg transition-all">
                    <Download className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={handleDeleteDocument}
                    className="p-2 hover:bg-error/10 text-on-surface-variant hover:text-error rounded-lg transition-all"
                    title="Delete Document"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-12 overflow-y-auto relative bg-surface-container/20 flex flex-col items-center">
                {activeTab === 'audit' ? (
                  <div className="w-full max-w-[800px] bg-surface dark:bg-surface-container border border-outline dark:border-outline/20 rounded-3xl p-10 shadow-2xl">
                    <h2 className="text-xl font-bold tracking-tight mb-8">Document Audit Trail</h2>
                    <div className="space-y-6 relative before:absolute before:inset-0 before:ml-5 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-outline before:to-transparent">
                      {(selectedDoc.auditLog || []).map((log, index) => (
                        <div key={log.id} className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                          <div className="flex items-center justify-center w-10 h-10 rounded-full border-4 border-white bg-primary text-white shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-md z-10">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="w-[calc(100%-4rem)] md:w-[calc(50%-2.5rem)] bg-surface-container p-4 rounded-xl border border-outline/50 shadow-sm">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-on-surface mb-1">{log.action}</span>
                              <span className="text-[10px] text-on-surface-variant font-medium">{log.user}</span>
                              <span className="text-[9px] text-on-surface-variant/70 uppercase tracking-widest mt-2 block">
                                {new Date(log.timestamp).toLocaleString()}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {isPreparing && (
                      <div className="mb-6 p-4 bg-primary/10 border border-primary/20 rounded-2xl flex items-center gap-4 text-primary max-w-[800px] w-full">
                        <Sparkles className="h-5 w-5" />
                        <div>
                          <p className="text-xs font-bold">Preparation Mode Active</p>
                          <p className="text-[10px] font-medium text-primary/60">Click on the document to place a signature/date field for <span className="font-bold">{selectedDoc.signers[activeSignerIndex].email}</span></p>
                        </div>
                        <button 
                          onClick={() => setIsPreparing(false)}
                          className="ml-auto text-[10px] font-bold uppercase tracking-widest hover:underline"
                        >
                          Cancel Prep
                        </button>
                      </div>
                    )}
                    
                    {/* Real Document Content Preview */}
                    <div 
                      ref={docContainerRef}
                      onClick={handleAddField}
                      className={`w-full max-w-[800px] relative mb-12 transition-all ${isPreparing ? 'cursor-crosshair ring-4 ring-primary/50 ring-offset-4 ring-offset-[#080808] rounded-lg overflow-hidden' : ''}`}
                    >
                      <DocumentViewer 
                        fileUrl={localFileUrl || selectedDoc.fileUrl} 
                        fileType={localFileType || selectedDoc.fileType} 
                        fileName={selectedDoc.name}
                        content={selectedDoc.content}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <div 
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => setIsUploadModalOpen(true)}
              className={`h-full flex flex-col items-center justify-center p-12 text-center transition-all ${isDragging ? 'bg-primary/5 border-2 border-dashed border-primary rounded-3xl m-4' : ''}`}
            >
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-6 transition-all ${isDragging ? 'bg-primary/20 scale-110 cursor-pointer' : 'bg-surface-container border border-outline/50 cursor-default'}`}>
                {isDragging ? (
                  <Upload className="h-8 w-8 text-primary" />
                ) : (
                  <Upload className="h-8 w-8 text-on-surface-variant/50" />
                )}
              </div>
              <h2 className={`text-xl font-bold tracking-tight mb-2 ${isDragging ? 'text-primary' : ''}`}>
                {isDragging ? 'Drop Document Here' : 'No Document Selected'}
              </h2>
              <p className="text-[10px] text-on-surface-variant/70 uppercase tracking-[0.2em] font-medium max-w-[240px] leading-relaxed">
                {isDragging ? 'Release to start preparation' : 'Drag & drop a document here or click to start.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-surface-container/80 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="bg-surface-container-low border border-outline rounded-[32px] p-8 w-[90%] md:w-full max-w-lg mx-4 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-on-surface mb-1">New Signing Request</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Upload your document to begin</p>
                </div>
                <button 
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full text-on-surface-variant/70 hover:text-on-surface transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant ml-1">Document Content</label>
                    <div 
                      onClick={() => fileInputRef.current?.click()}
                      className={`p-10 bg-primary/5 border border-dashed rounded-[32px] text-center cursor-pointer transition-all hover:bg-primary/10 ${newDoc.file ? 'border-primary' : 'border-primary/20'}`}
                    >
                      <input 
                        type="file" 
                        ref={fileInputRef}
                        accept=".pdf,.doc,.docx,.txt"
                        className="hidden" 
                        onChange={handleFileChange}
                      />
                      <div className={`w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 ${loadingStep ? 'animate-pulse' : ''}`}>
                        <Upload className={`h-6 w-6 text-primary ${loadingStep ? 'animate-bounce' : ''}`} />
                      </div>
                      <p className="text-xs font-bold text-primary mb-1">
                        {loadingStep ? loadingStep : newDoc.file ? newDoc.file.name : 'Click to upload document'}
                      </p>
                      <p className="text-[10px] font-medium text-primary/40 uppercase tracking-widest leading-relaxed">
                        {loadingStep ? 'Please wait...' : 'PDF, Word, or TXT (Max 10MB)'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-on-surface-variant ml-1">Document Title</label>
                    <input 
                      type="text" 
                      value={newDoc.name}
                      onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                      placeholder="e.g. Master Services Agreement"
                      className="w-full bg-surface-container-high border border-outline rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all text-on-surface"
                    />
                  </div>
                </div>



                <button 
                  onClick={handleCreateDocument}
                  disabled={!newDoc.name || !newDoc.file || !!loadingStep}
                  className="w-full py-4 bg-primary text-on-primary rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-3"
                >
                  {!!loadingStep && <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />}
                  {loadingStep ? loadingStep : 'Create & Prepare Workflow'}
                </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {isSigning && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-surface-container/80 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="bg-surface-container border border-outline rounded-[32px] p-8 w-[90%] md:w-full max-w-lg mx-4 shadow-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-on-surface mb-1">Affix Signature</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">Draw or upload your signature</p>
                </div>
                <button 
                  onClick={() => setIsSigning(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full text-on-surface-variant/70 hover:text-on-surface transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                 <div className="bg-surface dark:bg-surface-container-highest rounded-2xl p-4 border-2 border-primary/20 relative">
                   <SignatureCanvas 
                     ref={sigCanvas}
                     onEnd={saveSignature}
                     penColor={theme === 'dark' ? '#FFFFFF' : '#1A1A1A'}
                     canvasProps={{
                       className: "w-full h-48 cursor-crosshair rounded-xl",
                       style: { border: '1px dashed #eee' }
                     }}
                   />
                   <div className="absolute bottom-6 right-6 flex gap-2">
                      <button 
                        onClick={clearSignature}
                        className="p-2 bg-surface-container/5 hover:bg-surface-container/10 text-black/40 rounded-lg transition-all"
                        title="Clear Signature"
                      >
                         <AlertCircle className="h-4 w-4" />
                      </button>
                   </div>
                 </div>

                 <div className="flex items-center gap-3 p-4 bg-surface-container-high rounded-2xl border border-outline">
                    <CheckCircle2 className="h-5 w-5 text-secondary" />
                    <div>
                       <p className="text-[11px] font-bold tracking-tight text-on-surface/80">Electronic Record Consent</p>
                       <p className="text-[9px] text-on-surface-variant/70 uppercase tracking-widest leading-none mt-1">I agree to use electronic records and signatures</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setIsSigning(false)}
                      className="py-4 bg-surface-container-high text-on-surface-variant rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-outline/50 transition-all"
                    >
                       Cancel
                    </button>
                    <button 
                      onClick={handleSign}
                      disabled={!signatureData}
                      className="py-4 bg-secondary text-secondary-content rounded-2xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-secondary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50"
                    >
                       Confirm Signature
                    </button>
                 </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        showCancel={confirmModal.showCancel}
        confirmLabel={confirmModal.confirmLabel}
      />
    </div>
  );
}
