import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Building2, Shield, Globe, Briefcase, Users, Lock,
  ChevronRight, X, Sparkles, CheckCircle2, ArrowRight
} from 'lucide-react';

// ── Playbook Definitions ──────────────────────────────────────────────────────

export interface Playbook {
  id: string;
  name: string;
  description: string;
  tags: string[];
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  prompt: string;
  jurisdiction?: string;
}

export const PLAYBOOKS: Playbook[] = [
  {
    id: 'commercial-lease',
    name: 'Commercial Lease Audit',
    description: 'Review lease terms for break clauses, rent reviews, dilapidations, and service charge obligations.',
    tags: ['Real Estate', 'Landlord & Tenant', 'Property Law'],
    icon: Building2,
    color: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
    jurisdiction: 'UK, RSA, USA',
    prompt: `PLAYBOOK: Commercial Lease Audit
Apply a structured legal rubric to this commercial lease. You MUST identify and assess:
1. Break clause validity and notice requirements
2. Rent review mechanism (upward-only, open market, RPI-linked)
3. Service charge obligations and cap provisions
4. Dilapidations liability and schedule of condition
5. Alienation and subletting restrictions
6. Repair covenants (full repairing vs. internal-only)
7. Development and alteration rights
Score each item: PASS / RISK / CRITICAL. Reference relevant jurisdiction standards (RICS, SA Property Act, US Landlord Tenant Acts).`
  },
  {
    id: 'nda-audit',
    name: 'NDA Risk Audit',
    description: 'Stress-test mutual and one-way NDAs for enforceability, scope creep, and jurisdiction gaps.',
    tags: ['Confidentiality', 'IP Protection', 'Trade Secrets'],
    icon: Lock,
    color: 'text-purple-400 bg-purple-400/10 border-purple-400/20',
    jurisdiction: 'UK, EU, USA, RSA',
    prompt: `PLAYBOOK: NDA Risk Audit
Analyze this Non-Disclosure Agreement against international enforceability standards. Assess:
1. Definition of Confidential Information — is it too broad or too narrow?
2. Residuals clause — does it create a backdoor exception?
3. Duration of obligations — is it reasonable by jurisdiction standard?
4. Non-compete cross-contamination — does the NDA inadvertently restrict hiring?
5. Jurisdiction and governing law — is the choice clause enforceable?
6. Remedies — does it include injunctive relief and liquidated damages?
7. Return/destruction of information obligations
Flag each risk level: LOW / MEDIUM / HIGH. Reference: UK Coco v Clark, SA Companies Act, US Defend Trade Secrets Act 2016.`
  },
  {
    id: 'vendor-contract',
    name: 'Vendor Contract Review',
    description: 'Full-spectrum vendor agreement review covering SLAs, liability caps, IP ownership, and exit rights.',
    tags: ['Procurement', 'SLA', 'Indemnity', 'Exit'],
    icon: Briefcase,
    color: 'text-amber-400 bg-amber-400/10 border-amber-400/20',
    jurisdiction: 'UK, USA, EU',
    prompt: `PLAYBOOK: Vendor Contract Review
Perform a structured vendor/supplier contract review. Focus on:
1. Scope of services — is it sufficiently defined to prevent scope creep?
2. SLA metrics — are uptime, response time, and penalties clearly stated?
3. Liability cap — is it adequate relative to contract value?
4. Indemnification — does it cover IP infringement, data breaches, and negligence?
5. IP ownership — who owns work product, modifications, and derivatives?
6. Exit rights — termination for convenience, cause, and insolvency
7. Data protection obligations and subprocessor consent
8. Audit rights and transparency requirements
Severity: LOW / MEDIUM / CRITICAL. Reference: GDPR Art. 28, UK Consumer Rights Act, US UCC.`
  },
  {
    id: 'ip-agreement',
    name: 'IP Agreement Review',
    description: 'Assess assignment, licensing, and joint ownership clauses to protect intellectual property portfolios.',
    tags: ['Patents', 'Trademarks', 'Copyright', 'Trade Secrets'],
    icon: Shield,
    color: 'text-green-400 bg-green-400/10 border-green-400/20',
    jurisdiction: 'UK, USA, EU, RSA',
    prompt: `PLAYBOOK: IP Agreement Review
Analyze this intellectual property agreement against international IP law standards. Assess:
1. Assignment vs. license — is the transfer of rights clearly defined?
2. Scope of license — exclusive, non-exclusive, field-of-use restrictions?
3. Moral rights — waiver provisions under UK CDPA / EU directives?
4. Joint ownership — decision-making rights, licensing consent, commercialization splits?
5. Improvement clauses — who owns future enhancements?
6. Non-assert / patent pools — any hidden restrictions?
7. Termination consequences — what happens to sublicenses?
8. Revenue sharing / royalty calculation methodology
Risk: COMPLIANT / RISK / CRITICAL. Reference: UK CDPA 1988, US Patent Act, WIPO treaties, SA Copyright Act.`
  },
  {
    id: 'employment-contract',
    name: 'Employment Contract',
    description: 'Identify non-compete enforceability, garden leave provisions, and statutory compliance gaps.',
    tags: ['Labour Law', 'HR', 'Non-Compete', 'BCEA'],
    icon: Users,
    color: 'text-rose-400 bg-rose-400/10 border-rose-400/20',
    jurisdiction: 'RSA, UK, USA',
    prompt: `PLAYBOOK: Employment Contract Review
Review this employment agreement for statutory compliance and enforceability risks:
1. Non-compete scope — is it geographically and temporally reasonable?
2. Garden leave — is it properly drafted and compensated?
3. Restraint of trade — enforceability under applicable jurisdiction
4. IP assignment — does it capture pre-existing IP correctly?
5. Confidentiality — post-employment obligations and duration
6. Termination provisions — notice periods, summary dismissal, PILON
7. Statutory compliance — minimum wage, leave entitlement, pension auto-enrolment
8. Dispute resolution — arbitration vs. Employment Tribunal
Status per item: COMPLIANT / AT RISK / NON-COMPLIANT. Reference: SA BCEA, UK Employment Rights Act 1996, US FLSA.`
  },
  {
    id: 'gdpr-compliance',
    name: 'GDPR Compliance Audit',
    description: 'Check data processing agreements, controller/processor definitions, and retention policy compliance.',
    tags: ['GDPR', 'Data Protection', 'POPIA', 'Privacy'],
    icon: Globe,
    color: 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20',
    jurisdiction: 'EU, UK, RSA',
    prompt: `PLAYBOOK: GDPR / Data Protection Compliance Audit
Audit this document for data protection compliance across EU GDPR, UK GDPR, and SA POPIA:
1. Lawful basis for processing — identified and documented?
2. Data subject rights — access, erasure, portability, objection?
3. Controller / Processor definitions — correctly identified?
4. DPA (Data Processing Agreement) — Article 28 requirements met?
5. International transfers — adequacy decisions, SCCs, BCRs in place?
6. Data retention periods — documented and justified?
7. Privacy by design — technical and organisational measures?
8. Breach notification — 72-hour reporting window provisions?
9. DPO appointment — required or optional for this organisation?
Compliance: COMPLIANT / PARTIAL / NON-COMPLIANT. Reference: EU GDPR 2016/679, UK GDPR, SA POPIA 2013.`
  }
];

