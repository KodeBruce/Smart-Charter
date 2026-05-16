import React from 'react';
import { useFirebase } from '../lib/FirebaseProvider';
import { Scale, ArrowRight, Shield, Zap, Search, Globe, Activity, Layers } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const { signInWithGoogle, authLoading } = useFirebase();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#050505] relative overflow-hidden font-sans selection:bg-secondary/30 selection:text-secondary">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1.5 }}
        className="w-full max-w-[900px] flex flex-col md:flex-row items-stretch border border-white/5 rounded-[40px] overflow-hidden bg-[#0A0A0A] shadow-2xl relative"
      >
        {/* Left Side: Detailed Intelligence Map (Line Style) */}
        <div className="flex-1 p-12 border-r border-white/5 bg-gradient-to-br from-white/[0.02] to-transparent hidden md:flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-3 mb-10">
              <div className="h-10 w-10 flex items-center justify-center">
                <Scale className="h-7 w-7 text-secondary" />
              </div>
              <span className="text-white font-bold tracking-tight text-xl">Smart Charter</span>
            </div>

            <div className="space-y-10">
              <div className="relative pl-8 border-l border-white/10">
                <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-secondary shadow-[0_0_10px_#E2FF6F]" />
                <h3 className="text-white text-sm font-bold uppercase tracking-widest mb-2">Negotiation Simulator</h3>
                <p className="text-white/40 text-[13px] leading-relaxed max-w-[280px]">
                  AI-driven redlining that suggests contract language corroborated by global legal standards and precedents.
                </p>
              </div>

              <div className="relative pl-8 border-l border-white/10">
                <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-white/20" />
                <h3 className="text-white text-sm font-bold uppercase tracking-widest mb-2">Obligation Tracker</h3>
                <p className="text-white/40 text-[13px] leading-relaxed max-w-[280px]">
                  Neural extraction of all key dates, payment terms, and delivery milestones with automated sentinel alerts.
                </p>
              </div>

              <div className="relative pl-8 border-l border-white/10">
                <div className="absolute -left-[5px] top-0 w-2.5 h-2.5 rounded-full bg-white/20" />
                <h3 className="text-white text-sm font-bold uppercase tracking-widest mb-2">Compliance Radar</h3>
                <p className="text-white/40 text-[13px] leading-relaxed max-w-[280px]">
                  Real-time monitoring of jurisdictional shifts across EU, USA, UK, and RSA to ensure perpetual alignment.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-6 opacity-30">
            <div className="flex items-center gap-2">
              <Globe className="h-3.5 w-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white">Multijurisdictional</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className="h-3.5 w-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-widest text-white">Live Sentinel</span>
            </div>
          </div>
        </div>

        {/* Right Side: Authentication Node */}
        <div className="w-full md:w-[400px] p-12 flex flex-col justify-center relative bg-[#0D0D0D]">
          <div className="mb-10 md:hidden">
             <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Smart Charter</h1>
             <p className="text-white/40 text-[13px]">Strategic Intelligence Infrastructure</p>
          </div>

          <div className="space-y-8">
            <div>
              <h2 className="text-white text-2xl font-bold tracking-tight mb-2">Initialize Node</h2>
              <p className="text-white/40 text-sm leading-relaxed">
                Connect your account to access your secure document vault and AI intelligence nodes.
              </p>
            </div>

            <button 
              onClick={() => signInWithGoogle()}
              disabled={authLoading}
              className="w-full flex items-center justify-between gap-4 bg-white text-black h-16 px-8 rounded-2xl text-[15px] font-bold hover:bg-secondary active:scale-[0.98] transition-all disabled:opacity-50 group shadow-2xl shadow-white/5"
            >
              {authLoading ? (
                <div className="mx-auto h-5 w-5 border-2 border-black/20 border-t-black rounded-full animate-spin" />
              ) : (
                <>
                  <div className="flex items-center gap-4">
                    <img src="https://www.google.com/favicon.ico" alt="Google" className="h-5 w-5" />
                    <span>Authorize with Google</span>
                  </div>
                  <ArrowRight className="h-5 w-5 opacity-30 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                </>
              )}
            </button>

            <div className="pt-8 border-t border-white/5 grid grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                <Layers className="h-4 w-4 text-secondary mb-3" />
                <p className="text-white text-[11px] font-bold uppercase tracking-widest mb-1">Architecture</p>
                <p className="text-white/30 text-[10px]">Cloud-Native</p>
              </div>
              <div className="p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                <Shield className="h-4 w-4 text-secondary mb-3" />
                <p className="text-white text-[11px] font-bold uppercase tracking-widest mb-1">Security</p>
                <p className="text-white/30 text-[10px]">E2E Encrypted</p>
              </div>
            </div>
          </div>

          <div className="mt-12 flex items-center justify-between opacity-20">
            <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-white">System v2.1</span>
            <div className="flex gap-1">
              <div className="w-1 h-1 rounded-full bg-secondary animate-pulse" />
              <div className="w-1 h-1 rounded-full bg-secondary animate-pulse delay-75" />
              <div className="w-1 h-1 rounded-full bg-secondary animate-pulse delay-150" />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}


