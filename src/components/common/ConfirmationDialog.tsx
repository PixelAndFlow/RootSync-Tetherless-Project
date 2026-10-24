import { useEffect, useRef } from "react";

interface ConfirmationDialogProps {
  title: string;
  detail: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Reusable, frontend-only confirmation pattern for destructive staff actions. */
export function ConfirmationDialog({ title, detail, confirmLabel, onCancel, onConfirm }: ConfirmationDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  return <div aria-labelledby="confirmation-title" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="dialog">
    <div className="ui-panel w-full max-w-lg p-6 shadow-2xl"><p className="ui-eyebrow">CONFIRMATION REQUIRED</p><h2 className="mt-3 text-2xl font-bold" id="confirmation-title">{title}</h2><p className="mt-3 leading-7 text-slate-300">{detail}</p><div className="mt-6 flex flex-wrap justify-end gap-3"><button className="ui-action-secondary" onClick={onCancel} ref={cancelRef} type="button">Cancel</button><button className="ui-action" onClick={onConfirm} type="button">{confirmLabel}</button></div></div>
  </div>;
}
