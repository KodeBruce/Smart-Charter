import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderPlus, Search, MoreVertical, 
  Calendar, FileText, UserPlus, 
  ChevronRight, Clock, ShieldCheck, X, Trash2, Edit3, Sparkles, Plus
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError, formatFirebaseDate } from '../lib/firebase';
import { collection, onSnapshot, query, where, setDoc, doc, serverTimestamp, orderBy, or, deleteDoc } from 'firebase/firestore';
import TopBar from '../components/TopBar';
import ConfirmationModal from '../components/ConfirmationModal';

interface Project {
  id: string;
  name: string;
  description: string;
  count: number;
  lastUpdated: any;
  updatedAt?: any;
  status: 'Active' | 'Drafting' | 'Review' | 'Complete';
  lead: string;
  category: 'Strategic' | 'HR' | 'Legal' | 'Vendor';
  ownerId: string;
  members?: string[];
}

export default function Projects() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<'All' | 'HR' | 'Vendor' | 'Strategic'>('All');
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    category: 'Legal' as Project['category'],
    lead: 'Sarah Jenkins',
    template: 'None'
  });
  const [isTemplateDropdownOpen, setIsTemplateDropdownOpen] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  const TEMPLATE_METADATA: Record<string, { name: string, desc: string, cat: Project['category'] }> = {
    'HR': { 
      name: 'HR & People Operations', 
      desc: 'Employee onboarding, contracts, and internal policies management.',
      cat: 'HR'
    },
    'Vendor': { 
      name: 'Vendor Management', 
      desc: 'External supplier agreements, SLAs, and procurement lifecycle.',
      cat: 'Vendor'
    },
    'Strategic': { 
      name: 'Strategic Partnerships', 
      desc: 'High-level alliances, MOUs, and strategic investment workflows.',
      cat: 'Strategic'
    },
    'Legal': { 
      name: 'Corporate Legal Affairs', 
      desc: 'General legal agreements, NDAs, and corporate governance.',
      cat: 'Legal'
    }
  };

  const handleSelectTemplate = (templateKey: string) => {
    if (templateKey === 'None') {
      setNewProject({
        ...newProject,
        template: 'None',
        name: '',
        description: '',
        category: 'Legal'
      });
    } else {
      const meta = TEMPLATE_METADATA[templateKey];
      setNewProject({
        ...newProject,
        template: templateKey,
        name: meta.name,
        description: meta.desc,
        category: meta.cat
      });
    }
    setIsTemplateDropdownOpen(false);
  };

  const WORKSPACE_TEMPLATES = {
    'HR': [
      { 
        name: 'Standard Employment Contract', 
        type: 'Agreement', 
        content: `EMPLOYMENT AGREEMENT

This Employment Agreement (the "Agreement") is entered into as of [DATE] between [COMPANY NAME] (the "Employer") and [EMPLOYEE NAME] (the "Employee").

1. POSITION AND DUTIES
The Employee shall serve in the position of [TITLE]. The Employee shall perform such duties as are customary for this position and such other duties as may be assigned by the Employer.

2. COMPENSATION
The Employee shall receive an annual base salary of [AMOUNT], payable in accordance with the Employer's standard payroll practices.

3. BENEFITS
The Employee shall be eligible to participate in the Employer's standard benefit plans, including health insurance and paid time off, subject to the terms of those plans.

4. CONFIDENTIALITY
The Employee agrees to maintain the confidentiality of all proprietary information of the Employer and shall not disclose such information to any third party.

5. TERMINATION
Either party may terminate this Agreement at any time, with or without cause, upon [NUMBER] days' written notice.

6. GOVERNING LAW
This Agreement shall be governed by and construed in accordance with the laws of [JURISDICTION].`
      },
      { 
        name: 'Employee NDA', 
        type: 'Agreement', 
        content: `EMPLOYEE NON-DISCLOSURE AGREEMENT

1. CONFIDENTIAL INFORMATION
"Confidential Information" includes all non-public information related to the business, finances, and technology of [COMPANY NAME].

2. OBLIGATIONS
The Employee agrees to:
(a) Hold Confidential Information in strict confidence.
(b) Use Confidential Information only for the benefit of the Company.
(c) Not disclose Confidential Information to any third party without prior written consent.

3. RETURN OF MATERIALS
Upon termination of employment, the Employee shall return all documents and property containing Confidential Information.

4. REMEDIES
The Employee acknowledges that breach of this agreement may cause irreparable harm for which monetary damages may be insufficient.`
      },
      { 
        name: 'Remote Work Policy', 
        type: 'Policy', 
        content: `REMOTE WORK POLICY

1. ELIGIBILITY
Remote work is available to employees whose roles can be performed effectively outside the office, subject to manager approval.

2. EQUIPMENT AND SECURITY
(a) The Company will provide [EQUIPMENT] for business use.
(b) Employees must ensure a secure internet connection and follow all IT security protocols.
(c) Home offices must meet basic safety and ergonomic standards.

3. COMMUNICATION
Employees are expected to remain reachable during standard core hours ([CORE HOURS]) via Slack, Email, and Zoom.

4. PERFORMANCE
Performance will be measured by output and achievement of goals, identical to in-office standards.`
      }
    ],
    'Vendor': [
      { 
        name: 'Master Services Agreement (MSA)', 
        type: 'Agreement', 
        content: `MASTER SERVICES AGREEMENT

1. SERVICES
Provider agrees to perform the services described in each Statement of Work (SOW) executed under this Agreement.

2. FEES AND PAYMENT
Fees for services shall be as specified in the applicable SOW. All invoices are payable within 30 days of receipt.

3. INTELLECTUAL PROPERTY
Unless otherwise specified, all deliverables created for the Client shall become the exclusive property of the Client upon full payment of fees.

4. LIMITATION OF LIABILITY
Neither party shall be liable for indirect, incidental, or consequential damages arising out of this Agreement.

5. INDEMNIFICATION
Each party shall indemnify the other from third-party claims arising from their gross negligence or willful misconduct.`
      },
      { 
        name: 'Service Level Agreement (SLA)', 
        type: 'Agreement', 
        content: `SERVICE LEVEL AGREEMENT

1. SERVICE UPTIME
Provider guarantees a monthly uptime percentage of 99.9% for the hosted services.

2. MAINTENANCE WINDOWS
Standard maintenance will be conducted [TIME/DAY]. Provider will provide 48 hours' notice for any emergency maintenance.

3. SUPPORT TIERS
- P1 (Critical): 2-hour response, 8-hour resolution goal.
- P2 (Standard): 24-hour response.
- P3 (Low): 48-hour response.

4. SERVICE CREDITS
In the event of a breach of uptime guarantees, Client shall be entitled to credits as follows:
- 99.0% - 99.8%: 10% credit
- Below 99.0%: 25% credit`
      },
      { 
        name: 'Data Processing Addendum', 
        type: 'Addendum', 
        content: `DATA PROCESSING ADDENDUM (DPA)

1. ROLES
The parties acknowledge that Client is the Data Controller and Provider is the Data Processor.

2. DATA PROTECTION
Provider shall implement appropriate technical and organizational measures to protect personal data against unauthorized processing or loss.

3. SUB-PROCESSING
Provider shall not engage any sub-processor without the prior written authorization of the Client.

4. AUDIT RIGHTS
Provider shall make available to the Client all information necessary to demonstrate compliance with GDPR and other data protection laws.`
      }
    ],
    'Strategic': [
      { 
        name: 'Partnership Agreement', 
        type: 'Agreement', 
        content: `PARTNERSHIP AGREEMENT

1. NAME AND PURPOSE
The partners hereby form a partnership under the name of [PARTNERSHIP NAME] to conduct the business of [PURPOSE].

2. CAPITAL CONTRIBUTIONS
Partners shall contribute the following capital: [DETAILS]. No partner shall be entitled to interest on their contribution.

3. PROFIT SHARING
Net profits and losses shall be shared among the partners in proportion to their capital contributions.

4. MANAGEMENT
Each partner shall have equal rights in the management of the partnership business. Major decisions require [PERCENTAGE]% consent.

5. WITHDRAWAL
A partner may withdraw upon 90 days' notice. Remaining partners have the right of first refusal to purchase the interest.`
      },
      { 
        name: 'MOU - Strategic Alliance', 
        type: 'Agreement', 
        content: `MEMORANDUM OF UNDERSTANDING

1. PURPOSE
The parties intend to collaborate on [PROJECT/GOAL] to leverage their respective expertise in [FIELD].

2. SCOPE OF COLLABORATION
The parties will explore joint ventures, shared marketing initiatives, and technical integration.

3. NON-BINDING NATURE
Except for the confidentiality and governing law clauses, this MOU is a statement of intent and does not create a legally binding obligation.

4. COSTS
Each party shall bear its own costs and expenses incurred in connection with this MOU.`
      },
      { 
        name: 'Term Sheet', 
        type: 'Strategic', 
        content: `INVESTMENT TERM SHEET

1. VALUATION
The pre-money valuation of the Company is estimated at [AMOUNT].

2. INVESTMENT AMOUNT
The Investor intends to invest [AMOUNT] in exchange for [PERCENTAGE]% equity.

3. BOARD SEATS
The Investor shall be entitled to appoint one (1) member to the Board of Directors.

4. LIQUIDATION PREFERENCE
Investor shall have a 1x non-participating liquidation preference.

5. EXCLUSIVITY
The Company agrees to a 45-day exclusivity period to conduct due diligence.`
      }
    ],
    'Legal': [
      { 
        name: 'Mutual NDA', 
        type: 'Agreement', 
        content: `MUTUAL NON-DISCLOSURE AGREEMENT

1. DEFINITION
"Confidential Information" means any information disclosed by one party to the other that is marked as confidential or should reasonably be understood to be so.

2. OBLIGATIONS
Both parties agree to:
(a) Protect the other's information with at least the same care as their own.
(b) Use the information solely for the purpose of [PURPOSE].
(c) Limit access to employees with a need-to-know.

3. EXCLUSIONS
Confidential Information does not include information that is public, already known, or independently developed.

4. TERM
The obligations shall remain in effect for [NUMBER] years from the date of disclosure.`
      },
      { 
        name: 'Professional Services Agreement', 
        type: 'Agreement', 
        content: `PROFESSIONAL SERVICES AGREEMENT

1. ENGAGEMENT
Client engages Consultant to provide the services described in the attached Schedule A.

2. DELIVERABLES
Consultant shall deliver the following: [LIST DELIVERABLES]. Acceptance shall be deemed granted within 5 days of delivery unless otherwise notified.

3. FEES
The total fee for services is [AMOUNT]. Consultant shall be reimbursed for reasonable expenses.

4. WARRANTIES
Consultant warrants that the services will be performed in a professional and workmanlike manner.

5. TERMINATION
Either party may terminate upon 30 days' notice for any reason.`
      },
      { 
        name: 'Board Resolution', 
        type: 'Corporate', 
        content: `BOARD RESOLUTION OF [COMPANY NAME]

WHEREAS, the Board of Directors deems it in the best interest of the Company to [ACTION/GOAL].

NOW, THEREFORE, BE IT RESOLVED, that the Company is authorized to [SPECIFIC AUTHORIZATION].

BE IT FURTHER RESOLVED, that the officers of the Company are authorized to execute any documents necessary to give effect to this resolution.

DATED: [DATE]
SIGNED: [SECRETARY NAME]`
      }
    ]
  };

  useEffect(() => {
    if (!auth.currentUser) return;

    const q = query(
      collection(db, 'projects'), 
      or(
        where('ownerId', '==', auth.currentUser.uid),
        where('members', 'array-contains', auth.currentUser.email)
      ),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const projectsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Project[];
      setAllProjects(projectsData);
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'projects');
    });

    return () => unsubscribe();
  }, [auth.currentUser]);

  const projects = allProjects.filter(p => 
    (filter === 'All' || p.category === filter) &&
    (p.name?.toLowerCase() || '').includes(searchQuery.toLowerCase())
  );

  const handleCreateProject = async () => {
    if (!newProject.name || !auth.currentUser) return;
    
    const projectId = `proj_${Date.now()}`;
    const projectData = {
      id: projectId,
      name: newProject.name,
      description: newProject.description,
      count: newProject.template !== 'None' ? 3 : 0,
      status: 'Active',
      lead: newProject.lead,
      category: newProject.category,
      ownerId: auth.currentUser.uid,
      members: [auth.currentUser.email],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'projects', projectId), projectData);
      
      // If template selected, create initial documents
      if (newProject.template !== 'None') {
        const templates = WORKSPACE_TEMPLATES[newProject.template as keyof typeof WORKSPACE_TEMPLATES] || [];
        for (const templateDoc of templates) {
          const docId = `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          await setDoc(doc(db, 'contracts', docId), {
            id: docId,
            name: templateDoc.name,
            status: 'Drafting',
            type: templateDoc.type,
            source: 'Hub',
            ownerId: auth.currentUser.uid,
            projectId: projectId,
            content: templateDoc.content,
            analysis: JSON.stringify({
              name: templateDoc.name,
              rawText: templateDoc.content,
              counterparty: 'Pending',
              jurisdiction: 'Pending',
              governingLaw: 'Pending',
              terminationNotice: 'Pending',
              expiry: 'Pending',
              riskLevel: 'Medium Risk',
              riskScore: 0,
              summary: 'Initial template generated. Run AI Deep Analysis for a full legal breakdown.',
              parties: [],
              signatories: [],
              keyClauses: [],
              keyObligations: [],
              missingProtections: [],
              directive: 'Workspace initialized. Run portfolio audit to generate strategic directives.'
            }),
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            auditLogs: [
              { 
                id: crypto.randomUUID(), 
                userId: auth.currentUser.uid, 
                userName: auth.currentUser.displayName || 'User', 
                action: `Workspace Initialized: ${templateDoc.name}`, 
                details: `Automatically generated ${templateDoc.name} as part of the new project workspace deployment. Baseline legal analysis initiated.`,
                timestamp: new Date().toISOString() 
              }
            ]
          });
        }
      }

      setIsModalOpen(false);
      setNewProject({
        name: '',
        description: '',
        category: 'Legal',
        lead: 'Sarah Jenkins',
        template: 'None'
      });
      navigate(`/project/${projectId}`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}`);
    }
  };

  const handleDeleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Workspace',
      message: 'Are you sure you want to delete this workspace and all its data? This action cannot be undone.',
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteDoc(doc(db, 'projects', id));
          setActiveMenuId(null);
        } catch (error: any) {
          console.error("Delete failed:", error);
          handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
        }
      }
    });
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !newProject.name) return;
    
    try {
      await setDoc(doc(db, 'projects', editingProject.id), {
        name: newProject.name,
        description: newProject.description,
        category: newProject.category,
        lead: newProject.lead,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsEditModalOpen(false);
      setEditingProject(null);
      setNewProject({ name: '', description: '', category: 'Legal', lead: 'Sarah Jenkins', template: 'None' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${editingProject.id}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden relative">
      <TopBar 
        title="Workflow Engine"
        actions={
          <div className="flex items-center gap-3">
             <div className="flex bg-surface-container border border-outline/20 rounded p-0.5">
                {(['All', 'HR', 'Vendor', 'Strategic'] as const).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded text-[8px] font-bold uppercase tracking-widest transition-all ${filter === f ? 'bg-surface text-primary shadow-sm' : 'text-on-surface/40 hover:text-on-surface/60'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-1.5 bg-primary text-on-primary rounded text-[9px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
              >
                <Plus className="h-3 w-3 mr-1 inline" />
                New Project
              </button>
          </div>
        }
      />

      <div className="px-8 py-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-1">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-primary/40 leading-none mb-2">Workspace Intelligence</p>
          <div className="flex items-end justify-between">
            <h1 className="text-2xl font-black text-primary tracking-tighter leading-none">Project Workspaces</h1>
            <div className="flex items-center gap-1.5 text-[9px] font-black text-on-surface/30 uppercase tracking-[0.2em]">
              <Calendar className="h-3 w-3" />
              <span>{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).toUpperCase()}</span>
            </div>
          </div>
        </header>

        {/* Edit Modal */}
        {isEditModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface border border-outline rounded-[32px] p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">Edit Workspace</h2>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface/40">Update the details for your legal workflow</p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Workspace Name</label>
                  <input 
                    type="text"
                    autoFocus
                    value={newProject.name}
                    onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                    placeholder="e.g. Q4 Global Review"
                    className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Description</label>
                  <textarea 
                    rows={3}
                    value={newProject.description}
                    onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                    placeholder="Brief objective of this workspace..."
                    className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Category</label>
                    <select 
                      value={newProject.category}
                      onChange={(e) => setNewProject({...newProject, category: e.target.value as any})}
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
                      value={newProject.lead}
                      onChange={(e) => setNewProject({...newProject, lead: e.target.value})}
                      placeholder="Lead Name"
                      className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleUpdateProject}
                  disabled={!newProject.name}
                  className="w-full py-4 bg-primary text-on-primary rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 mt-4"
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Modal Overlay */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface border border-outline rounded-[32px] p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">Create Workspace</h2>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface/40">Set up a new legal workflow</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-6">
                {/* Elegant Template Selector at the Top */}
                <div className="space-y-2 relative">
                   <label className="text-[10px] font-black uppercase tracking-[0.3em] text-secondary-content ml-1">Choose a Blueprint</label>
                   <button 
                     onClick={() => setIsTemplateDropdownOpen(!isTemplateDropdownOpen)}
                     className="w-full bg-secondary/5 border-2 border-secondary/20 text-primary px-5 py-4 rounded-3xl text-sm font-bold flex items-center justify-between hover:bg-secondary/10 transition-all group shadow-sm"
                   >
                     <div className="flex items-center gap-3">
                        <Sparkles className="h-4 w-4 text-secondary-content" />
                        <span>{newProject.template === 'None' ? 'Blank Workspace' : 
                          newProject.template === 'HR' ? 'HR & Employment Pack' :
                          newProject.template === 'Vendor' ? 'Vendor Management Suite' :
                          newProject.template === 'Strategic' ? 'Strategic Partnership Kit' :
                          'Legal Foundation Set'}</span>
                     </div>
                     <ChevronRight className={`h-4 w-4 transition-transform duration-300 ${isTemplateDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
                   </button>

                   <AnimatePresence>
                     {isTemplateDropdownOpen && (
                       <>
                         <div className="fixed inset-0 z-10" onClick={() => setIsTemplateDropdownOpen(false)} />
                         <motion.div 
                           initial={{ opacity: 0, y: 10, scale: 0.95 }}
                           animate={{ opacity: 1, y: 0, scale: 1 }}
                           exit={{ opacity: 0, y: 10, scale: 0.95 }}
                           className="absolute top-full left-0 right-0 mt-3 bg-surface border border-outline rounded-[32px] shadow-2xl z-20 py-3 p-3 space-y-1"
                         >
                           {[
                             { key: 'None', label: 'Blank Workspace', icon: FolderPlus, sub: 'Start with an empty project' },
                             { key: 'HR', label: 'HR & Employment', icon: UserPlus, sub: 'Onboarding & Employee records' },
                             { key: 'Vendor', label: 'Vendor Suite', icon: ShieldCheck, sub: 'SLA & Supplier lifecycle' },
                             { key: 'Strategic', label: 'Strategic Kit', icon: FileText, sub: 'Alliances & Investments' },
                             { key: 'Legal', label: 'Legal Foundation', icon: Calendar, sub: 'Corporate & Governance' }
                           ].map((item) => (
                             <button 
                               key={`template-option-${item.key}`}
                               onClick={() => handleSelectTemplate(item.key)}
                               className={`w-full flex items-center gap-4 p-3.5 rounded-2xl transition-all text-left group ${newProject.template === item.key ? 'bg-primary text-on-primary' : 'hover:bg-surface-container text-primary'}`}
                             >
                               <div className={`w-9 h-9 rounded-xl flex items-center justify-center transition-all ${newProject.template === item.key ? 'bg-white/20' : 'bg-primary/5 group-hover:bg-primary group-hover:text-on-primary'}`}>
                                 <item.icon className="h-4 w-4" />
                               </div>
                               <div>
                                 <p className="text-[11px] font-bold tracking-tight leading-none">{item.label}</p>
                                 <p className={`text-[9px] mt-1 font-medium ${newProject.template === item.key ? 'text-white/60' : 'text-on-surface-variant/40'}`}>{item.sub}</p>
                               </div>
                             </button>
                           ))}
                         </motion.div>
                       </>
                     )}
                   </AnimatePresence>
                </div>

                <div className="h-px bg-outline/50 mx-2" />

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Workspace Name</label>
                    <input 
                      type="text"
                      value={newProject.name}
                      onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                      placeholder="e.g. Q4 Global Review"
                      className="w-full bg-surface-container px-5 py-4 rounded-2xl border border-outline focus:border-primary transition-all text-sm font-bold outline-none shadow-sm"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Description</label>
                    <textarea 
                      rows={3}
                      value={newProject.description}
                      onChange={(e) => setNewProject({...newProject, description: e.target.value})}
                      placeholder="Brief objective of this workspace..."
                      className="w-full bg-surface-container px-5 py-4 rounded-2xl border border-outline focus:border-primary transition-all text-sm font-bold outline-none resize-none shadow-sm"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Category</label>
                      <select 
                        value={newProject.category}
                        onChange={(e) => setNewProject({...newProject, category: e.target.value as any})}
                        className="w-full bg-surface-container px-5 py-4 rounded-2xl border border-outline focus:border-primary transition-all text-sm font-bold outline-none appearance-none cursor-pointer shadow-sm"
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
                        value={newProject.lead}
                        onChange={(e) => setNewProject({...newProject, lead: e.target.value})}
                        placeholder="Name"
                        className="w-full bg-surface-container px-5 py-4 rounded-2xl border border-outline focus:border-primary transition-all text-sm font-bold outline-none shadow-sm"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <button 
                    onClick={handleCreateProject}
                    disabled={!newProject.name}
                    className="w-full py-5 bg-primary text-on-primary rounded-3xl text-[11px] font-extrabold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    Launch Workspace
                  </button>
                  {newProject.template !== 'None' && (
                    <p className="text-[9px] text-secondary-content font-bold uppercase tracking-widest text-center mt-4 animate-pulse">
                      Generating {newProject.template} Preset Assets...
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        )}

        <div id="walkthrough-projects-view" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project, i) => (
            <motion.div
              key={`project-card-${project.id}`}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => navigate(`/project/${project.id}`)}
              className="bg-surface-container-low border border-outline rounded-[32px] p-6 hover:shadow-xl hover:shadow-black/5 transition-all group cursor-pointer flex flex-col justify-between h-[260px] relative overflow-hidden"
            >
              <div className="relative z-10">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-extrabold text-secondary-content uppercase tracking-[0.2em]">{project.category}</span>
                    <div className={`text-[9px] font-extrabold uppercase tracking-widest w-fit ${
                      project.status === 'Active' ? 'text-success' : 
                      project.status === 'Review' ? 'text-warning' : 
                      project.status === 'Drafting' ? 'text-blue-500' :
                      project.status === 'Complete' ? 'text-primary' :
                      'text-primary/60'
                    }`}>
                      {project.status}
                    </div>
                  </div>
                  <div className="relative">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveMenuId(activeMenuId === project.id ? null : project.id);
                      }}
                      className="p-1 px-1.5 hover:bg-surface-container rounded-lg relative z-20"
                    >
                      <MoreVertical className="h-3.5 w-3.5 text-on-surface-variant/40" />
                    </button>
                    
                    <AnimatePresence>
                      {activeMenuId === project.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setActiveMenuId(null); }} />
                          <motion.div 
                            initial={{ opacity: 0, scale: 0.9, y: -10 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: -10 }}
                            className="absolute right-0 top-full mt-2 w-48 bg-surface border border-outline rounded-2xl shadow-2xl z-20 py-2 p-2"
                          >
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingProject(project);
                                setNewProject({ 
                                  name: project.name,
                                  description: project.description,
                                  category: project.category,
                                  lead: project.lead,
                                  template: 'None'
                                });
                                setIsEditModalOpen(true);
                                setActiveMenuId(null);
                              }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-primary/40" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Edit Workspace</span>
                            </button>
                            {project.ownerId === auth.currentUser?.uid && (
                              <button 
                                onClick={(e) => handleDeleteProject(project.id, e)}
                                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error transition-all text-left"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Delete Workspace</span>
                              </button>
                            )}
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                <h3 className="text-lg font-bold text-primary tracking-tight mb-2 group-hover:text-secondary transition-colors leading-tight">{project.name}</h3>
                <p className="text-[11px] text-on-surface-variant/70 line-clamp-3 leading-relaxed mb-4">
                  {project.description}
                </p>
              </div>

              <div className="relative z-10 flex flex-col gap-4">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface/60 uppercase tracking-widest leading-none">
                    <FileText className="h-3 w-3" />
                    <span>{project.count} Documents</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-on-surface/60 uppercase tracking-widest leading-none">
                    <Clock className="h-3 w-3" />
                    <span>Updated {formatFirebaseDate(project.updatedAt || project.lastUpdated)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-outline/50">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-surface-container border border-outline flex items-center justify-center text-[10px] font-bold text-primary">
                      {project.lead[0]}
                    </div>
                    <span className="text-[11px] font-bold text-primary/70">{project.lead}</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-primary/20 group-hover:text-primary group-hover:translate-x-1 transition-all" />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
      <ConfirmationModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        isDestructive={confirmModal.isDestructive}
        confirmLabel="Delete Workspace"
      />
    </div>
  );
}
