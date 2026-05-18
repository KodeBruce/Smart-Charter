import React, { useEffect, useRef, forwardRef, useImperativeHandle, useState, useMemo } from 'react';
import { useEditor, EditorContent, Editor, Extension } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import { Search, Edit3, Eye, CheckCircle2, X, Files, Clock } from 'lucide-react';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LegalEditorHandle {
  scrollToText: (searchTerm: string, isRewrite?: boolean) => void;
  getText: () => string;
  setContent: (text: string) => void;
  getEditor: () => Editor | null;
}

interface LegalEditorProps {
  initialContent: string;
  referenceContent?: string;
  readOnly?: boolean;
  onChange?: (text: string) => void;
  showToolbar?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Normalizes text by removing all non-alphanumeric characters for robust fuzzy matching */
const onlyLetters = (str: string) => str.toLowerCase().replace(/[^a-z0-9]/g, '');

const plainTextToTiptap = (text: string) => {
  const delimiter = text.includes('\n\n') ? '\n\n' : '\n';
  const paragraphs = text.split(delimiter).filter(p => p.trim());
  return {
    type: 'doc',
    content: paragraphs.map(para => {
      if (para.startsWith('# ')) {
        return { 
          type: 'heading', 
          attrs: { level: 1 }, 
          content: [{ type: 'text', text: para.replace('# ', '').trim() }] 
        };
      }
      if (para.startsWith('## ')) {
        return { 
          type: 'heading', 
          attrs: { level: 2 }, 
          content: [{ type: 'text', text: para.replace('## ', '').trim() }] 
        };
      }
      if (para.startsWith('### ')) {
        return { 
          type: 'heading', 
          attrs: { level: 3 }, 
          content: [{ type: 'text', text: para.replace('### ', '').trim() }] 
        };
      }
      
      return {
        type: 'paragraph',
        content: para.trim() ? [{ type: 'text', text: para.trim() }] : [],
      };
    }),
  };
};

interface DiffToken {
  type: 'added' | 'removed' | 'common';
  value: string;
}

const diffWords = (oldStr: string, newStr: string): DiffToken[] => {
  const oldWords = oldStr.split(/(\s+)/).filter(Boolean);
  const newWords = newStr.split(/(\s+)/).filter(Boolean);

  const dp: number[][] = Array(oldWords.length + 1)
    .fill(0)
    .map(() => Array(newWords.length + 1).fill(0));

  for (let i = 1; i <= oldWords.length; i++) {
    for (let j = 1; j <= newWords.length; j++) {
      if (oldWords[i - 1] === newWords[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  const result: DiffToken[] = [];
  let i = oldWords.length;
  let j = newWords.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldWords[i - 1] === newWords[j - 1]) {
      result.unshift({ type: 'common', value: oldWords[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.unshift({ type: 'added', value: newWords[j - 1] });
      j--;
    } else {
      result.unshift({ type: 'removed', value: oldWords[i - 1] });
      i--;
    }
  }

  return result;
};

const getDiffDecorations = (doc: any, refBlocksRef: React.MutableRefObject<string[]>) => {
  const decorations: any[] = [];
  let blockIdx = 0;
  const refBlocks = refBlocksRef.current || [];

  doc.descendants((node: any, pos: number) => {
    if (node.isBlock) {
      const text = node.textContent;
      const refText = refBlocks[blockIdx] || '';
      
      let cleanRef = refText;
      if (cleanRef.startsWith('# ')) cleanRef = cleanRef.replace('# ', '');
      if (cleanRef.startsWith('## ')) cleanRef = cleanRef.replace('## ', '');
      if (cleanRef.startsWith('### ')) cleanRef = cleanRef.replace('### ', '');

      let cleanNew = text;
      
      const tokens = diffWords(cleanRef, cleanNew);
      let offset = 0;

      tokens.forEach(token => {
        if (token.type === 'common') {
          offset += token.value.length;
        } else if (token.type === 'added') {
          const start = pos + 1 + offset;
          const end = start + token.value.length;
          
          if (start >= pos + 1 && end <= pos + 1 + node.nodeSize) {
            decorations.push(
              Decoration.inline(start, end, {
                class: 'bg-green-500/12 border-b border-green-500/30 text-on-surface font-semibold px-0.5 rounded-sm transition-all duration-300'
              })
            );
          }
          offset += token.value.length;
        }
      });

      blockIdx++;
      return false; 
    }
    return true;
  });

  return DecorationSet.create(doc, decorations);
};

const createLiveDiffExtension = (refBlocksRef: React.MutableRefObject<string[]>) => {
  return Extension.create({
    name: 'liveDiffHighlight',
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey('liveDiffHighlight'),
          state: {
            init(_, { doc }) {
              if (!refBlocksRef.current || refBlocksRef.current.length === 0) {
                return DecorationSet.empty;
              }
              return getDiffDecorations(doc, refBlocksRef);
            },
            apply(tr, oldDecos, oldState, newState) {
              if (tr.docChanged) {
                if (!refBlocksRef.current || refBlocksRef.current.length === 0) {
                  return DecorationSet.empty;
                }
                return getDiffDecorations(newState.doc, refBlocksRef);
              }
              return oldDecos.map(tr.mapping, newState.doc);
            }
          },
          props: {
            decorations(state) {
              return this.getState(state);
            }
          }
        })
      ];
    }
  });
};

const renderOriginalDiff = (oldText: string, newText: string) => {
  if (!newText || oldText === newText) {
    return <span>{oldText}</span>;
  }
  const diffs = diffWords(oldText, newText);
  return (
    <>
      {diffs.map((token, idx) => {
        if (token.type === 'removed') {
          return (
            <span 
              key={idx} 
              className="bg-red-500/15 border-b border-red-500/30 text-on-surface line-through px-0.5 rounded-sm inline transition-all duration-300"
            >
              {token.value}
            </span>
          );
        }
        if (token.type === 'common') {
          return <span key={idx}>{token.value}</span>;
        }
        return null;
      })}
    </>
  );
};

// ── Component ─────────────────────────────────────────────────────────────────

const LegalEditor = forwardRef<LegalEditorHandle, LegalEditorProps>(
  ({ initialContent, referenceContent, readOnly = false, onChange, showToolbar = true }, ref) => {
    const [editorView, setEditorView] = useState<'audit' | 'edit'>('edit');
    const [activeSearch, setActiveSearch] = useState<string | null>(null);
    const [activeBlockIdx, setActiveBlockIdx] = useState<number | null>(null);
    const [activeIsRewrite, setActiveIsRewrite] = useState(false);
    const [content, setContentState] = useState(initialContent);
    const blockRefs = useRef<(HTMLDivElement | null)[]>([]);

    // Parse blocks for the Audit View
    const blocks = useMemo(() => {
      if (!content) return [];
      const delimiter = content.includes('\n\n') ? '\n\n' : '\n';
      return content.split(delimiter).filter(p => p.trim());
    }, [content]);

    const refBlocks = useMemo(() => {
      const text = referenceContent || initialContent;
      const delimiter = text.includes('\n\n') ? '\n\n' : '\n';
      return text.split(delimiter).filter(b => b.trim().length > 0);
    }, [referenceContent, initialContent]);

    // Keep refBlocksRef updated for ProseMirror plugin
    const refBlocksRef = useRef<string[]>([]);
    useEffect(() => {
      refBlocksRef.current = referenceContent ? refBlocks : [];
    }, [referenceContent, refBlocks]);

    // Tiptap Editor for Edit Mode
    const editor = useEditor({
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
        Highlight.configure({ multicolor: true }),
        Placeholder.configure({ placeholder: 'Document content...' }),
        Typography,
        createLiveDiffExtension(refBlocksRef),
      ],
      content: plainTextToTiptap(content),
      editable: true,
      onUpdate: ({ editor }) => {
        const newText = editor.getText({ blockSeparator: '\n\n' });
        setContentState(newText);
        onChange?.(newText);
      },
    });

    // Sync external content changes
    useEffect(() => {
      if (initialContent !== content) {
        setContentState(initialContent);
        editor?.commands.setContent(plainTextToTiptap(initialContent));
      }
    }, [initialContent, editor]);

    // ── Search & Highlight Engine ───────────────────────
    
    const performSearch = (searchTerm: string, isRewrite: boolean = false) => {
      if (!searchTerm) {
        setActiveSearch(null);
        setActiveBlockIdx(null);
        return;
      }

      const normalizedSearch = onlyLetters(searchTerm);
      let foundIdx = -1;

      // Primary Scan: Find the block in the Audit/Summary view
      blocks.forEach((block, idx) => {
        if (onlyLetters(block).includes(normalizedSearch)) {
          foundIdx = idx;
        }
      });

      if (foundIdx !== -1) {
        setActiveBlockIdx(foundIdx);
        setActiveSearch(searchTerm);
        setActiveIsRewrite(isRewrite);
        
        setTimeout(() => {
          // 1. Scroll the Audit View block into view
          blockRefs.current[foundIdx]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          
          // 2. High-Fidelity Highlighting for the Editor (Right Side)
          if (isRewrite) {
             let attempts = 0;
             const applyGreenHighlight = () => {
                attempts++;
                const prosemirror = document.querySelector('.ProseMirror');
                if (prosemirror) {
                  const children = Array.from(prosemirror.children) as HTMLElement[];
                  const targetEl = children.find(el => 
                    onlyLetters(el.textContent || '').includes(normalizedSearch.substring(0, 50))
                  );

                  if (targetEl) {
                    targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    
                    const originalTransition = targetEl.style.transition;
                    targetEl.style.transition = 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)';
                    targetEl.style.border = '2px solid #22c55e';
                    targetEl.style.backgroundColor = 'rgba(34, 197, 94, 0.12)';
                    targetEl.style.boxShadow = '0 0 30px rgba(34, 197, 94, 0.3)';
                    targetEl.style.borderRadius = '12px';
                    targetEl.style.padding = '16px';
                    targetEl.style.margin = '8px -16px';
                    targetEl.style.zIndex = '10';
                    targetEl.style.position = 'relative';

                    let pulse = 0;
                    const pulseInterval = setInterval(() => {
                      pulse++;
                      targetEl.style.backgroundColor = pulse % 2 === 0 ? 'rgba(34, 197, 94, 0.15)' : 'rgba(34, 197, 94, 0.05)';
                      targetEl.style.boxShadow = pulse % 2 === 0 ? '0 0 40px rgba(34, 197, 94, 0.4)' : '0 0 10px rgba(34, 197, 94, 0.1)';
                      if (pulse > 10) clearInterval(pulseInterval);
                    }, 500);

                    setTimeout(() => {
                      targetEl.style.border = '';
                      targetEl.style.backgroundColor = '';
                      targetEl.style.boxShadow = '';
                      targetEl.style.padding = '';
                      targetEl.style.margin = '';
                      targetEl.style.borderRadius = '';
                      targetEl.style.zIndex = '';
                      targetEl.style.position = '';
                      targetEl.style.transition = originalTransition;
                    }, 6000);
                    return;
                  }
                }

                if (attempts < 20) {
                  setTimeout(applyGreenHighlight, 150);
                }
             };
             applyGreenHighlight();
          }
        }, 100);
      }
    };

    useImperativeHandle(ref, () => ({
      scrollToText: (searchTerm: string, isRewrite?: boolean) => {
        performSearch(searchTerm, isRewrite);
      },
      getText: () => content,
      setContent: (text: string) => {
        setContentState(text);
        editor?.commands.setContent(plainTextToTiptap(text));
      },
      getEditor: () => editor,
    }));

    // ── Sub-Components ──────────────────────────────────────────────────────

    const AuditBlock = ({ text, idx, mode = 'normal' }: { text: string; idx: number; mode?: 'original' | 'draft' | 'normal' }) => {
      const isActive = activeBlockIdx === idx;
      
      let isHeading1 = text.startsWith('# ');
      let isHeading2 = text.startsWith('## ');
      let isHeading3 = text.startsWith('### ');
      
      let cleanText = text;
      if (isHeading1) cleanText = text.replace('# ', '');
      if (isHeading2) cleanText = text.replace('## ', '');
      if (isHeading3) cleanText = text.replace('### ', '');

      let displayContent: React.ReactNode = cleanText;
      
      if (mode === 'original') {
        const corrText = blocks[idx] || '';
        let cleanCorr = corrText;
        if (corrText.startsWith('# ')) cleanCorr = corrText.replace('# ', '');
        if (corrText.startsWith('## ')) cleanCorr = corrText.replace('## ', '');
        if (corrText.startsWith('### ')) cleanCorr = corrText.replace('### ', '');
        displayContent = renderOriginalDiff(cleanText, cleanCorr);
      } else {
        const processText = (t: string) => {
          const boldParts = t.split(/(\*\*.*?\*\*)/g);
          return boldParts.map((p, i) => {
            if (p.startsWith('**') && p.endsWith('**')) {
              return <strong key={i} className="font-black text-on-surface">{p.slice(2, -2)}</strong>;
            }
            
            if (isActive && activeSearch) {
               const escapedSearch = activeSearch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
               const searchParts = p.split(new RegExp(`(${escapedSearch.split(' ').join('|')})`, 'gi'));
               return searchParts.map((sp, si) => 
                 activeSearch.toLowerCase().includes(sp.toLowerCase()) && sp.length > 3 ? (
                   <mark key={`${i}-${si}`} className="bg-red-500/20 border-b-2 border-red-500 text-on-surface px-0.5 rounded-sm transition-all duration-500 animate-pulse">
                     {sp}
                   </mark>
                 ) : sp
               );
            }
            return p;
          });
        };
        displayContent = processText(cleanText);
      }

      const headingClasses = isHeading1 ? 'text-lg font-black text-primary mb-4 mt-6' :
                            isHeading2 ? 'text-base font-black text-primary/80 mb-3 mt-4' :
                            isHeading3 ? 'text-sm font-bold text-on-surface mb-2 mt-3' :
                            'text-[14px] leading-relaxed text-on-surface/80';

      return (
        <div 
          ref={el => { blockRefs.current[idx] = el; }}
          className={`relative transition-all duration-500 ${
            isActive ? 'bg-red-500/[0.03]' : ''
          }`}
        >
          {isActive && (
            <div className="absolute -left-4 top-2 bottom-2 w-1 bg-red-500 rounded-full shadow-[2px_0_10px_rgba(239,68,68,0.2)] z-10 animate-in fade-in slide-in-from-left-1" />
          )}
          
          <div className={`${headingClasses}`}>
            {displayContent}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col w-full h-full bg-surface relative overflow-hidden">
        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        {showToolbar && (
          <div className="flex items-center justify-between px-8 py-3 border-b border-outline/10 bg-surface/80 backdrop-blur-xl sticky top-0 z-50 shadow-sm">
            <div className="flex items-center gap-6">
              <div className="flex p-1 bg-surface-container-high rounded-xl border border-outline/10">
                <button
                  onClick={() => setEditorView('audit')}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                    editorView === 'audit' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface/40 hover:text-on-surface'
                  }`}
                >
                  <Eye className="w-3.5 h-3.5" />
                  Audit View
                </button>
                <button
                  onClick={() => setEditorView('edit')}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                    editorView === 'edit' ? 'bg-primary text-on-primary shadow-md' : 'text-on-surface/40 hover:text-on-surface'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  Source Editor
                </button>
              </div>

              {activeSearch && editorView === 'audit' && (
                <div className="flex items-center gap-3 px-4 py-2 bg-red-500/5 border border-red-500/20 rounded-xl animate-in fade-in zoom-in-95">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-[10px] font-black text-red-600 uppercase tracking-wider truncate max-w-[200px]">
                    Focus: {activeSearch}
                  </span>
                  <button onClick={() => { setActiveSearch(null); setActiveBlockIdx(null); }} className="ml-2 hover:scale-110 transition-transform">
                    <X className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[10px] font-black text-on-surface/40 uppercase tracking-[0.2em]">
                  {editorView === 'edit' ? 'Live Editor' : 'Audit Engine Ready'}
                </span>
              </div>
              <div className="w-px h-4 bg-outline/20" />
              <div className="flex items-center gap-2 text-on-surface/30">
                 <Files className="w-4 h-4" />
                 <span className="text-[10px] font-bold uppercase tracking-widest">{blocks.length} Clauses</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Document Container ────────────────── */}
        <div className={`flex-1 overflow-y-auto custom-scrollbar select-text relative ${editorView !== 'audit' ? 'py-16' : ''}`}>
          {editorView !== 'audit' ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-start relative px-4 w-full animate-in fade-in duration-1000">
               <div className="absolute inset-y-0 left-1/2 w-[1px] bg-outline/10 hidden lg:block" />

               {/* Left Side: Original Document (Reference) */}
               <div className="space-y-16">
                  <div className="flex items-center gap-3 mb-12 opacity-30">
                     <Clock className="h-4 w-4" />
                     <span className="text-[10px] font-black uppercase tracking-[0.4em]">Original Document</span>
                  </div>
                  <div className="flex flex-col space-y-6">
                    {refBlocks.map((text, idx) => (
                      <div key={idx} className="transition-all duration-300">
                        <AuditBlock text={text} idx={idx} mode="original" />
                      </div>
                    ))}
                  </div>
               </div>

               {/* Right Side: Interactive TipTap Source Editor */}
               <div className="space-y-16">
                  <div className="flex items-center justify-between mb-12 border-b border-primary/10 pb-6">
                     <div className="flex items-center gap-3">
                        <Edit3 className="h-4 w-4 text-primary" />
                        <span className="text-[10px] font-black text-primary uppercase tracking-[0.4em]">Interactive Editor</span>
                     </div>
                     <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[9px] font-bold text-green-500 uppercase tracking-[0.3em]">Verified Live</span>
                     </div>
                  </div>
                  
                  <div className="max-w-none focus:outline-none min-h-[900px]">
                    <EditorContent 
                      editor={editor} 
                      className="text-on-surface/80 text-[14px] leading-relaxed [&_.ProseMirror]:outline-none [&_.ProseMirror_p]:mb-6 [&_.ProseMirror_h1]:text-lg [&_.ProseMirror_h1]:font-black [&_.ProseMirror_h1]:text-primary [&_.ProseMirror_h1]:mb-4 [&_.ProseMirror_h1]:mt-6 [&_.ProseMirror_h2]:text-base [&_.ProseMirror_h2]:font-black [&_.ProseMirror_h2]:text-primary/80 [&_.ProseMirror_h2]:mb-3 [&_.ProseMirror_h2]:mt-4 [&_.ProseMirror_h3]:text-sm [&_.ProseMirror_h3]:font-bold [&_.ProseMirror_h3]:text-on-surface [&_.ProseMirror_h3]:mb-2 [&_.ProseMirror_h3]:mt-3"
                    />
                  </div>
               </div>
            </div>
          ) : (
            /* Standard Audit View (Single Paper) */
            <div className="max-w-[900px] mx-auto my-16 bg-surface-container-lowest shadow-[0_30px_70px_rgba(0,0,0,0.12)] border border-outline/10 rounded-2xl min-h-[1150px] relative overflow-hidden transition-all duration-700">
              <div className="absolute left-[45px] top-0 bottom-0 w-px bg-outline/5 pointer-events-none" />
              <div className="p-20 py-24">
                <div className="flex flex-col space-y-2">
                  {blocks.map((text, idx) => (
                    <div key={idx} className="text-[14px] leading-relaxed text-on-surface/80">
                      <AuditBlock text={text} idx={idx} mode="normal" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Bottom Status Bar ────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-8 py-3 bg-surface border-t border-outline/5">
           <div className="flex items-center gap-4">
              <div className="w-2 h-2 rounded-full animate-pulse bg-primary" />
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-on-surface/40">
                {editorView === 'edit' ? 'Comparison Mode Active' : 'Standard Audit Mode'}
              </p>
           </div>
           
           <div className="flex items-center gap-6">
              <span className="text-[9px] font-bold text-on-surface/20 uppercase tracking-widest">
                Latent Space: 0.04s
              </span>
              <div className="w-px h-3 bg-outline/10" />
              <span className="text-[9px] font-bold text-on-surface/20 uppercase tracking-widest">
                Block Index: {activeBlockIdx !== null ? activeBlockIdx : 'None'}
              </span>
           </div>
        </div>
      </div>
    );
  }
);

LegalEditor.displayName = 'LegalEditor';
export default LegalEditor;
