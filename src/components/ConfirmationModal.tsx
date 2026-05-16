import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDestructive?: boolean;
  showCancel?: boolean;
}

export default function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  isDestructive = false,
  showCancel = true
}: ConfirmationModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]"
            onClick={onClose}
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[300px] bg-surface/95 backdrop-blur-2xl border border-outline/10 rounded-[24px] p-6 z-[201] shadow-2xl overflow-hidden"
          >
             <div className={`absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent ${isDestructive ? 'via-error/60' : 'via-primary/60'} to-transparent`} />

            <div className="flex flex-col gap-5">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-1 h-3 rounded-full ${isDestructive ? 'bg-error/60' : 'bg-primary/60'}`} />
                  <h3 className="text-[11px] font-semibold text-on-surface tracking-[0.2em] uppercase leading-none">{title}</h3>
                </div>
                <p className="text-[10px] font-medium text-on-surface/30 uppercase tracking-[0.1em] leading-relaxed">
                  {message}
                </p>
              </div>

              <div className={`flex ${showCancel ? 'justify-between' : 'justify-end'} items-center pt-2 border-t border-outline/5`}>
                {showCancel && (
                  <button 
                    onClick={onClose}
                    className="text-[9px] font-semibold uppercase tracking-[0.2em] text-on-surface/20 hover:text-on-surface transition-all"
                  >
                    {cancelLabel}
                  </button>
                )}
                <button 
                  onClick={() => {
                    onConfirm();
                    onClose();
                  }}
                  className={`px-4 py-2 rounded-lg text-[9px] font-semibold uppercase tracking-[0.2em] transition-all hover:scale-105 active:scale-95 ${isDestructive ? 'text-error bg-error/5 hover:bg-error/10' : 'text-primary bg-primary/5 hover:bg-primary/10'}`}
                >
                  {confirmLabel}
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