// ── Component ─────────────────────────────────────────────────────────────────

interface PlaybookSelectorProps {
  selectedId: string | null;
  onSelect: (playbook: Playbook | null) => void;
  compact?: boolean;
}

export function PlaybookSelector({ selectedId, onSelect, compact = false }: PlaybookSelectorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const selected = PLAYBOOKS.find(p => p.id === selectedId) || null;

  if (compact) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setIsExpanded(v => !v)}
          className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
            selected
              ? 'bg-[#E2FF6F]/10 border-[#E2FF6F]/30 text-white'
              : 'bg-white/5 border-white/10 text-white/50 hover:border-white/20 hover:text-white/70'
          }`}
        >
          <div className="flex items-center gap-3">
            {selected ? (
              <>
                <selected.icon className="h-4 w-4 text-white" />
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#E2FF6F]">Playbook Active</p>
                  <p className="text-[12px] font-bold text-white">{selected.name}</p>
                </div>
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-white/30" />
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Optional</p>
                  <p className="text-[11px] font-bold">Select Analysis Playbook</p>
                </div>
              </>
            )}
          </div>
          <ChevronRight className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
        </button>

        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 gap-2 pt-1">
                {selected && (
                  <button
                    onClick={() => { onSelect(null); setIsExpanded(false); }}
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-white/60 transition-all flex items-center gap-2"
                  >
                    <X className="h-3 w-3" /> Clear Playbook (Generic Analysis)
                  </button>
                )}
                {PLAYBOOKS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { onSelect(p); setIsExpanded(false); }}
                    className={`w-full text-left px-4 py-3 rounded-xl border transition-all flex items-center gap-3 ${
                      selectedId === p.id
                        ? 'bg-[#E2FF6F]/10 border-[#E2FF6F]/30'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <p.icon className="h-4 w-4 shrink-0 text-white" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-bold text-white truncate">{p.name}</p>
                      <p className="text-[8px] font-bold text-white/30 uppercase tracking-widest">{p.jurisdiction}</p>
                    </div>
                    {selectedId === p.id && <CheckCircle2 className="h-3.5 w-3.5 text-[#E2FF6F] shrink-0" />}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // Full gallery mode
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {PLAYBOOKS.map(p => (
        <motion.button
          key={p.id}
          onClick={() => onSelect(selectedId === p.id ? null : p)}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.98 }}
          className={`text-left p-6 rounded-3xl border transition-all ${
            selectedId === p.id
              ? 'bg-primary/10 border-primary shadow-lg shadow-primary/10'
              : 'bg-surface-container border-outline/20 hover:border-primary/40 hover:bg-surface-container-high'
          }`}
        >
          <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center mb-4 ${p.color}`}>
            <p.icon className="h-5 w-5" />
          </div>
          <h4 className="text-[13px] font-black text-on-surface mb-1">{p.name}</h4>
          <p className="text-[10px] font-medium text-on-surface/50 leading-relaxed mb-3">{p.description}</p>
          <div className="flex flex-wrap gap-1">
            {p.tags.slice(0, 2).map(tag => (
              <span key={tag} className="px-2 py-0.5 bg-primary/5 text-primary rounded-full text-[7px] font-black uppercase tracking-widest">
                {tag}
              </span>
            ))}
          </div>
          {selectedId === p.id && (
            <div className="mt-4 pt-4 border-t border-primary/20 flex items-center gap-2 text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span className="text-[9px] font-black uppercase tracking-widest">Selected</span>
            </div>
          )}
        </motion.button>
      ))}
    </div>
  );
}
