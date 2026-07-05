'use client';

import { useState, useEffect, useLayoutEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import { Send, Upload, FileText, Loader2, X, Eye, ChevronDown, ChevronUp, AlertCircle, Calendar } from 'lucide-react';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { EXTERNAL_TEMPLATES } from '@/lib/external-agreement-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { sanitizeHtml } from '@/lib/sanitize';
import { springs, TAB_PILL_SPRING } from '@/lib/motion';
import { LIGHT_INPUT, DIALOG_SAVE, DIALOG_CANCEL } from '@/components/dashboard/lightKit';

const SPRING = springs.smooth;

interface SendInviteFormProps {
  onInviteSent: () => void;
  /** Drop the form's own card chrome — for rendering inside a dialog panel. */
  bare?: boolean;
}

export function SendInviteForm({ onInviteSent, bare = false }: SendInviteFormProps) {
  const [email, setEmail] = useState('');
  const [templateMode, setTemplateMode] = useState<'preset' | 'upload'>('preset');
  const [templateId, setTemplateId] = useState(EXTERNAL_TEMPLATES[0]?.id || '');
  const [customSections, setCustomSections] = useState<{ number: number; title: string; content: string }[] | null>(null);
  const [customTitle, setCustomTitle] = useState('');
  const [personalNote, setPersonalNote] = useState('');
  const [expiration, setExpiration] = useState('7');
  const [customDate, setCustomDate] = useState('');
  const [sending, setSending] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [isGuardianSigning, setIsGuardianSigning] = useState(false);
  const reduce = useReducedMotion();

  // Template↔Upload morph: the document region animates height (measured via
  // ResizeObserver) while the two mode blocks slide/blur past each other in the
  // toggle's left/right order — the guardian row and submit below never jump.
  const [docDir, setDocDir] = useState(1);
  const [docRegionEl, setDocRegionEl] = useState<HTMLDivElement | null>(null);
  const [docRegionHeight, setDocRegionHeight] = useState<number | 'auto'>('auto');
  useLayoutEffect(() => {
    if (!docRegionEl) {
      setDocRegionHeight('auto');
      return;
    }
    setDocRegionHeight(docRegionEl.offsetHeight);
    const ro = new ResizeObserver(() => setDocRegionHeight(docRegionEl.offsetHeight));
    ro.observe(docRegionEl);
    return () => ro.disconnect();
  }, [docRegionEl]);

  function switchTemplateMode(next: 'preset' | 'upload') {
    if (next === templateMode) return;
    setDocDir(next === 'upload' ? 1 : -1);
    setTemplateMode(next);
  }

  const docSwap = {
    enter: (dir: number) =>
      reduce ? { opacity: 1 } : { opacity: 0, x: 24 * dir, scale: 0.97, filter: 'blur(2px)' },
    center: reduce ? { opacity: 1 } : { opacity: 1, x: 0, scale: 1, filter: 'blur(0px)' },
    exit: (dir: number) =>
      reduce ? { opacity: 0 } : { opacity: 0, x: -24 * dir, scale: 0.97, filter: 'blur(2px)' },
  };

  async function handlePdfUpload(file: File) {
    setParsing(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/external-signing/parse-pdf', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse PDF');
      setCustomSections(data.sections);
      setCustomTitle(data.title);
      setShowPreview(true);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse PDF');
    } finally {
      setParsing(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowConfirm(true);
  }

  async function handleConfirmedSend() {
    setShowConfirm(false);
    setSending(true);

    try {
      let expiresAt: Date;
      if (expiration === 'custom') {
        expiresAt = new Date(customDate);
        expiresAt.setHours(23, 59, 59, 999);
      } else {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiration));
      }

      const payload: Record<string, unknown> = {
        recipient_email: email,
        template_type: templateMode === 'preset' ? 'preset' : 'custom',
        expires_at: expiresAt.toISOString(),
        personal_note: personalNote || undefined,
      };

      if (templateMode === 'preset') {
        payload.template_id = templateId;
      } else {
        payload.custom_sections = customSections;
        payload.custom_title = customTitle;
      }

      if (isGuardianSigning) {
        payload.is_guardian_signing = true;
      }

      const res = await fetch('/api/external-signing/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to send invite');
      }

      toast.success('Invite sent successfully');
      setEmail('');
      setPersonalNote('');
      setCustomSections(null);
      setCustomTitle('');
      setTemplateMode('preset');
      setShowOptions(false);
      setIsGuardianSigning(false);
      onInviteSent();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setSending(false);
    }
  }

  const canSubmit = email && (templateMode === 'preset' ? templateId : customSections);
  const selectedTemplate = EXTERNAL_TEMPLATES.find((t) => t.id === templateId);

  return (
    <div className={bare ? undefined : 'overflow-visible rounded-2xl border-0 bg-white p-6 shadow-seeko'}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* ── Recipient ── */}
          <div className="space-y-2">
            <Label className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9a9a9a]" htmlFor="recipient-email">Recipient</Label>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@company.com"
              className={`${LIGHT_INPUT} h-12 rounded-xl px-4 text-[15px]`}
            />
          </div>

          {/* ── Document ── */}
          <div className="space-y-3">
            <Label className="text-[11px] font-medium uppercase tracking-[0.08em] text-[#9a9a9a]">Document</Label>

            {/* Mode toggle — sliding pill (shared TAB_PILL_SPRING pattern) */}
            <div className="flex rounded-[18px] bg-black/[0.04] p-1 ring-1 ring-inset ring-black/[0.03]">
              {([['preset', 'Template', FileText], ['upload', 'Upload PDF', Upload]] as const).map(([value, label, Icon]) => {
                const active = templateMode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => switchTemplateMode(value)}
                    className={`relative flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-[14px] px-3 text-[13px] font-medium transition-[color,transform] duration-150 ease-out active:scale-[0.97] ${
                      active ? 'text-[#111]' : 'text-[#808080] hover:text-[#111]'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="docModePill"
                        initial={false}
                        transition={reduce ? { duration: 0 } : TAB_PILL_SPRING}
                        className="absolute inset-0 rounded-[14px] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.04]"
                      />
                    )}
                    <Icon className="relative z-10 size-3.5" />
                    <span className="relative z-10">{label}</span>
                  </button>
                );
              })}
            </div>

            {/* Morph surface: height follows the measured contents while the
                preset/upload blocks slide past each other (never a hard swap). */}
            <motion.div
              initial={false}
              animate={{ height: docRegionHeight }}
              transition={reduce ? { duration: 0 } : SPRING}
              className="overflow-hidden"
            >
              <div ref={setDocRegionEl}>
                <AnimatePresence mode="popLayout" initial={false} custom={docDir}>
                  <motion.div
                    key={templateMode}
                    custom={docDir}
                    variants={docSwap}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={reduce ? { duration: 0 } : SPRING}
                  >
                    {templateMode === 'preset' ? (
              <div className="space-y-2">
                {EXTERNAL_TEMPLATES.map((t) => {
                  const selected = templateId === t.id;
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl p-4 transition-[background-color,box-shadow,transform] duration-150 ease-out active:scale-[0.99] ${
                        selected
                          ? 'bg-[#f8fbff] shadow-[inset_0_0_0_1px_rgba(10,99,204,0.24),0_10px_24px_-22px_rgba(10,99,204,0.75)]'
                          : 'bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] hover:bg-black/[0.015] hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]'
                      }`}
                    >
                      <input
                        type="radio"
                        name="template"
                        value={t.id}
                        checked={selected}
                        onChange={() => setTemplateId(t.id)}
                        className="sr-only"
                      />
                      <span
                        aria-hidden
                        className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-150 ${
                          selected ? 'border-[#0a63cc]' : 'border-black/25'
                        }`}
                      >
                        <span
                          className={`size-2 rounded-full transition-[transform,opacity] duration-150 ease-out ${
                            selected ? 'scale-100 bg-[#0a63cc] opacity-100' : 'scale-50 bg-[#111] opacity-0'
                          }`}
                        />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[15px] font-semibold leading-tight text-[#111]">{t.name}</span>
                        <span className="mt-1 block text-[13px] leading-snug text-[#808080]">{t.description}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
                    ) : (
              <div className="space-y-2">
                {!customSections ? (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border border-dashed border-black/[0.16] p-7 transition-[border-color,background-color] duration-150 hover:border-black/[0.28] hover:bg-black/[0.015]">
                    {parsing ? (
                      <>
                        <Loader2 className="size-5 animate-spin text-[#9a9a9a]" />
                        <span className="text-sm text-[#808080]">AI is parsing your PDF into sections...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="size-5 text-[#9a9a9a]" />
                        <span className="text-sm text-[#808080]">Tap to upload a PDF</span>
                        <span className="text-xs text-[#9a9a9a]">Will be parsed into signable sections</span>
                      </>
                    )}
                    <input
                      type="file"
                      accept=".pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handlePdfUpload(file);
                      }}
                    />
                  </label>
                ) : (
                  <div className="flex items-center justify-between rounded-xl bg-[#f7f7f7] px-3.5 py-2.5">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-[#9a9a9a]" />
                      <span className="text-sm text-[#111]">{customTitle}</span>
                      <span className="text-xs text-[#808080]">{customSections.length} sections</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setShowPreview(!showPreview)} className="rounded p-1.5 hover:bg-black/[0.04]">
                        <Eye className="size-4 text-[#9a9a9a]" />
                      </button>
                      <button type="button" onClick={() => { setCustomSections(null); setCustomTitle(''); }} className="rounded p-1.5 hover:bg-black/[0.04]">
                        <X className="size-4 text-[#9a9a9a]" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Section Preview */}
                <AnimatePresence>
                  {showPreview && customSections && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="max-h-64 overflow-y-auto rounded-xl bg-[#f7f7f7] p-4 [scrollbar-width:thin]">
                        {customSections.map((s) => (
                          <div key={s.number} className="mb-3">
                            <h4 className="text-sm font-semibold text-[#111]">{s.number}. {s.title}</h4>
                            <div className="mt-1 text-xs text-[#808080] prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(s.content) }} />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* ── Guardian toggle — same card anatomy as the template options,
                 checkbox instead of radio (optional flag, not a choice) ── */}
          <button
            type="button"
            aria-pressed={isGuardianSigning}
            onClick={() => setIsGuardianSigning(!isGuardianSigning)}
            className={`flex w-full cursor-pointer items-start gap-3 rounded-2xl p-4 text-left transition-[background-color,box-shadow] duration-150 ease-out active:scale-[0.99] ${
              isGuardianSigning
                ? 'bg-[#f8fbff] shadow-[inset_0_0_0_1px_rgba(10,99,204,0.24)]'
                : 'bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] hover:bg-black/[0.015] hover:shadow-[inset_0_0_0_1px_rgba(0,0,0,0.14)]'
            }`}
          >
            <span
              aria-hidden
              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 ${
                isGuardianSigning ? 'border-[#0a63cc] bg-[#0a63cc]' : 'border-black/25'
              }`}
            >
              <svg
                viewBox="0 0 12 12"
                className={`size-3 text-white transition-[transform,opacity] duration-150 ease-out ${
                  isGuardianSigning ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
                }`}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M2.5 6L5 8.5L9.5 3.5" />
              </svg>
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold leading-tight text-[#111]">Guardian signing for a minor</span>
              <span className="mt-1 block text-[13px] leading-snug text-[#808080]">A parent or legal guardian will sign on behalf of someone under 18</span>
            </span>
          </button>

          {/* ── Options toggle ── */}
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex min-h-9 items-center gap-1.5 rounded-full px-1 text-[13px] font-medium text-[#808080] transition-colors hover:text-[#111]"
          >
            {showOptions ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
            {showOptions ? 'Hide options' : 'Expiration & personal note'}
          </button>

          <AnimatePresence>
            {showOptions && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={SPRING}
                className="overflow-hidden"
              >
                <div className="space-y-4 rounded-xl bg-[#f7f7f7] p-4">
                  {/* Expiration */}
                  <div className="space-y-2">
                    <Label className="text-xs text-[#808080]">Expires in</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { value: '7', label: '7 days' },
                        { value: '14', label: '14 days' },
                        { value: '30', label: '30 days' },
                        { value: 'custom', label: 'Custom' },
                      ].map((opt) => (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setExpiration(opt.value)}
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.96] ${
                            expiration === opt.value
                              ? 'bg-[#111] text-white'
                              : 'bg-white text-[#808080] shadow-[0_0_0_1px_rgba(0,0,0,0.06)] hover:text-[#111]'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                    {expiration === 'custom' ? (
                      <DatePicker
                        value={customDate}
                        onChange={setCustomDate}
                        dateLabel="Expires"
                        light
                      />
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-[#9a9a9a]">
                        <Calendar className="size-3" />
                        Expires {new Date(Date.now() + parseInt(expiration) * 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Personal Note */}
                  <div className="space-y-1.5">
                    <Label htmlFor="personal-note" className="text-xs text-[#808080]">Personal Note</Label>
                    <textarea
                      id="personal-note"
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value)}
                      rows={2}
                      placeholder="Include a message for the recipient..."
                      className={`flex w-full px-3 py-2 text-sm focus-visible:outline-none resize-none ${LIGHT_INPUT}`}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <Button
            type="submit"
            disabled={!canSubmit || sending}
            className={`h-12 w-full gap-2 rounded-full text-[15px] font-semibold shadow-seeko ${DIALOG_SAVE}`}
          >
            {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Send Invite
          </Button>
        </form>

        {/* Confirmation Dialog */}
        <ConfirmDialog
          show={showConfirm}
          onClose={() => setShowConfirm(false)}
          onConfirm={handleConfirmedSend}
          email={email}
          templateMode={templateMode}
          templateName={selectedTemplate?.name || templateId}
          customTitle={customTitle}
          expiration={expiration}
          customDate={customDate}
          isGuardianSigning={isGuardianSigning}
        />
    </div>
  );
}

function ConfirmDialog({ show, onClose, onConfirm, email, templateMode, templateName, customTitle: title, expiration, customDate, isGuardianSigning }: {
  show: boolean; onClose: () => void; onConfirm: () => void;
  email: string; templateMode: string; templateName: string; customTitle: string; expiration: string; customDate: string; isGuardianSigning: boolean;
}) {
  useEffect(() => {
    if (!show) return;
    acquireScrollLock();
    return () => { releaseScrollLock(); };
  }, [show]);

  return (
        <AnimatePresence>
          {show && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
              onClick={onClose}
            >
              <motion.div
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={SPRING}
                onClick={(e) => e.stopPropagation()}
                className="mx-0 sm:mx-4 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border-0 bg-white p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 shadow-seeko"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-[#0a63cc]/[0.12]">
                      <AlertCircle className="size-5 text-[#0a63cc]" />
                    </div>
                    <h3 className="text-base font-semibold text-[#111]">Confirm Send</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#808080]">Recipient</span>
                      <span className="text-[#111] font-mono text-xs">{email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#808080]">Document</span>
                      <span className="text-[#111] text-xs">
                        {templateMode === 'preset'
                          ? templateName
                          : title || 'Custom PDF'}
                      </span>
                    </div>
                    {isGuardianSigning && (
                      <div className="flex justify-between">
                        <span className="text-[#808080]">Signing type</span>
                        <span className="text-[#111] text-xs">Guardian (for a minor)</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#808080]">Expires</span>
                      <span className="text-[#111] text-xs">
                        {expiration === 'custom' ? customDate : `${expiration} days`}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-[#808080]">
                    This will send a signing invitation email to the recipient.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className={`flex-1 border-black/[0.08] ${DIALOG_CANCEL}`}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={onConfirm}
                      className={`flex-1 gap-2 ${DIALOG_SAVE}`}
                    >
                      <Send className="size-4" />
                      Send
                    </Button>
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
  );
}
