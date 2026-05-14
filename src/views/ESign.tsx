import React, { useState, useEffect, useRef } from 'react';
import { 
  MessageSquare, Files, Upload, MoreVertical, Trash2, Edit3, Search, FileText,
  ChevronRight, Calendar, PenTool, X, Download, Share2, Check, AlertCircle, Layout, Plus, Users, CheckCircle2, Clock
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { db, auth, OperationType, handleFirestoreError, formatFirebaseDate } from '../lib/firebase';
import { collection, onSnapshot, query, where, orderBy, addDoc, serverTimestamp, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { suggestESignFields, extractHumanReadableText } from '../services/geminiService';
import SignatureCanvas from 'react-signature-canvas';
import { Sparkles } from 'lucide-react';

interface ESignDocument {
  id: string;
  name: string;
  status: 'Draft' | 'Pending' | 'Partially Signed' | 'Completed';
  uploadedAt: any;
  signers: { email: string; signed: boolean; signedAt?: any }[];
  content?: string;
  fields?: { type: 'signature' | 'date'; x: number; y: number; signerIndex: number; id: string }[];
}

export default function ESign() {
  const [documents, setDocuments] = useState<ESignDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState<ESignDocument | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [activeSignerIndex, setActiveSignerIndex] = useState(0);
  const [signatureData, setSignatureData] = useState<string | null>(null);
  const sigCanvas = useRef<SignatureCanvas | null>(null);
  const docContainerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Upload States
  const [newDoc, setNewDoc] = useState({ name: '', signers: [''], file: null as File | null });

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setNewDoc(prev => ({ ...prev, file, name: prev.name || file.name.replace(/\.[^/.]+$/, "") }));
    }
  };

  const handleCreateDocument = async () => {
    if (!newDoc.name || !auth.currentUser || !newDoc.file) return;

    setIsScanning(true);
    try {
      // 1. Suggest fields and extract text using Gemini
      const [suggestions, cleanText] = await Promise.all([
        suggestESignFields(newDoc.file),
        extractHumanReadableText(newDoc.file)
      ]);

      const docData = {
        name: newDoc.name,
        status: 'Draft',
        uploadedAt: serverTimestamp(),
        ownerId: auth.currentUser.uid,
        content: cleanText,
        signers: newDoc.signers
          .filter(email => email.trim() !== '')
          .map(email => ({ email, signed: false })),
        fields: suggestions.map((s, i) => ({
          id: `suggested-${i}`,
          type: s.type,
          x: s.x,
          y: s.y,
          signerIndex: i % newDoc.signers.length // Cycle through signers
        }))
      };

      await addDoc(collection(db, 'esign_documents'), docData);
      setNewDoc({ name: '', signers: [''], file: null });
      setIsUploadModalOpen(false);
      setSelectedDoc(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'esign_documents');
    } finally {
      setIsScanning(false);
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
        alert("You are not listed as a signer for this document.");
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

  return (
    <div className="flex flex-col h-full bg-[#080808] text-white">
      {/* Header */}
      <header className="px-8 py-6 border-b border-white/5 flex justify-between items-end">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <div className="p-2 bg-primary/10 rounded-lg">
              <PenTool className="h-4 w-4 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">E-Signature Hub</h1>
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-black text-white/30">Secure digital signing workflow</p>
        </div>
        
        <button 
          onClick={() => setIsUploadModalOpen(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-primary rounded-xl text-[10px] font-bold uppercase tracking-widest text-white shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
        >
          <Upload className="h-3.5 w-3.5" />
          Prepare Document
        </button>
      </header>

      <div className="flex-1 flex overflow-hidden">
        {/* Document List */}
        <div className="w-[400px] border-r border-white/5 bg-[#0D0D0D] flex flex-col">
          <div className="p-6 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
              <input 
                type="text" 
                placeholder="Search signing requests..."
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-4 py-2 text-[10px] font-bold outline-none focus:border-primary transition-all"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-3">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center h-48 gap-4">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent animate-spin rounded-full" />
                <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest">Loading vault...</p>
              </div>
            ) : documents.length === 0 ? (
              <div className="p-8 text-center bg-white/[0.02] rounded-[32px] border border-dashed border-white/10">
                <Layout className="h-8 w-8 text-white/10 mx-auto mb-4" />
                <p className="text-xs font-bold text-white/40 mb-2">No documents yet</p>
                <p className="text-[10px] text-white/20 uppercase tracking-widest leading-relaxed">Start your first signing workflow</p>
              </div>
            ) : (
              documents.map(docItem => (
                <button
                  key={docItem.id}
                  onClick={() => setSelectedDoc(docItem)}
                  className={`w-full p-4 rounded-2xl border transition-all text-left group ${
                    selectedDoc?.id === docItem.id 
                      ? 'bg-primary/10 border-primary shadow-lg shadow-primary/5' 
                      : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className={`p-2 rounded-lg ${selectedDoc?.id === docItem.id ? 'bg-primary text-white' : 'bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10'}`}>
                      <FileText className="h-3.5 w-3.5" />
                    </div>
                    <div className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase tracking-[0.1em] ${
                      docItem.status === 'Completed' ? 'bg-secondary/20 text-secondary' :
                      docItem.status === 'Draft' ? 'bg-white/10 text-white/40' :
                      'bg-orange-500/20 text-orange-400'
                    }`}>
                      {docItem.status}
                    </div>
                  </div>
                  <h3 className="text-xs font-bold mb-1 group-hover:text-primary transition-colors">{docItem.name}</h3>
                  <div className="flex items-center gap-3 text-[9px] font-bold text-white/20 uppercase tracking-wider">
                    <div className="flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {docItem.signers.filter(s => s.signed).length}/{docItem.signers.length} Signed
                    </div>
                    <span>•</span>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatFirebaseDate(docItem.uploadedAt)}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Workspace */}
        <div className="flex-1 bg-black relative flex flex-col">
          {selectedDoc ? (
            <div className="h-full flex flex-col">
              <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#080808]">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold tracking-tight">{selectedDoc.name}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-[7px] font-black uppercase tracking-widest ${
                      selectedDoc.status === 'Completed' ? 'bg-secondary/20 text-secondary' :
                      selectedDoc.status === 'Draft' ? 'bg-white/10 text-white/40' :
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
                          s.signed ? 'bg-secondary/10 border-secondary/20 text-secondary' : 'bg-white/5 border-white/10 text-white/40'
                        }`}
                      >
                        {s.signed && <Check className="h-2 w-2" />}
                        {s.email}
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-3">
                  {selectedDoc.status === 'Draft' && !isPreparing && (
                    <button 
                      onClick={() => setIsPreparing(true)}
                      className="px-6 py-2 border border-white/10 hover:bg-white/5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                    >
                      Prepare Fields
                    </button>
                  )}
                  {isPreparing && (
                    <button 
                      onClick={handleStartWorkflow}
                      className="px-6 py-2 bg-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-xl shadow-primary/20 hover:scale-105 transition-all"
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
                  <button className="p-2 hover:bg-white/5 text-white/30 rounded-lg transition-all">
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <div className="flex-1 p-12 overflow-y-auto relative bg-surface-container/20 flex flex-col items-center">
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
                  className={`w-full max-w-[800px] min-h-[1131px] bg-white text-black p-20 shadow-2xl relative mb-12 transition-all ${isPreparing ? 'cursor-crosshair ring-2 ring-primary/40 ring-offset-4 ring-offset-black' : ''}`}
                >
                  <div className="flex justify-between items-start mb-20 border-b border-black/5 pb-10">
                    <div>
                      <h1 className="text-3xl font-serif font-black tracking-tighter mb-2 italic uppercase">{selectedDoc.name}</h1>
                      <div className="text-[10px] font-bold text-black/40 uppercase tracking-[0.2em]">Ref: DS-{selectedDoc.id.slice(0, 8)}</div>
                    </div>
                    <div className="p-4 bg-black/5 rounded-xl">
                      <Layout className="h-6 w-6 text-black/20" />
                    </div>
                  </div>
                  
                  <div className="space-y-6 text-[11px] leading-[1.8] text-black/80 font-sans whitespace-pre-wrap">
                    {selectedDoc.content || "Document content not available for preview."}
                  </div>

                  {/* Signature Fields Overlay */}
                  {selectedDoc.fields?.map(field => {
                    const signer = selectedDoc.signers[field.signerIndex];
                    return (
                      <div 
                        key={field.id}
                        className="absolute flex flex-col items-center"
                        style={{ left: `${field.x}%`, top: `${field.y}%` }}
                      >
                        <div className={`w-40 h-16 border-b-2 border-black/20 flex flex-col items-center justify-end pb-2 group relative transition-all ${!signer.signed && signer.email === auth.currentUser?.email && selectedDoc.status !== 'Draft' ? 'bg-primary/5 border-primary/40 cursor-pointer' : ''}`}>
                          {signer.signed ? (
                            <div className="flex flex-col items-center">
                              <PenTool className="h-6 w-6 text-primary/40 mb-1" />
                              <span className="text-[10px] font-serif italic font-bold text-primary">{signer.email.split('@')[0]}</span>
                            </div>
                          ) : (
                            <div className="flex flex-col items-center">
                              <span className="text-[9px] font-bold text-black/20 uppercase tracking-widest">{field.type === 'signature' ? 'Signature' : 'Date'}</span>
                              <span className="text-[7px] text-black/10 font-bold">{signer.email.split('@')[0]}</span>
                            </div>
                          )}
                          {!signer.signed && signer.email === auth.currentUser?.email && selectedDoc.status !== 'Draft' && (
                             <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center">
                                <span className="text-[8px] font-bold text-primary uppercase tracking-widest">Sign Now</span>
                             </div>
                          )}
                          {isPreparing && (
                            <button 
                              onClick={(e) => handleRemoveField(field.id, e)}
                              className="absolute -top-2 -right-2 w-5 h-5 bg-error text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all shadow-lg"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        <span className="text-[8px] font-bold text-black/40 uppercase tracking-widest mt-1.5">{signer.email}</span>
                        {field.type === 'date' && signer.signed && (
                          <span className="text-[8px] font-bold text-black/40 uppercase tracking-widest mt-1">{formatFirebaseDate(signer.signedAt)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-12 text-center">
              <div className="w-20 h-20 bg-white/[0.02] border border-white/5 rounded-full flex items-center justify-center mb-6">
                <PenTool className="h-8 w-8 text-white/10" />
              </div>
              <h2 className="text-xl font-bold tracking-tight mb-2">No Document Selected</h2>
              <p className="text-[10px] text-white/20 uppercase tracking-[0.2em] font-medium max-w-[240px] leading-relaxed">
                Select a signing request from the sidebar or upload a new document to start.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="bg-[#0D0D0D] border border-white/10 rounded-[32px] p-8 w-full max-w-lg shadow-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white mb-1">New Signing Request</h2>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Upload and invite stakeholders</p>
                </div>
                <button 
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

                <div className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Document Content</label>
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
                      <div className={`w-12 h-12 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4 ${isScanning ? 'animate-pulse' : ''}`}>
                        <Upload className={`h-6 w-6 text-primary ${isScanning ? 'animate-bounce' : ''}`} />
                      </div>
                      <p className="text-xs font-bold text-primary mb-1">
                        {isScanning ? 'Analyzing with Intelligence...' : newDoc.file ? newDoc.file.name : 'Click to upload document'}
                      </p>
                      <p className="text-[10px] font-medium text-primary/40 uppercase tracking-widest leading-relaxed">
                        {isScanning ? 'AI is identifying signature zones' : 'PDF, Word, or TXT (Max 10MB)'}
                      </p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Document Title</label>
                    <input 
                      type="text" 
                      value={newDoc.name}
                      onChange={(e) => setNewDoc({ ...newDoc, name: e.target.value })}
                      placeholder="e.g. Master Services Agreement"
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-sm font-bold outline-none focus:border-primary transition-all text-white"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40 ml-1">Invited Stakeholders</label>
                    <button 
                      onClick={() => setNewDoc({ ...newDoc, signers: [...newDoc.signers, ''] })}
                      className="text-[9px] font-bold text-primary uppercase tracking-widest flex items-center gap-1 hover:brightness-110"
                    >
                      <Plus className="h-3 w-3" />
                      Add Signer
                    </button>
                  </div>
                  
                  <div className="space-y-3 max-h-40 overflow-y-auto custom-scrollbar pr-2">
                    {newDoc.signers.map((signer, index) => (
                      <div key={`new-signer-${index}`} className="flex gap-2">
                        <div className="flex-1 relative">
                          <Users className="absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
                          <input 
                            type="email" 
                            value={signer}
                            onChange={(e) => {
                              const updated = [...newDoc.signers];
                              updated[index] = e.target.value;
                              setNewDoc({ ...newDoc, signers: updated });
                            }}
                            placeholder="signer@company.com"
                            className="w-full bg-white/5 border border-white/10 rounded-xl pl-11 pr-4 py-3 text-[11px] font-bold outline-none focus:border-primary transition-all text-white"
                          />
                        </div>
                        {newDoc.signers.length > 1 && (
                          <button 
                            onClick={() => {
                              const updated = newDoc.signers.filter((_, i) => i !== index);
                              setNewDoc({ ...newDoc, signers: updated });
                            }}
                            className="p-3 bg-white/5 hover:bg-error/10 text-white/20 hover:text-error rounded-xl transition-all"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-6 bg-primary/5 border border-dashed border-primary/20 rounded-[24px] text-center">
                   <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Upload className="h-5 w-5 text-primary" />
                   </div>
                   <p className="text-[11px] font-bold text-primary tracking-tight mb-1">Click or drag PDF here</p>
                   <p className="text-[9px] font-medium text-primary/40 uppercase tracking-widest">Max file size: 10MB</p>
                </div>

                <button 
                  onClick={handleCreateDocument}
                  disabled={!newDoc.name || !newDoc.file || newDoc.signers.every(s => s.trim() === '') || isScanning}
                  className="w-full py-4 bg-primary text-white rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-3"
                >
                  {isScanning && <div className="w-4 h-4 border-2 border-white border-t-transparent animate-spin rounded-full" />}
                  {isScanning ? 'Mapping Intelligent Fields...' : 'Create & Prepare Workflow'}
                </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Signature Modal */}
      <AnimatePresence>
        {isSigning && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95, y: 20 }}
               animate={{ opacity: 1, scale: 1, y: 0 }}
               exit={{ opacity: 0, scale: 0.95, y: 20 }}
               className="bg-[#111111] border border-white/10 rounded-[32px] p-8 w-full max-w-lg shadow-2xl"
            >
              <div className="flex justify-between items-start mb-8">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-white mb-1">Affix Signature</h2>
                  <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest">Draw or upload your signature</p>
                </div>
                <button 
                  onClick={() => setIsSigning(false)}
                  className="p-2 hover:bg-white/5 rounded-full text-white/20 hover:text-white transition-all"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                 <div className="bg-white rounded-2xl p-4 border-2 border-primary/20 relative">
                   <SignatureCanvas 
                     ref={sigCanvas}
                     onEnd={saveSignature}
                     penColor="black"
                     canvasProps={{
                       className: "w-full h-48 cursor-crosshair rounded-xl",
                       style: { border: '1px dashed #eee' }
                     }}
                   />
                   <div className="absolute bottom-6 right-6 flex gap-2">
                      <button 
                        onClick={clearSignature}
                        className="p-2 bg-black/5 hover:bg-black/10 text-black/40 rounded-lg transition-all"
                        title="Clear Signature"
                      >
                         <AlertCircle className="h-4 w-4" />
                      </button>
                   </div>
                 </div>

                 <div className="flex items-center gap-3 p-4 bg-white/5 rounded-2xl border border-white/10">
                    <CheckCircle2 className="h-5 w-5 text-secondary" />
                    <div>
                       <p className="text-[11px] font-bold tracking-tight text-white/80">Electronic Record Consent</p>
                       <p className="text-[9px] text-white/20 uppercase tracking-widest leading-none mt-1">I agree to use electronic records and signatures</p>
                    </div>
                 </div>

                 <div className="grid grid-cols-2 gap-4">
                    <button 
                      onClick={() => setIsSigning(false)}
                      className="py-4 bg-white/5 text-white/40 rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
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
    </div>
  );
}
