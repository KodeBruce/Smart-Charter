import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, Plus, Mail, Share2, 
  Send, PenTool, FileText, CheckCircle2,
  Clock, Shield, Sparkles, X, Maximize2, Minimize2,
  ChevronRight, Download, Users,
  MessageSquare, Files, Upload, MoreVertical, Trash2, Edit3, RefreshCw
} from 'lucide-react';

import { db, auth, OperationType, handleFirestoreError, formatFirebaseDate } from '../lib/firebase';
import { doc, onSnapshot, query, collection, where, setDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { generateText, analyzeContract } from '../services/geminiService';

interface AuditLog {
  id: string;
  userId: string;
  userName: string;
  action: string;
  timestamp: any;
  details?: string;
}

interface ProjectDoc {
  id: string;
  name: string;
  status: 'Drafting' | 'Review Required' | 'Review Complete' | 'Signed' | 'Generated';
  type: string;
  lastEdited: any;
  content?: string;
  signers?: { email: string; status: 'Pending' | 'Signed' }[];
  auditLogs: AuditLog[];
}

export default function ProjectWorkspace() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'docs' | 'drafting' | 'sharing'>('docs');
  const [project, setProject] = useState<any>(null);
  const [docs, setDocs] = useState<ProjectDoc[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    if (!id || !auth.currentUser) return;

    // Fetch Project
    const unsubscribeProject = onSnapshot(doc(db, 'projects', id), (docSnap) => {
      if (docSnap.exists()) {
        setProject({ id: docSnap.id, ...docSnap.data() });
      } else {
        navigate('/projects');
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `projects/${id}`);
    });

    // Fetch Documents
    const q = query(
      collection(db, 'contracts'),
      where('projectId', '==', id),
      where('ownerId', '==', auth.currentUser.uid)
    );

    const unsubscribeDocs = onSnapshot(q, (snapshot) => {
      const docsData = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          name: data.name,
          status: data.status,
          type: data.type || 'Agreement',
          lastEdited: data.updatedAt,
          content: data.content,
          signers: data.signers || [],
          auditLogs: data.auditLogs || []
        };
      }) as ProjectDoc[];
      setDocs(docsData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'contracts');
    });

    return () => {
      unsubscribeProject();
      unsubscribeDocs();
    };
  }, [id, auth.currentUser]);

  const totalPages = Math.ceil(docs.length / pageSize);
  const paginatedDocs = docs.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [id]);

  const [editingDoc, setEditingDoc] = useState<ProjectDoc | null>(null);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newDocName, setNewDocName] = useState('');
  const [newDocType, setNewDocType] = useState('Agreement');
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);

  // Phase 5: Smart Starters
  const [smartStarters, setSmartStarters] = useState<string[]>([]);
  const [isLoadingStarters, setIsLoadingStarters] = useState(false);

  const fetchStarters = useCallback(async () => {
    if (!docs.length || !auth.currentUser) return;
    setIsLoadingStarters(true);
    try {
      const token = await auth.currentUser.getIdToken();
      const latestDoc = docs[0];
      const res = await fetch('/api/gemini/starters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          documentName: latestDoc.name,
          documentType: latestDoc.type || 'Legal Agreement',
          summary: latestDoc.content?.slice(0, 500) || ''
        })
      });
      const data = await res.json();
      if (data.starters) setSmartStarters(data.starters);
    } catch (e) {
      console.error('[Smart Starters Error]:', e);
    } finally {
      setIsLoadingStarters(false);
    }
  }, [docs]);

  useEffect(() => {
    if (docs.length > 0 && smartStarters.length === 0) {
      fetchStarters();
    }
  }, [docs]);


  const LEGAL_TEMPLATES = [
    {
      name: 'Service Level Agreement (SLA)',
      type: 'Agreement',
      content: `SERVICE LEVEL AGREEMENT (SLA)

1. INTRODUCTION
This Service Level Agreement ("SLA") is entered into as of [DATE] by and between [COMPANY NAME] ("Provider") and [CLIENT NAME] ("Client").

2. SERVICE SCOPE
Provider shall provide the following services: [DESCRIBE SERVICES].

3. PERFORMANCE STANDARDS
3.1 Availability: Provider guarantees a 99.9% uptime for the hosted services.
3.2 Support Response Times:
- Critical Issues: 2 hours
- Standard Issues: 24 hours
- Information Requests: 48 hours

4. SERVICE CREDITS
In the event of a breach of performance standards, Client shall be entitled to service credits calculated as follows: [DETAILS].

5. TERM AND TERMINATION
This SLA remains in effect for the duration of the Master Services Agreement.`
    },
    {
      name: 'Mutual Non-Disclosure Agreement (NDA)',
      type: 'Agreement',
      content: `MUTUAL NON-DISCLOSURE AGREEMENT

1. DEFINITION OF CONFIDENTIAL INFORMATION
"Confidential Information" means any non-public information disclosed by one party to the other, whether orally or in writing, that is designated as confidential.

2. OBLIGATIONS OF RECEIVING PARTY
The Receiving Party shall:
(a) protect the Disclosing Party's Confidential Information with at least the same degree of care it uses for its own.
(b) not use Confidential Information for any purpose outside the scope of this Agreement.

3. EXCLUSIONS
Confidential Information shall not include information that is or becomes generally known to the public without breach of any obligation.

4. TERM
The obligations under this Agreement shall survive for a period of [NUMBER] years from the date of disclosure.`
    },
    {
      name: 'Employment Agreement',
      type: 'Agreement',
      content: `EMPLOYMENT AGREEMENT

1. POSITION AND DUTIES
[COMPANY NAME] (the "Employer") agrees to employ [EMPLOYEE NAME] in the position of [POSITION].

2. COMPENSATION
The Employee shall receive a base salary of [AMOUNT], payable in accordance with the Employer's standard payroll practices.

3. BENEFITS
The Employee shall be entitled to participate in all benefit plans generally available to employees.

4. CONFIDENTIALITY AND IP
The Employee agrees that all intellectual property created during the course of employment shall belong exclusively to the Employer.

5. TERMINATION
Either party may terminate this agreement with [NUMBER] days' written notice.`
    },
    {
      name: 'Master Services Agreement (MSA)',
      type: 'Agreement',
      content: `MASTER SERVICES AGREEMENT

1. SERVICES
Provider agrees to perform the services described in subsequent Statements of Work (SOWs) issued under this Agreement.

2. FEES AND PAYMENT
Fees for services shall be as set forth in the applicable SOW. All payments are due within 30 days of invoice date.

3. INTELLECTUAL PROPERTY
Unless otherwise specified in an SOW, all pre-existing IP remains the property of the respective party. Deliverables shall become the property of the Client upon full payment.

4. LIMITATION OF LIABILITY
Neither party shall be liable for any indirect, incidental, or consequential damages.

5. INDEMNIFICATION
Each party shall indemnify and hold the other harmless from third-party claims arising from gross negligence.`
    },
    {
      name: 'Partnership Agreement',
      type: 'Agreement',
      content: `PARTNERSHIP AGREEMENT

1. FORMATION
The undersigned parties hereby form a partnership under the name of [PARTNERSHIP NAME].

2. CONTRIBUTIONS
Partners shall contribute the following capital to the partnership: [DETAILS].

3. PROFITS AND LOSSES
Net profits and losses shall be shared among the partners in proportion to their capital contributions.

4. MANAGEMENT
All partners shall have equal rights in the management and conduct of the partnership business.

5. WITHDRAWAL
A partner may withdraw from the partnership upon [NUMBER] days' notice, subject to the terms of buyout defined herein.`
    }
  ];

  const handleCreateFromTemplate = async (template: any) => {
    if (!auth.currentUser || !id) return;
    
    const docId = `doc_${Date.now()}`;
    const newDoc: any = {
      id: docId,
      name: template.name,
      status: 'Drafting',
      type: template.type,
      source: 'Hub',
      ownerId: auth.currentUser.uid,
      projectId: id,
      content: template.content,
      analysis: JSON.stringify({
        name: template.name,
        rawText: template.content,
        counterparty: 'Pending',
        jurisdiction: 'Pending',
        governingLaw: 'Pending',
        terminationNotice: 'Pending',
        expiry: 'Pending',
        riskLevel: 'Medium Risk',
        riskScore: 0,
        summary: 'Document generated from institutional template. Deep Analysis recommended.',
        parties: [],
        signatories: [],
        keyClauses: [],
        keyObligations: [],
        missingProtections: [],
        directive: 'Run portfolio analysis to generate a strategic directive.'
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      auditLogs: [
        { 
          id: crypto.randomUUID(), 
          userId: auth.currentUser.uid, 
          userName: auth.currentUser.displayName || 'User', 
          action: `Generated from ${template.name} template`, 
          details: `Successfully initialized project document using the ${template.name} institutional framework. All core legal modules are now active and ready for analysis.`,
          timestamp: new Date().toISOString() 
        }
      ]
    };

    try {
      await setDoc(doc(db, 'contracts', docId), newDoc);
      setIsTemplateModalOpen(false);
      setEditingDoc({
        ...newDoc,
        lastEdited: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `contracts/${docId}`);
    }
  };

  // AI Generator States
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftPrompt, setDraftPrompt] = useState('');
  const [jurisdiction, setJurisdiction] = useState('South Africa');
  const [draftResult, setDraftResult] = useState('');

  // Signer States
  const [isAddSignerOpen, setIsAddSignerOpen] = useState(false);
  const [signerEmail, setSignerEmail] = useState('');
  const [isLooping, setIsLooping] = useState(false);

  // New Workspace States
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedDescription, setEditedDescription] = useState('');
  const [editedCategory, setEditedCategory] = useState('');
  const [editedLead, setEditedLead] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [activeWorkspaceMenu, setActiveWorkspaceMenu] = useState(false);
  const [activeDocMenuId, setActiveDocMenuId] = useState<string | null>(null);

  const handleUpdateHeader = async () => {
    if (!id || !editedName) return;
    try {
      await setDoc(doc(db, 'projects', id), {
        name: editedName,
        description: editedDescription,
        category: editedCategory,
        lead: editedLead,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsEditingHeader(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  };

  const handleShareProject = async () => {
    if (!id || !shareEmail || !project) return;
    const currentMembers = (project as any).members || [];
    if (currentMembers.includes(shareEmail)) {
      alert("User already has access.");
      return;
    }
    
    try {
      await setDoc(doc(db, 'projects', id), {
        members: [...currentMembers, shareEmail],
        updatedAt: serverTimestamp()
      }, { merge: true });
      setShareEmail('');
      setIsShareModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  };

  const handleDeleteProject = async () => {
    if (!id || !confirm("Are you sure you want to delete this entire workspace and all associated documents?")) return;
    try {
      await deleteDoc(doc(db, 'projects', id));
      navigate('/projects');
    } catch (error: any) {
      console.error("Delete failed:", error);
      alert("Failed to delete workspace. You may not have permission if you are not the owner.");
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  };

  const handleFileDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files) as File[];
    if (files.length === 0 || !id || !auth.currentUser) return;

    for (const file of files) {
      const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      // Show a pending record immediately
      const pendingDoc: any = {
        id: docId,
        name: file.name,
        status: 'Review Required',
        type: (file.type || '').includes('pdf') ? 'PDF' : 'Word Doc',
        source: 'Vault',
        ownerId: auth.currentUser.uid,
        projectId: id,
        content: '',
        analysis: JSON.stringify({
          name: file.name,
          rawText: '',
          counterparty: 'Analyzing...',
          jurisdiction: 'Analyzing...',
          governingLaw: 'Analyzing...',
          terminationNotice: 'Analyzing...',
          expiry: 'Analyzing...',
          riskLevel: 'Medium Risk',
          riskScore: 0,
          summary: 'Document is being analyzed by the AI engine...',
          parties: [], signatories: [], keyClauses: [],
          keyObligations: [], missingProtections: [],
          directive: 'AI analysis in progress...'
        }),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        auditLogs: [{ 
          id: crypto.randomUUID(), 
          userId: auth.currentUser.uid, 
          userName: auth.currentUser.displayName || 'User', 
          action: 'Uploaded file via drag-and-drop',
          details: `Analyzing: ${file.name}`,
          timestamp: new Date().toISOString() 
        }]
      };

      try {
        await setDoc(doc(db, 'contracts', docId), pendingDoc);
        
        // Run real AI analysis and update the Firestore record
        const analysis = await analyzeContract(file);
        await setDoc(doc(db, 'contracts', docId), {
          content: analysis.rawText || '',
          analysis: JSON.stringify(analysis),
          status: 'Review Required',
          updatedAt: serverTimestamp(),
          auditLogs: [{
            id: crypto.randomUUID(),
            userId: auth.currentUser!.uid,
            userName: auth.currentUser!.displayName || 'User',
            action: 'AI analysis complete',
            details: `Extracted ${analysis.keyClauses?.length || 0} clauses, ${analysis.parties?.length || 0} parties. Risk: ${analysis.riskLevel || 'Unknown'}.`,
            timestamp: new Date().toISOString()
          }, ...pendingDoc.auditLogs]
        }, { merge: true });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, `contracts/${docId}`);
      }
    }
  };

  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [signature, setSignature] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  const handleSignDocument = async (projectDoc: ProjectDoc) => {
    if (!auth.currentUser) return;
    
    const log: AuditLog = {
      id: crypto.randomUUID(),
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'User',
      action: 'Signed document',
      timestamp: new Date().toISOString(),
      details: `Digitally signed by ${auth.currentUser.email}`
    };

    try {
      const docRef = doc(db, 'contracts', projectDoc.id);
      await setDoc(docRef, {
        status: 'Signed',
        updatedAt: serverTimestamp(),
        auditLogs: [log, ...projectDoc.auditLogs]
      }, { merge: true });
      
      setEditingDoc({...projectDoc, status: 'Signed', auditLogs: [log, ...projectDoc.auditLogs]});
      setIsSignModalOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contracts/${projectDoc.id}`);
    }
  };

  const handleDeleteDoc = async (docId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this document from the workspace?")) return;
    
    try {
      await deleteDoc(doc(db, 'contracts', docId));
      setActiveDocMenuId(null);
    } catch (error: any) {
      alert("Failed to delete document. You may not have permission.");
      handleFirestoreError(error, OperationType.DELETE, `contracts/${docId}`);
    }
  };

  const handleAddSigner = async () => {
    if (!signerEmail || !id || !project) return;
    
    const newSigners = [...(project.signers || []), { email: signerEmail, status: 'Pending' }];
    
    try {
      await setDoc(doc(db, 'projects', id), {
        signers: newSigners,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setSignerEmail('');
      setIsAddSignerOpen(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  };

  const handleDeleteSigner = async (emailToDelete: string) => {
    if (!id || !project) return;
    const newSigners = project.signers.filter((s: any) => s.email !== emailToDelete);
    try {
      await setDoc(doc(db, 'projects', id), {
        signers: newSigners,
        updatedAt: serverTimestamp()
      }, { merge: true });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
    }
  };

  const handleRunSignatureLoop = async () => {
    if (!id || !project) return;
    setIsLooping(true);
    // Simulate activation
    setTimeout(async () => {
      try {
        await setDoc(doc(db, 'projects', id), {
          status: 'Review',
          updatedAt: serverTimestamp()
        }, { merge: true });
        setIsLooping(false);
        alert("Signature loop triggered for all stakeholders.");
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, `projects/${id}`);
      }
    }, 1500);
  };

  const handleGenerateDraft = async () => {
    if (!draftPrompt.trim()) return;
    setIsDrafting(true);
    try {
      const prompt = `Draft professional legal terms for a contract based on these requirements: ${draftPrompt}. 
        The jurisdiction is ${jurisdiction}. 
        Apply specific laws and regulations relevant to ${jurisdiction} (e.g. Labor Law, GDPR, Companies Act). 
        Use professional legal language, clear section headings, and standard liability/termination logic.`;
      
      const text = await generateText(prompt);
      setDraftResult(text);
    } catch (err) {
      console.error(err);
      setDraftResult('Error generating draft. Please try again.');
    } finally {
      setIsDrafting(false);
    }
  };

  const createDocFromDraft = async () => {
    if (!draftResult || !auth.currentUser || !id) return;
    const docId = `doc_${Date.now()}`;
    const newDoc: any = {
      id: docId,
      name: `Draft Terms (${jurisdiction})`,
      ownerId: auth.currentUser.uid,
      projectId: id,
      status: 'Drafting',
      type: 'AI Generated',
      source: 'Hub',
      content: draftResult,
      analysis: JSON.stringify({
        name: `Draft Terms (${jurisdiction})`,
        rawText: draftResult,
        counterparty: 'Pending',
        jurisdiction: jurisdiction,
        governingLaw: 'Pending',
        terminationNotice: 'Pending',
        expiry: 'Pending',
        riskLevel: 'Medium Risk',
        riskScore: 0,
        summary: 'AI drafted content successfully pushed to project stack.',
        parties: [],
        signatories: [],
        keyClauses: [],
        keyObligations: [],
        missingProtections: [],
        directive: 'Deep Analysis recommended for drafted terms.'
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      auditLogs: [
        { id: crypto.randomUUID(), userId: 'u1', userName: 'AI Engine', action: 'Generated from draft', timestamp: new Date().toISOString() }
      ]
    };

    try {
      await setDoc(doc(db, 'contracts', docId), newDoc);
      setDraftResult('');
      setDraftPrompt('');
      setActiveTab('docs');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `contracts/${docId}`);
    }
  };

  const handleCreateManual = async () => {
    if (!newDocName || !auth.currentUser || !id) return;
    
    const docId = `doc_${Date.now()}`;
    const newDoc: any = {
      id: docId,
      name: newDocName,
      status: 'Drafting',
      type: newDocType,
      source: 'Hub',
      ownerId: auth.currentUser.uid,
      projectId: id,
      content: 'Start writing your document here...',
      analysis: JSON.stringify({
        name: newDocName,
        rawText: 'Start writing your document here...',
        counterparty: 'Pending',
        jurisdiction: 'Pending',
        governingLaw: 'Pending',
        terminationNotice: 'Pending',
        expiry: 'Pending',
        riskLevel: 'Medium Risk',
        riskScore: 0,
        summary: 'Manual document initialized.',
        parties: [],
        signatories: [],
        keyClauses: [],
        keyObligations: [],
        missingProtections: [],
        directive: 'Document initialized manually. Add content and analyze for risks.'
      }),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      auditLogs: [
        { 
          id: crypto.randomUUID(), 
          userId: auth.currentUser.uid, 
          userName: auth.currentUser.displayName || 'User', 
          action: 'Manual document creation', 
          details: 'Initialized a blank legal canvas for manual drafting and custom clause injection.',
          timestamp: new Date().toISOString() 
        }
      ]
    };

    try {
      await setDoc(doc(db, 'contracts', docId), newDoc);
      setNewDocName('');
      setIsCreateModalOpen(false);
      setEditingDoc({
        ...newDoc,
        lastEdited: new Date().toISOString()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `contracts/${docId}`);
    }
  };

  const duplicateDoc = async (projectDoc: ProjectDoc) => {
    if (!auth.currentUser || !id) return;
    
    const docId = `doc_${Date.now()}`;
    const newDoc: any = {
      ...projectDoc,
      id: docId,
      name: `${projectDoc.name} (Copy)`,
      projectId: id,
      source: 'Hub',
      ownerId: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      auditLogs: [
        { 
          id: crypto.randomUUID(), 
          userId: auth.currentUser.uid, 
          userName: auth.currentUser.displayName || 'User', 
          action: 'Duplicated from ' + projectDoc.name, 
          details: `Created a copy of ${projectDoc.name} for iterative editing.`,
          timestamp: new Date().toISOString() 
        }
      ]
    };

    try {
      await setDoc(doc(db, 'contracts', docId), newDoc);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `contracts/${docId}`);
    }
  };

  const saveDocRefactored = async (projectDoc: ProjectDoc) => {
    if (!auth.currentUser) return;
    
    const log: AuditLog = {
      id: crypto.randomUUID(),
      userId: auth.currentUser.uid,
      userName: auth.currentUser.displayName || 'User',
      action: 'Updated document content',
      timestamp: new Date().toISOString()
    };

    try {
      const docRef = doc(db, 'contracts', projectDoc.id);
      await setDoc(docRef, {
        name: projectDoc.name,
        content: projectDoc.content || '',
        updatedAt: serverTimestamp(),
        auditLogs: [log, ...projectDoc.auditLogs]
      }, { merge: true });
      
      setEditingDoc(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `contracts/${projectDoc.id}`);
    }
  };

  return (
    <div 
      className="flex flex-col h-full bg-surface overflow-hidden relative"
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleFileDrop}
    >
      <AnimatePresence>
        {isDragOver && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-[200] bg-primary/10 backdrop-blur-[2px] flex items-center justify-center p-12 pointer-events-none"
          >
            <div className="w-full h-full border-4 border-dashed border-primary/40 rounded-[48px] flex flex-col items-center justify-center gap-6 bg-surface/60 dark:bg-surface-container/60 shadow-2xl">
              <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-secondary shadow-xl shadow-primary/20 animate-bounce">
                <Upload className="h-10 w-10" />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-primary tracking-tight mb-2">Drop Documents to Ingest</h3>
                <p className="text-sm font-bold text-primary/40 uppercase tracking-[0.2em]">PDF, Word, and Text Files Supported</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-14 border-b border-outline bg-surface flex items-center justify-between px-6 z-10">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/projects')} className="p-1.5 hover:bg-surface-container rounded-lg transition-all">
            <ArrowLeft className="h-4 w-4 text-on-surface/40" />
          </button>
          <div className="h-6 w-px bg-outline" />
          {isEditingHeader ? (
             <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-surface dark:bg-surface-container border border-outline dark:border-outline/20 rounded-[32px] p-8 w-full max-w-md shadow-2xl"
                >
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-xl font-bold text-primary tracking-tight">Edit Workspace</h2>
                      <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface/40">Update the details for your legal workflow</p>
                    </div>
                    <button onClick={() => setIsEditingHeader(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Workspace Name</label>
                      <input 
                        type="text"
                        autoFocus
                        value={editedName}
                        onChange={(e) => setEditedName(e.target.value)}
                        placeholder="e.g. Q4 Global Review"
                        className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Description</label>
                      <textarea 
                        rows={3}
                        value={editedDescription}
                        onChange={(e) => setEditedDescription(e.target.value)}
                        placeholder="Brief objective of this workspace..."
                        className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none resize-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Category</label>
                        <select 
                          value={editedCategory}
                          onChange={(e) => setEditedCategory(e.target.value as any)}
                          className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none appearance-none cursor-pointer"
                        >
                          <option value="Legal">Legal</option>
                          <option value="HR">HR</option>
                          <option value="Vendor">Vendor</option>
                          <option value="Strategic">Strategic</option>
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Workspace Lead</label>
                        <input 
                          type="text"
                          value={editedLead}
                          onChange={(e) => setEditedLead(e.target.value)}
                          placeholder="Lead Name"
                          className="w-full bg-surface-container dark:bg-surface-container-high px-4 py-3 rounded-2xl border border-outline dark:border-outline/20 focus:border-primary transition-colors text-sm font-bold outline-none"
                        />
                      </div>
                    </div>

                    <button 
                      onClick={handleUpdateHeader}
                      disabled={!editedName}
                      className="w-full py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 mt-4"
                    >
                      Save Changes
                    </button>
                  </div>
                </motion.div>
             </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="group cursor-pointer" onClick={() => {
                setEditedName(project?.name || '');
                setEditedDescription(project?.description || '');
                setEditedCategory(project?.category || 'Legal');
                setEditedLead(project?.lead || '');
                setIsEditingHeader(true);
              }}>
                <h2 className="text-sm font-bold text-primary tracking-tight group-hover:text-secondary transition-colors">{project?.name || 'Loading...'}</h2>
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest leading-none">{project?.category || 'Project'}</p>
                </div>
              </div>

              <div className="relative">
                <button 
                  onClick={() => setActiveWorkspaceMenu(!activeWorkspaceMenu)}
                  className="p-1.5 hover:bg-surface-container rounded-lg text-on-surface/20 hover:text-primary transition-all"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                <AnimatePresence>
                  {activeWorkspaceMenu && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setActiveWorkspaceMenu(false)} />
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: -10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: -10 }}
                        className="absolute left-0 top-full mt-2 w-48 bg-surface dark:bg-surface-container border border-outline dark:border-outline/20 rounded-2xl shadow-2xl z-20 py-2 p-2"
                      >
                        <button 
                          onClick={() => {
                            setEditedName(project?.name || '');
                            setEditedDescription(project?.description || '');
                            setEditedCategory(project?.category || 'Legal');
                            setEditedLead(project?.lead || '');
                            setIsEditingHeader(true);
                            setActiveWorkspaceMenu(false);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                        >
                          <Edit3 className="h-3.5 w-3.5 text-primary/40" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Edit Workspace</span>
                        </button>
                        <button 
                          onClick={() => {
                            setIsShareModalOpen(true);
                            setActiveWorkspaceMenu(false);
                          }}
                          className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                        >
                          <Share2 className="h-3.5 w-3.5 text-primary/40" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Collaborators</span>
                        </button>
                        <div className="h-px bg-outline mx-2 my-1" />
                        {project?.ownerId === auth.currentUser?.uid && (
                          <button 
                            onClick={handleDeleteProject}
                            className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error transition-all text-left"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span className="text-[10px] font-bold uppercase tracking-widest">Delete Project</span>
                          </button>
                        )}
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            {(project?.members || []).slice(0, 3).map((email: string) => (
               <div key={`workspace-avatar-${email}`} className="w-7 h-7 rounded-full border-2 border-surface bg-primary text-white flex items-center justify-center text-[10px] font-bold overflow-hidden" title={email}>
                  {email[0].toUpperCase()}
               </div>
            ))}
            {!project?.members?.length && [1, 2, 3].map(i => (
              <div key={`workspace-avatar-fallback-${i}`} className="w-7 h-7 rounded-full border-2 border-surface bg-surface-container-high flex items-center justify-center text-[10px] font-bold text-primary">
                {String.fromCharCode(64 + i)}
              </div>
            ))}
            <button 
              onClick={() => setIsShareModalOpen(true)}
              className="w-7 h-7 rounded-full border-2 border-surface bg-primary text-white flex items-center justify-center hover:scale-110 transition-all shadow-lg shadow-primary/20"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="h-4 w-px bg-outline mx-1" />
          <button 
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-2 px-4 py-1.5 bg-primary/5 border border-primary/20 text-primary rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-primary/10 transition-all font-mono"
          >
            <Share2 className="h-3 w-3" />
            Share Workspace
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Nav */}
        <aside className="w-64 border-r border-outline bg-surface-container-lowest p-4 flex flex-col gap-1">
          <button 
            onClick={() => setActiveTab('docs')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all relative ${activeTab === 'docs' ? 'text-primary' : 'hover:bg-surface-container text-on-surface-variant/60'}`}
          >
            <FileText className={`h-4 w-4 ${activeTab === 'docs' ? 'text-primary' : ''}`} />
            <span className="text-xs font-bold">Project Files</span>
            {activeTab === 'docs' && <motion.div layoutId="activeTab" className="absolute right-0 w-1 h-4 bg-primary rounded-l-full" />}
          </button>
          <button 
            onClick={() => setActiveTab('drafting')}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all relative ${activeTab === 'drafting' ? 'text-primary' : 'hover:bg-surface-container text-on-surface-variant/60'}`}
          >
            <Sparkles className={`h-4 w-4 ${activeTab === 'drafting' ? 'text-primary' : ''}`} />
            <span className="text-xs font-bold">AI Drafting</span>
            {activeTab === 'drafting' && <motion.div layoutId="activeTab" className="absolute right-0 w-1 h-4 bg-primary rounded-l-full" />}
          </button>
          
          <div className="mt-auto border-t border-outline pt-4 space-y-4">
             <div className="p-4 bg-surface-container-low rounded-2xl border border-outline">
                <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Project Health</p>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-primary">Compliance Status</span>
                  <span className="text-[10px] font-bold text-secondary-content">84%</span>
                </div>
                <div className="w-full h-1 bg-outline rounded-full overflow-hidden">
                  <div className="w-[84%] h-full bg-secondary" />
                </div>
             </div>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 overflow-y-auto custom-scrollbar bg-surface p-8">
          <AnimatePresence mode="wait">
            {activeTab === 'docs' && (
              <motion.div 
                key="docs"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h1 className="text-2xl font-bold text-primary tracking-tighter">Document Stack</h1>
                    <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest mt-1">Manage and track live project files</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsTemplateModalOpen(true)} 
                      className="px-6 py-2.5 bg-secondary/10 border border-secondary/30 text-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-secondary/20 transition-all flex items-center gap-2"
                    >
                      <Sparkles className="h-3 w-3 text-secondary-content" />
                      Templates Library
                    </button>
                    <button 
                      onClick={() => setIsCreateModalOpen(true)} 
                      className="px-6 py-2.5 bg-surface border border-outline text-primary rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-surface-container transition-all"
                    >
                      New Document
                    </button>
                    <button onClick={() => setActiveTab('drafting')} className="px-6 py-2.5 bg-primary text-on-primary rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20">
                      Draft with AI
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3">
                  {paginatedDocs.map((docItem) => (
                    <div key={`stack-doc-${docItem.id}`} className="p-4 bg-surface-container-low border border-outline rounded-2xl flex items-center justify-between hover:border-primary/40 transition-all group">
                      <div className="flex items-center gap-4">
                        <button 
                          onClick={() => setEditingDoc(docItem)}
                          className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all shadow-sm ${
                            docItem.type === 'Signature' 
                              ? 'bg-secondary/10 border border-secondary/20 text-secondary' 
                              : 'bg-surface border border-outline text-primary hover:bg-primary hover:text-white'
                          }`}
                        >
                          {docItem.type === 'Signature' ? <FileText className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                        </button>
                        <div>
                          <p className="text-[13px] font-bold text-primary tracking-tight cursor-pointer hover:text-secondary-content transition-colors" onClick={() => setEditingDoc(docItem)}>{docItem.name}</p>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded ${
                              docItem.type === 'Signature' 
                                ? 'bg-secondary text-primary' 
                                : 'bg-surface-container-high text-primary/60'
                            }`}>
                              {docItem.type === 'Signature' ? 'Execution Hub' : 'Analysis Vault'}
                            </span>
                            <div className="w-1 h-1 rounded-full bg-outline" />
                            <span className="text-[9px] font-bold text-primary/40 uppercase tracking-[0.1em]">Edited {formatFirebaseDate(docItem.lastEdited)}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <div className="flex flex-col items-end mr-4">
                           <span className={`text-[8px] font-extrabold uppercase tracking-widest ${
                              docItem.status === 'Signed' ? 'text-success' : 
                              docItem.status === 'Review Complete' ? 'text-warning' : 
                              docItem.status === 'Drafting' ? 'text-blue-500' :
                              'text-primary/60'
                            }`}>
                              {docItem.status}
                            </span>
                            {docItem.signers && docItem.signers.length > 0 && (
                              <p className="text-[8px] font-bold text-on-surface-variant/40 uppercase mt-1">
                                {docItem.signers.filter(s => s.status === 'Signed').length}/{docItem.signers.length} Signed
                              </p>
                            )}
                        </div>
                        
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              duplicateDoc(docItem);
                            }}
                            className="p-2 hover:bg-surface-container-high rounded-lg text-primary/40 hover:text-primary transition-colors"
                            title="Duplicate"
                          >
                            <Files className="h-4 w-4" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingDoc(docItem);
                              setIsHistoryOpen(true);
                            }}
                            className="p-2 hover:bg-surface-container-high rounded-lg text-primary/40 hover:text-primary transition-colors"
                            title="History"
                          >
                            <Clock className="h-4 w-4" />
                          </button>
                        </div>

                        <div className="relative">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDocMenuId(activeDocMenuId === docItem.id ? null : docItem.id);
                            }}
                            className="p-2 hover:bg-surface-container-high rounded-lg text-primary transition-all relative z-10"
                          >
                            <MoreVertical className="h-4 w-4" />
                          </button>

                          <AnimatePresence>
                            {activeDocMenuId === docItem.id && (
                              <>
                                <div className="fixed inset-0 z-0" onClick={(e) => { e.stopPropagation(); setActiveDocMenuId(null); }} />
                                <motion.div 
                                  initial={{ opacity: 0, scale: 0.9, y: -10 }}
                                  animate={{ opacity: 1, scale: 1, y: 0 }}
                                  exit={{ opacity: 0, scale: 0.9, y: -10 }}
                                  className="absolute right-0 top-full mt-2 w-48 bg-surface border border-outline rounded-2xl shadow-2xl z-20 py-2 p-2"
                                >
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingDoc(docItem);
                                      setActiveDocMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                                  >
                                    <Edit3 className="h-3.5 w-3.5 text-primary/40" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Edit Document</span>
                                  </button>
                                  <button 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setIsShareModalOpen(true);
                                      setActiveDocMenuId(null);
                                    }}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                                  >
                                    <Share2 className="h-3.5 w-3.5 text-primary/40" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Share Document</span>
                                  </button>
                                  <div className="h-px bg-outline mx-2 my-1" />
                                  <button 
                                    onClick={(e) => handleDeleteDoc(docItem.id, e)}
                                    className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error transition-all text-left"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Delete Document</span>
                                  </button>
                                </motion.div>
                              </>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                  {/* Pagination Footer */}
                  {totalPages > 1 && (
                    <div className="flex items-center justify-between pt-8 pb-4 border-t border-outline/10">
                      <p className="text-[10px] font-bold text-on-surface/30 uppercase tracking-widest">
                        Showing {(currentPage - 1) * pageSize + 1} to {Math.min(currentPage * pageSize, docs.length)} of {docs.length} files
                      </p>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                          disabled={currentPage === 1}
                          className="px-4 py-2 border border-outline/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-on-surface/60 hover:bg-surface-container disabled:opacity-30 transition-all"
                        >
                          Previous
                        </button>
                        <div className="flex items-center gap-1 px-3">
                          {Array.from({ length: totalPages }).map((_, i) => (
                            <div 
                              key={i} 
                              className={`h-1 rounded-full transition-all duration-500 ${i + 1 === currentPage ? 'w-4 bg-primary' : 'w-1 bg-outline/30'}`} 
                            />
                          ))}
                        </div>
                        <button 
                          onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                          disabled={currentPage === totalPages}
                          className="px-4 py-2 border border-outline/20 rounded-lg text-[9px] font-black uppercase tracking-widest text-on-surface/60 hover:bg-surface-container disabled:opacity-30 transition-all"
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Editing Modal */}
              <AnimatePresence>
                {editingDoc && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => { if(!isHistoryOpen) setEditingDoc(null); }}
                      className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60]"
                    />
                    <motion.div 
                      initial={{ x: '100%' }}
                      animate={{ x: 0 }}
                      exit={{ x: '100%' }}
                      className={`fixed right-0 top-0 bottom-0 w-full ${isFullScreen ? 'max-w-full' : 'max-w-[800px]'} bg-surface dark:bg-surface-container z-[70] shadow-2xl flex flex-col border-l border-outline dark:border-outline/20 transition-all duration-300`}
                    >
                      <div className="p-6 border-b border-outline flex items-center justify-between">
                        <div className="flex items-center gap-4 flex-1">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isHistoryOpen ? 'bg-secondary/10 text-secondary' : 'bg-primary/10 text-primary'}`}>
                            {isHistoryOpen ? <Clock className="h-5 w-5" /> : <PenTool className="h-5 w-5" />}
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-primary tracking-tight">{isHistoryOpen ? 'Audit History' : 'Edit Document'}</h3>
                            <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">{editingDoc.name}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                           {!isHistoryOpen && (
                             <button 
                               onClick={() => setIsHistoryOpen(true)}
                               className="px-4 py-2 bg-surface border border-outline text-[10px] font-bold uppercase tracking-widest rounded-lg hover:bg-surface-container transition-all flex items-center gap-2"
                             >
                               <Clock className="h-3 w-3" />
                               View History
                             </button>
                           )}
                           <button 
                             onClick={() => setIsFullScreen(!isFullScreen)}
                             className="p-2 hover:bg-surface-container rounded-xl transition-all text-on-surface-variant/40 hover:text-primary"
                             title={isFullScreen ? "Exit Full Screen" : "Expand to Full Screen"}
                           >
                             {isFullScreen ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
                           </button>
                           <button 
                            onClick={() => {
                              if(isHistoryOpen) setIsHistoryOpen(false);
                              else {
                                setEditingDoc(null);
                                setIsFullScreen(false);
                              }
                            }}
                            className="p-2 hover:bg-surface-container rounded-lg"
                          >
                            <X className="h-5 w-5" />
                          </button>
                        </div>
                      </div>

                      <div className="flex-1 overflow-y-auto p-8 bg-surface-container-lowest">
                         {isHistoryOpen ? (
                           <div className="max-w-[600px] mx-auto space-y-6">
                              {editingDoc.auditLogs.map((log, idx) => (
                                <div key={log.id} className="relative pl-8 border-l border-outline pb-8 last:pb-0">
                                   <div className="absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full bg-primary border-4 border-surface shadow-sm" />
                                   <div className="p-4 bg-surface rounded-2xl border border-outline shadow-sm">
                                      <div className="flex justify-between items-start mb-2">
                                         <p className="text-[11px] font-bold text-primary">{log.userName}</p>
                                         <span className="text-[9px] font-bold text-primary/30 uppercase">{formatFirebaseDate(log.timestamp)}</span>
                                      </div>
                                      <p className="text-xs text-on-surface-variant font-medium">{log.action}</p>
                                      {log.details && (
                                        <p className="text-[10px] text-on-surface-variant/60 mt-2 bg-surface-container p-2 rounded-lg italic">{log.details}</p>
                                      )}
                                   </div>
                                </div>
                              ))}
                           </div>
                         ) : (
                           <div className={`mx-auto space-y-6 h-full flex flex-col ${isFullScreen ? 'max-w-[1000px]' : 'max-w-[700px]'}`}>
                              <input 
                                value={editingDoc.name}
                                onChange={(e) => setEditingDoc({...editingDoc, name: e.target.value})}
                                className="text-2xl font-bold text-primary tracking-tight bg-transparent border-none outline-none focus:ring-0 w-full"
                              />
                              <textarea 
                                value={editingDoc.content}
                                onChange={(e) => setEditingDoc({...editingDoc, content: e.target.value})}
                                className="flex-1 w-full bg-surface dark:bg-surface-container-high border border-outline dark:border-outline/20 rounded-2xl p-8 text-sm font-medium leading-relaxed outline-none focus:ring-1 focus:ring-secondary/20 shadow-sm resize-none"
                              />
                           </div>
                         )}
                      </div>

                      {!isHistoryOpen && (
                        <div className="p-6 border-t border-outline flex items-center justify-between gap-3 bg-surface">
                          <div className="flex items-center gap-3">
                            <button 
                              onClick={() => setEditingDoc(null)}
                              className="px-6 py-2.5 bg-surface border border-outline text-[10px] font-bold uppercase tracking-widest rounded-xl hover:bg-surface-container transition-all"
                            >
                              Cancel
                            </button>
                            <button 
                              onClick={() => saveDocRefactored(editingDoc)}
                              className="px-8 py-2.5 bg-primary text-on-primary text-[10px] font-bold uppercase tracking-widest rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                              Save Changes
                            </button>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

              {/* Create Modal */}
              <AnimatePresence>
                {isCreateModalOpen && (
                  <>
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setIsCreateModalOpen(false)}
                      className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80]"
                    />
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.9, opacity: 0 }}
                      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[400px] bg-surface rounded-[32px] p-8 z-[90] shadow-2xl border border-outline"
                    >
                       <div className="flex items-center gap-3 mb-6">
                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                          <Plus className="h-6 w-6" />
                        </div>
                        <div>
                          <h2 className="text-xl font-bold text-primary tracking-tight">New Document</h2>
                          <p className="text-[10px] font-bold text-primary/40 uppercase tracking-widest">Manual Creation</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Document Name</p>
                          <input 
                            value={newDocName}
                            onChange={(e) => setNewDocName(e.target.value)}
                            placeholder="e.g. Master Services Agreement"
                            className="w-full bg-surface-container-low border border-outline rounded-xl p-3 text-sm font-medium outline-none focus:ring-1 focus:ring-secondary/40"
                          />
                        </div>
                        <div>
                          <p className="text-[9px] font-bold text-primary/40 uppercase tracking-widest mb-2">Category</p>
                          <select 
                            value={newDocType}
                            onChange={(e) => setNewDocType(e.target.value)}
                            className="w-full bg-surface-container-low border border-outline rounded-xl p-3 text-[11px] font-bold outline-none focus:ring-1 focus:ring-secondary/40"
                          >
                             <option>Agreement</option>
                             <option>Addendum</option>
                             <option>SOW</option>
                             <option>Amendment</option>
                             <option>Termination</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-8">
                        <button 
                          onClick={() => setIsCreateModalOpen(false)}
                          className="flex-1 py-3 text-[11px] font-extrabold uppercase tracking-widest text-primary/40 hover:text-primary transition-all"
                        >
                          Cancel
                        </button>
                        <button 
                          disabled={!newDocName}
                          onClick={handleCreateManual}
                          className="flex-[2] py-3 bg-primary text-on-primary rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20 disabled:opacity-50"
                        >
                          Create Workspace
                        </button>
                      </div>
                    </motion.div>
                  </>
                )}
              </AnimatePresence>

            {activeTab === 'drafting' && (
              <motion.div 
                key="drafting"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="max-w-[720px] mx-auto space-y-10"
              >
                <div className="text-center space-y-2">
                  <div className="w-16 h-16 bg-secondary/10 rounded-[24px] flex items-center justify-center text-secondary-content mx-auto mb-4">
                    <Sparkles className="h-8 w-8" />
                  </div>
                  <h2 className="text-2xl font-bold text-primary tracking-tight">AI Drafting Studio</h2>
                  <p className="text-xs text-on-surface-variant/60 font-medium max-w-[400px] mx-auto leading-relaxed">
                    Generate bespoke legal terms and clauses using our enterprise-grade AI engine.
                  </p>
                </div>

                <div className="bg-surface-container-low border border-outline rounded-[32px] p-8 shadow-sm">
                  <div className="flex flex-col gap-4">
                  {/* Phase 5: Smart Starters */}
                  {(smartStarters.length > 0 || isLoadingStarters) && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[9px] font-bold text-primary/40 uppercase tracking-[0.3em]">Smart Starters · Tailored to Your Documents</p>
                        <button
                          onClick={fetchStarters}
                          disabled={isLoadingStarters}
                          className="p-1 rounded-lg text-primary/30 hover:text-primary transition-all disabled:opacity-50"
                          title="Regenerate starters"
                        >
                          <RefreshCw className={`h-3 w-3 ${isLoadingStarters ? 'animate-spin' : ''}`} />
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {isLoadingStarters ? (
                          [1, 2, 3, 4].map(i => (
                            <div key={i} className="h-8 w-48 bg-surface-container-high rounded-full animate-pulse" />
                          ))
                        ) : (
                          smartStarters.map((starter, i) => (
                            <button
                              key={i}
                              onClick={() => setDraftPrompt(starter)}
                              className="px-4 py-2 bg-primary/5 hover:bg-primary/10 border border-primary/15 hover:border-primary/30 text-primary rounded-full text-[10px] font-bold transition-all text-left leading-snug"
                            >
                              {starter}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-[9px] font-bold text-primary/40 uppercase tracking-[0.3em]">Draft Requirements</p>

                    <textarea 
                      value={draftPrompt}
                      onChange={(e) => setDraftPrompt(e.target.value)}
                      placeholder="Describe the clauses you need to draft (e.g., 'Termination for convenience clause with 60-day notice and pro-rata refund terms')..."
                      className="w-full h-40 bg-surface border border-outline rounded-2xl p-4 text-sm font-medium outline-none focus:ring-1 focus:ring-secondary/40 resize-none transition-all"
                    />

                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <p className="text-[9px] font-bold text-primary/40 uppercase tracking-[0.3em] mb-2">Target Jurisdiction</p>
                        <select 
                          value={jurisdiction}
                          onChange={(e) => setJurisdiction(e.target.value)}
                          className="w-full bg-surface border border-outline rounded-xl p-3 text-[11px] font-bold outline-none focus:ring-1 focus:ring-secondary/40"
                        >
                          <option>South Africa</option>
                          <option>United Kingdom</option>
                          <option>United States (Delaware)</option>
                          <option>European Union (GDPR)</option>
                          <option>Ireland</option>
                        </select>
                      </div>
                      <div className="flex-1 opacity-40">
                         <p className="text-[9px] font-bold text-primary/40 uppercase tracking-[0.3em] mb-2">Contract Type</p>
                         <div className="bg-surface-container border border-outline rounded-xl p-3 text-[11px] font-bold">Employment Agreement</div>
                      </div>
                    </div>
                  </div>
                  <button 
                    disabled={isDrafting || !draftPrompt.trim()}
                    onClick={handleGenerateDraft}
                    className="w-full mt-6 py-4 bg-secondary text-primary rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-secondary/20 hover:scale-[1.01] active:scale-[0.98] transition-all disabled:opacity-50 flex items-center justify-center gap-3"
                  >
                    {isDrafting ? <Clock className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    {isDrafting ? 'Generating AI Draft...' : 'Build Contract Terms'}
                  </button>
                </div>

                {draftResult && (
                  <motion.div 
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="p-8 bg-surface dark:bg-surface-container-high border border-outline dark:border-outline/20 rounded-[32px] shadow-sm font-serif italic text-sm text-primary dark:text-primary-light leading-relaxed whitespace-pre-wrap">
                      {draftResult}
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={createDocFromDraft}
                        className="flex-1 py-4 bg-primary text-on-primary rounded-2xl text-[11px] font-extrabold uppercase tracking-widest shadow-xl shadow-primary/20"
                      >
                        Push to Project stack
                      </button>
                      <button 
                         onClick={() => setDraftResult('')}
                        className="px-8 py-4 bg-surface border border-outline rounded-2xl text-[11px] font-extrabold uppercase tracking-widest"
                      >
                        Discard
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}

          </AnimatePresence>

          {/* Share Workspace Modal */}
          <AnimatePresence>
            {isShareModalOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsShareModalOpen(false)}
                  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100]"
                />
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[440px] bg-surface rounded-[40px] p-10 z-[110] shadow-2xl border border-outline overflow-hidden"
                >
                  <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -mr-16 -mt-16 blur-3xl" />
                  
                  <div className="relative z-10">
                    <div className="w-14 h-14 bg-primary rounded-2xl flex items-center justify-center text-secondary mb-6 shadow-lg shadow-primary/20">
                      <Share2 className="h-7 w-7" />
                    </div>
                    <h2 className="text-2xl font-bold text-primary tracking-tight mb-2">Share Workspace</h2>
                    <p className="text-xs text-on-surface-variant/60 font-medium leading-relaxed mb-8">
                      Invite your legal team or external stakeholders to collaborate on this project in real-time.
                    </p>

                    <div className="space-y-6">
                       <div>
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-1 mb-2 block">Collaborator Email</label>
                          <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-primary/30" />
                            <input 
                              type="email"
                              autoFocus
                              value={shareEmail}
                              onChange={(e) => setShareEmail(e.target.value)}
                              placeholder="colleague@firm.com"
                              className="w-full bg-surface-container px-12 py-4 rounded-2xl border border-outline focus:border-primary transition-all text-sm font-bold outline-none ring-primary/5 focus:ring-4"
                            />
                          </div>
                       </div>

                       <div className="space-y-3">
                          <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/40 ml-1 block">Current Members</label>
                          <div className="space-y-2 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
                             {(project?.members || []).map((email: string) => (
                               <div key={`share-member-${email}`} className="flex items-center justify-between p-3 bg-surface-container-low border border-outline rounded-xl group/member">
                                  <div className="flex items-center gap-3">
                                     <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary">
                                        {email[0].toUpperCase()}
                                     </div>
                                     <span className="text-xs font-semibold text-primary">{email}</span>
                                  </div>
                                  <span className="text-[8px] font-bold uppercase tracking-widest text-primary/20 group-hover/member:text-primary/40 transition-colors">Member</span>
                               </div>
                             ))}
                             {(!project?.members || project.members.length === 0) && (
                               <p className="text-[10px] text-primary/30 italic px-1">Only you have access to this workspace</p>
                             )}
                          </div>
                       </div>
                    </div>

                    <div className="flex gap-4 mt-10">
                      <button 
                        onClick={() => setIsShareModalOpen(false)}
                        className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition-all"
                      >
                        Cancel
                      </button>
                      <button 
                        disabled={!(shareEmail || '').includes('@')}
                        onClick={handleShareProject}
                        className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                      >
                        Invite Colleague
                      </button>
                    </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          {/* Sign Document Modal */}
          <AnimatePresence>
            {isSignModalOpen && editingDoc && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsSignModalOpen(false)}
                  className="fixed inset-0 bg-[#0D0D0D]/90 backdrop-blur-md z-[120]"
                />
                <motion.div 
                  initial={{ scale: 0.9, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[500px] bg-surface dark:bg-surface-container rounded-[48px] p-12 z-[130] shadow-2xl overflow-hidden border border-outline dark:border-outline/20"
                >
                  <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-secondary via-primary to-secondary" />
                  
                  <div className="space-y-8">
                     <div className="flex flex-col items-center text-center space-y-4">
                        <div className="w-20 h-20 rounded-[32px] bg-primary/5 flex items-center justify-center text-primary mb-2">
                           <Shield className="h-10 w-10" />
                        </div>
                        <h2 className="text-3xl font-bold text-primary tracking-tighter">Digital Execution</h2>
                        <p className="text-xs text-on-surface-variant/60 font-medium max-w-[300px]">
                           By signing, you confirm that you have reviewed the contents of <span className="font-bold text-primary">{editingDoc.name}</span> and accept all terms within.
                        </p>
                     </div>

                     <div className="space-y-6">
                        <div className="p-8 bg-surface-container-lowest border-2 border-dashed border-outline rounded-[32px] flex flex-col items-center justify-center gap-4 group hover:border-primary/40 transition-all cursor-text" onClick={() => document.getElementById('sig-input')?.focus()}>
                           <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/20 group-hover:text-primary/40 transition-colors">Type Full Name to Sign</p>
                           <input 
                              id="sig-input"
                              value={signature}
                              onChange={(e) => setSignature(e.target.value)}
                              placeholder={auth.currentUser?.displayName || "Your Name"}
                              className="text-3xl font-serif italic text-primary bg-transparent text-center outline-none w-full placeholder:opacity-10"
                           />
                           <div className="h-px w-3/4 bg-outline group-hover:w-full transition-all" />
                        </div>

                        <div className="flex items-start gap-3 bg-primary/5 p-4 rounded-2xl">
                           <Clock className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                           <p className="text-[10px] font-semibold text-primary/60 leading-relaxed italic">
                              This signature will be time-stamped and recorded in the immutable audit trail of this workspace. {new Date().toLocaleString()}
                           </p>
                        </div>
                     </div>

                     <div className="flex gap-4">
                        <button 
                           onClick={() => setIsSignModalOpen(false)}
                           className="flex-1 py-4 text-xs font-bold uppercase tracking-widest text-primary/40 hover:text-primary transition-all"
                        >
                           Go Back
                        </button>
                        <button 
                           disabled={!signature}
                           onClick={() => handleSignDocument(editingDoc)}
                           className="flex-[2] py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50"
                        >
                           Execute & Verify
                        </button>
                     </div>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
          
          {/* Template Selection Modal */}
          <AnimatePresence>
            {isTemplateModalOpen && (
              <>
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setIsTemplateModalOpen(false)}
                  className="fixed inset-0 bg-[#0D0D0D]/80 backdrop-blur-md z-[120]"
                />
                <motion.div 
                  initial={{ scale: 0.95, opacity: 0, y: 20 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.95, opacity: 0, y: 20 }}
                  className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-3xl bg-surface rounded-[48px] p-12 z-[130] shadow-2xl border border-outline overflow-hidden"
                >
                  <div className="flex justify-between items-start mb-10">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-primary rounded-[24px] flex items-center justify-center text-secondary shadow-lg shadow-primary/20">
                        <Sparkles className="h-8 w-8" />
                      </div>
                      <div>
                        <h2 className="text-3xl font-bold text-primary tracking-tight">Legal Templates</h2>
                        <p className="text-[10px] font-bold text-primary/40 uppercase tracking-[0.3em]">Institutional Standard Documents</p>
                      </div>
                    </div>
                    <button onClick={() => setIsTemplateModalOpen(false)} className="p-3 hover:bg-surface-container rounded-2xl transition-all">
                      <X className="h-6 w-6" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[50vh] overflow-y-auto custom-scrollbar pr-4">
                    {LEGAL_TEMPLATES.map((template, idx) => (
                      <motion.div 
                        key={`template-${idx}`}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleCreateFromTemplate(template)}
                        className="p-6 bg-surface-container-low border border-outline rounded-[32px] hover:border-primary/40 cursor-pointer transition-all group relative overflow-hidden"
                      >
                        <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.08] transition-opacity">
                           <FileText className="h-24 w-24" />
                        </div>
                        <h4 className="text-sm font-bold text-primary mb-2 group-hover:text-secondary-content transition-colors">{template.name}</h4>
                        <div className="flex items-center gap-3">
                           <span className="text-[8px] font-black uppercase tracking-widest bg-primary/10 text-primary px-2 py-0.5 rounded">Template</span>
                           <span className="text-[8px] font-bold text-primary/30 uppercase tracking-widest">{template.type}</span>
                        </div>
                        <div className="mt-4 flex items-center gap-2 text-[10px] font-bold text-primary/40 group-hover:text-primary transition-all">
                           <span>Generate Draft</span>
                           <ChevronRight className="h-3 w-3" />
                        </div>
                      </motion.div>
                    ))}
                  </div>

                  <div className="mt-10 pt-10 border-t border-outline flex items-center justify-between">
                     <p className="text-[11px] font-medium text-on-surface-variant/40 leading-relaxed max-w-[400px]">
                        These templates are provided for drafting purposes. Please consult with legal counsel to ensure jurisdiction-specific compliance.
                     </p>
                     <button 
                       onClick={() => setIsTemplateModalOpen(false)}
                       className="px-8 py-3 bg-surface border border-outline text-[11px] font-bold uppercase tracking-widest rounded-2xl hover:bg-surface-container transition-all"
                     >
                       Close Library
                     </button>
                  </div>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
