import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { 
  FolderPlus, Search, MoreVertical, 
  Calendar, FileText, UserPlus, 
  ChevronRight, Clock, ShieldCheck, X, Trash2, Edit3
} from 'lucide-react';
import { db, auth, OperationType, handleFirestoreError } from '../lib/firebase';
import { collection, onSnapshot, query, where, setDoc, doc, serverTimestamp, orderBy, or, deleteDoc } from 'firebase/firestore';

interface Project {
  id: string;
  name: string;
  description: string;
  count: number;
  lastUpdated: any;
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
  const [isRenameModalOpen, setIsRenameModalOpen] = useState(false);
  const [renamingProject, setRenamingProject] = useState<Project | null>(null);
  const [newProject, setNewProject] = useState({
    name: '',
    description: '',
    category: 'Legal' as Project['category'],
    lead: 'Sarah Jenkins'
  });

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
      count: 0,
      status: 'Active',
      lead: newProject.lead,
      category: newProject.category,
      ownerId: auth.currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await setDoc(doc(db, 'projects', projectId), projectData);
      setIsModalOpen(false);
      setNewProject({
        name: '',
        description: '',
        category: 'Legal',
        lead: 'Sarah Jenkins'
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `projects/${projectId}`);
    }
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Are you sure you want to delete this workspace and all its data?")) return;
    
    try {
      await deleteDoc(doc(db, 'projects', id));
      setActiveMenuId(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `projects/${id}`);
    }
  };

  const handleRenameProject = async () => {
    if (!renamingProject || !newProject.name) return;
    
    try {
      await setDoc(doc(db, 'projects', renamingProject.id), {
        name: newProject.name,
        updatedAt: serverTimestamp()
      }, { merge: true });
      setIsRenameModalOpen(false);
      setRenamingProject(null);
      setNewProject({ name: '', description: '', category: 'Legal', lead: 'Sarah Jenkins' });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `projects/${renamingProject.id}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface overflow-hidden relative">
      <div className="px-8 py-8 space-y-8 overflow-y-auto custom-scrollbar flex-1">
        <header className="flex flex-col gap-1">
          <p className="text-[10px] font-bold text-primary/80 tracking-[0.4em] uppercase leading-none mb-1">Workflow Engine</p>
          <div className="flex items-end justify-between">
            <h1 className="text-2xl font-bold text-primary tracking-tighter leading-none">Project Workspaces</h1>
            <div className="flex items-center gap-4">
              <div className="flex bg-surface-container border border-outline rounded-xl p-1">
                {(['All', 'HR', 'Vendor', 'Strategic'] as const).map((f) => (
                  <button 
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${filter === f ? 'bg-primary text-white shadow-md' : 'text-primary/40 hover:text-primary'}`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-on-surface/40" />
                <input 
                  type="text" 
                  placeholder="Filter workspaces..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 bg-surface-container-low border border-outline rounded-xl text-[11px] font-bold outline-none focus:ring-1 focus:ring-primary/20 w-48 transition-all"
                />
              </div>
              <button 
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl text-[10px] font-bold uppercase tracking-widest shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                <FolderPlus className="h-3.5 w-3.5" />
                New Project
              </button>
            </div>
          </div>
        </header>

        {/* Rename Modal */}
        {isRenameModalOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-surface border border-outline rounded-[32px] p-8 w-full max-w-md shadow-2xl"
            >
              <div className="flex justify-between items-start mb-6">
                <div>
                  <h2 className="text-xl font-bold text-primary tracking-tight">Rename Workspace</h2>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface/40">Update the name for your legal workflow</p>
                </div>
                <button onClick={() => setIsRenameModalOpen(false)} className="p-2 hover:bg-surface-container rounded-full transition-colors">
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">New Workspace Name</label>
                  <input 
                    type="text"
                    autoFocus
                    value={newProject.name}
                    onChange={(e) => setNewProject({...newProject, name: e.target.value})}
                    onKeyDown={(e) => e.key === 'Enter' && handleRenameProject()}
                    placeholder="e.g. Q4 Global Review"
                    className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                  />
                </div>

                <button 
                  onClick={handleRenameProject}
                  disabled={!newProject.name}
                  className="w-full py-4 bg-primary text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 mt-4"
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

              <div className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-primary/60 ml-1">Workspace Name</label>
                  <input 
                    type="text"
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
                      placeholder="Name"
                      className="w-full bg-surface-container px-4 py-3 rounded-2xl border border-outline focus:border-primary transition-colors text-sm font-bold outline-none"
                    />
                  </div>
                </div>

                <button 
                  onClick={handleCreateProject}
                  disabled={!newProject.name}
                  className="w-full py-4 bg-primary text-white rounded-2xl text-xs font-bold uppercase tracking-[0.2em] shadow-xl shadow-primary/20 hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 disabled:grayscale mt-4"
                >
                  Launch Workspace
                </button>
              </div>
            </motion.div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                                setRenamingProject(project);
                                setNewProject({ ...newProject, name: project.name });
                                setIsRenameModalOpen(true);
                                setActiveMenuId(null);
                              }}
                              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-surface-container text-primary transition-all text-left"
                            >
                              <Edit3 className="h-3.5 w-3.5 text-primary/40" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Rename Workspace</span>
                            </button>
                            <button 
                              onClick={(e) => handleDeleteProject(project.id, e)}
                              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-error/10 text-error transition-all text-left"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              <span className="text-[10px] font-bold uppercase tracking-widest">Delete Workspace</span>
                            </button>
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
                    <span>Updated {project.lastUpdated}</span>
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
    </div>
  );
}
