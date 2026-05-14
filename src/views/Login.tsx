import React from 'react';
import { useFirebase } from '../lib/FirebaseProvider';
import { Gavel, Lock, ShieldCheck, Sparkles } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const { signInWithGoogle, authLoading } = useFirebase();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 relative overflow-hidden">
      {/* Structural background elements */}
      <div className="absolute top-0 left-0 w-full h-1 bg-outline" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-secondary/10 -z-10 blur-[120px] rounded-full animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-primary/5 -z-10 blur-[120px] rounded-full animate-pulse delay-1000" />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-[440px] flex flex-col items-center"
      >
        <div className="mb-14 flex flex-col items-center text-center">
          <div className="h-14 w-14 bg-[#1A1A1A] rounded-2xl flex items-center justify-center mb-8 shadow-2xl relative group">
            <Gavel className="h-7 w-7 text-[#E2FF6F]" />
            <Sparkles className="absolute -top-1 -right-1 h-4 w-4 text-secondary animate-pulse" />
            <div className="absolute -inset-1 bg-[#E2FF6F]/20 blur-md opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />
          </div>
          <h1 className="text-4xl font-bold text-primary tracking-tighter mb-3">Smart Charter</h1>
          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-on-surface-variant/40">Neural Contract Intelligence</p>
        </div>

        <div className="w-full bg-surface-container-low/50 backdrop-blur-xl border border-outline p-12 rounded-[42px] shadow-2xl shadow-black/[0.05] relative overflow-hidden transition-all duration-300">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="h-3 w-3 text-secondary" />
              <h2 className="text-sm font-bold text-primary tracking-tight">System Access Protocol</h2>
            </div>
            <p className="text-[11px] text-on-surface-variant/60 mb-10 font-bold uppercase tracking-widest">Authentication required for workspace entry.</p>
            
            <button 
              onClick={() => signInWithGoogle()}
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-4 bg-primary text-white py-4 px-6 rounded-2xl text-[11px] font-extrabold uppercase tracking-[0.15em] hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-black/10 group overflow-hidden relative disabled:opacity-50 disabled:hover:scale-100"
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
              {authLoading ? (
                <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <img src="https://www.google.com/favicon.ico" alt="Google" className="h-4 w-4 saturate-0 brightness-200" />
              )}
              {authLoading ? 'Authorizing...' : 'Continue with Google'}
            </button>

            <div className="mt-12 pt-10 border-t border-outline flex flex-col items-center gap-6">
              <div className="flex items-center gap-10 opacity-30">
                <Lock className="h-4 w-4 text-on-surface" />
                <div className="h-4 w-px bg-outline" />
                <ShieldCheck className="h-4 w-4 text-on-surface" />
              </div>
              <p className="text-[9px] text-on-surface-variant/30 font-bold uppercase tracking-[0.3em]">AES-256 Symmetric Encryption Active</p>
            </div>
          </div>
        </div>
        
        <div className="mt-16 flex items-center gap-6 opacity-30">
          <p className="text-[9px] font-bold uppercase tracking-[0.4em]">Integrated</p>
          <div className="w-1.5 h-1.5 rounded-full bg-outline" />
          <p className="text-[9px] font-bold uppercase tracking-[0.4em]">Autonomous</p>
          <div className="w-1.5 h-1.5 rounded-full bg-outline" />
          <p className="text-[9px] font-bold uppercase tracking-[0.4em]">Resilient</p>
        </div>
      </motion.div>
    </div>
  );
}
