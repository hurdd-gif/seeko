'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, Upload, FileText, Loader2, X, Eye, ChevronDown, ChevronUp, AlertCircle, Calendar, ShieldCheck } from 'lucide-react';
import { acquireScrollLock, releaseScrollLock } from '@/lib/scroll-lock';
import { EXTERNAL_TEMPLATES } from '@/lib/external-agreement-templates';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import DOMPurify from 'dompurify';

const SPRING = { type: 'spring' as const, stiffness: 300, damping: 25 };

interface SendInviteFormProps {
  onInviteSent: () => void;
}

export function SendInviteForm({ onInviteSent }: SendInviteFormProps) {
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
    <Card className="overflow-visible">
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* ── Section 1: Recipient ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-foreground text-background text-xs font-semibold">1</div>
              <span className="text-sm font-medium text-foreground">Recipient</span>
            </div>
            <Input
              id="recipient-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="name@company.com"
            />
          </div>

          <div className="h-px bg-border" />

          {/* ── Section 2: Document ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <div className="flex size-5 items-center justify-center rounded-full bg-foreground text-background text-xs font-semibold">2</div>
              <span className="text-sm font-medium text-foreground">Document</span>
            </div>

            {/* Template Mode Toggle */}
            <div className="flex gap-1.5 rounded-lg bg-muted/50 p-1">
              <button
                type="button"
                onClick={() => setTemplateMode('preset')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all ${
                  templateMode === 'preset'
                    ? 'bg-background text-foreground font-medium shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <FileText className="size-3.5" /> Template
              </button>
              <button
                type="button"
                onClick={() => setTemplateMode('upload')}
                className={`flex flex-1 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm transition-all ${
                  templateMode === 'upload'
                    ? 'bg-background text-foreground font-medium shadow-sm ring-1 ring-border'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Upload className="size-3.5" /> Upload PDF
              </button>
            </div>

            {/* Preset Templates */}
            {templateMode === 'preset' && (
              <div className="space-y-2">
                {EXTERNAL_TEMPLATES.map((t) => (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                      templateId === t.id
                        ? 'border-seeko-accent/40 bg-seeko-accent/5'
                        : 'border-border hover:border-border hover:bg-muted/30'
                    }`}
                  >
                    <input
                      type="radio"
                      name="template"
                      value={t.id}
                      checked={templateId === t.id}
                      onChange={() => setTemplateId(t.id)}
                      className="mt-0.5 accent-seeko-accent"
                    />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            )}

            {/* PDF Upload */}
            {templateMode === 'upload' && (
              <div className="space-y-2">
                {!customSections ? (
                  <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border p-6 transition-colors hover:border-muted-foreground/30">
                    {parsing ? (
                      <>
                        <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">AI is parsing your PDF into sections...</span>
                      </>
                    ) : (
                      <>
                        <Upload className="size-5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">Tap to upload a PDF</span>
                        <span className="text-xs text-muted-foreground/60">Will be parsed into signable sections</span>
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
                  <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-muted-foreground" />
                      <span className="text-sm text-foreground">{customTitle}</span>
                      <span className="text-xs text-muted-foreground">{customSections.length} sections</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => setShowPreview(!showPreview)} className="rounded p-1.5 hover:bg-muted">
                        <Eye className="size-4 text-muted-foreground" />
                      </button>
                      <button type="button" onClick={() => { setCustomSections(null); setCustomTitle(''); }} className="rounded p-1.5 hover:bg-muted">
                        <X className="size-4 text-muted-foreground" />
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
                      <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-muted/30 p-4 [scrollbar-width:thin]">
                        {customSections.map((s) => (
                          <div key={s.number} className="mb-3">
                            <h4 className="text-sm font-semibold text-foreground">{s.number}. {s.title}</h4>
                            <div className="mt-1 text-xs text-muted-foreground prose prose-sm prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(s.content) }} />
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* ── Guardian toggle ── */}
          <button
            type="button"
            onClick={() => setIsGuardianSigning(!isGuardianSigning)}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-lg px-4 py-3 text-left transition-all ${
              isGuardianSigning
                ? 'bg-seeko-accent/8 ring-1 ring-seeko-accent/25'
                : 'bg-muted/30 hover:bg-muted/50'
            }`}
          >
            <div className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
              isGuardianSigning ? 'bg-seeko-accent/15 text-seeko-accent' : 'bg-muted text-muted-foreground'
            }`}>
              <ShieldCheck className="size-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Guardian signing for a minor</p>
              <p className="text-xs text-muted-foreground">A parent or legal guardian will sign on behalf of someone under 18</p>
            </div>
            <div className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
              isGuardianSigning
                ? 'border-seeko-accent bg-seeko-accent'
                : 'border-muted-foreground/30'
            }`}>
              {isGuardianSigning && (
                <svg viewBox="0 0 12 12" className="size-3 text-background" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M2.5 6L5 8.5L9.5 3.5" />
                </svg>
              )}
            </div>
          </button>

          {/* ── Options toggle ── */}
          <button
            type="button"
            onClick={() => setShowOptions(!showOptions)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
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
                <div className="space-y-4 rounded-lg border border-border/50 bg-muted/20 p-4">
                  {/* Expiration */}
                  <div className="space-y-2">
                    <Label className="text-xs">Expires in</Label>
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
                          className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                            expiration === opt.value
                              ? 'bg-foreground text-background'
                              : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground ring-1 ring-border/50'
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
                      />
                    ) : (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground/70">
                        <Calendar className="size-3" />
                        Expires {new Date(Date.now() + parseInt(expiration) * 86400000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                      </p>
                    )}
                  </div>

                  {/* Personal Note */}
                  <div className="space-y-1.5">
                    <Label htmlFor="personal-note" className="text-xs">Personal Note</Label>
                    <textarea
                      id="personal-note"
                      value={personalNote}
                      onChange={(e) => setPersonalNote(e.target.value)}
                      rows={2}
                      placeholder="Include a message for the recipient..."
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-ring focus:outline-none resize-none"
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
            className="w-full gap-2 bg-seeko-accent text-background hover:bg-seeko-accent/90 font-medium"
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
      </CardContent>
    </Card>
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
                className="mx-0 sm:mx-4 w-full max-w-sm rounded-t-2xl sm:rounded-2xl border border-border bg-card p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6 shadow-2xl"
              >
                <div className="flex flex-col gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-seeko-accent/15 ring-1 ring-seeko-accent/30">
                      <AlertCircle className="size-5 text-seeko-accent" />
                    </div>
                    <h3 className="text-base font-semibold text-foreground">Confirm Send</h3>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Recipient</span>
                      <span className="text-foreground font-mono text-xs">{email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Document</span>
                      <span className="text-foreground text-xs">
                        {templateMode === 'preset'
                          ? templateName
                          : title || 'Custom PDF'}
                      </span>
                    </div>
                    {isGuardianSigning && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Signing type</span>
                        <span className="text-foreground text-xs">Guardian (for a minor)</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Expires</span>
                      <span className="text-foreground text-xs">
                        {expiration === 'custom' ? customDate : `${expiration} days`}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This will send a signing invitation email to the recipient.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={onClose}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={onConfirm}
                      className="flex-1 gap-2 bg-seeko-accent text-background hover:bg-seeko-accent/90"
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
