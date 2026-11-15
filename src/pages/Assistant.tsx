import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useI18n } from '../context/useI18n';
import { getProcedure } from '../data';
import { effectiveStatus } from '../lib/checklist';
import {
  checkAvailability,
  explainDocument,
  explainForm,
  type FormGuide,
  sendChat,
  AiError,
  type AiAvailability,
  type ChatAttachment,
  type ChatMessage,
  type UserContextSummary,
} from '../lib/ai';
import { sessionData, STORAGE_KEYS } from '../lib/storage';
import { Icon } from '../components/Icon';
import { Arrow, btnPrimary, btnSecondary, cardClass, inputClass, Notice, PageHeader } from '../components/ui';
import type { MessageKey } from '../i18n';

import { FormGuideView } from '../components/FormGuideView';

const EXAMPLES: MessageKey[] = ['ai.ex.1', 'ai.ex.2', 'ai.ex.3', 'ai.ex.4', 'ai.ex.5'];
const MAX_IMAGE_BYTES = 3_500_000;
const ALLOWED_MIME = new Set<ChatAttachment['mimeType']>(['image/png', 'image/jpeg', 'image/webp']);

const LINK_TOKEN_RE =
  /(https:\/\/[^\s<>()]+|\/(?:dashboard|checklist|guides(?:\/[a-z0-9-]+)?|plan|kit\/[a-z0-9-]+|institutions|helper|counter|settings)\b)/g;

function splitTrailingPunctuation(token: string): { target: string; trailing: string } {
  const match = token.match(/^(.+?)([.,;:!?)\]]*)$/);
  if (!match) return { target: token, trailing: '' };
  return { target: match[1], trailing: match[2] };
}

function extractInternalPaths(content: string): string[] {
  const found = new Set<string>();
  const matches = content.match(
    /\/(?:dashboard|checklist|guides(?:\/[a-z0-9-]+)?|plan|kit\/[a-z0-9-]+|institutions|helper|settings)\b/g,
  );
  if (matches) {
    for (const raw of matches) {
      found.add(splitTrailingPunctuation(raw).target);
    }
  }
  return [...found].slice(0, 3);
}

function renderMessageContent(content: string) {
  const parts: Array<string | { target: string; key: number }> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  LINK_TOKEN_RE.lastIndex = 0;

  while ((match = LINK_TOKEN_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const { target, trailing } = splitTrailingPunctuation(match[0]);
    parts.push({ target, key: match.index });
    if (trailing) parts.push(trailing);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }

  return parts.map((part, idx) => {
    if (typeof part === 'string') return <Fragment key={idx}>{part}</Fragment>;
    if (part.target.startsWith('/')) {
      return (
        <Link
          key={part.key}
          to={part.target}
          className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-900"
        >
          {part.target}
        </Link>
      );
    }
    return (
      <a
        key={part.key}
        href={part.target}
        target="_blank"
        rel="noreferrer noopener"
        dir="ltr"
        className="font-semibold text-brand-700 underline underline-offset-2 hover:text-brand-900"
      >
        {part.target}
      </a>
    );
  });
}

function ActionChips({ content }: { content: string }) {
  const { t } = useI18n();
  const paths = extractInternalPaths(content);
  if (paths.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200/80 pt-2.5">
      {paths.map((path) => (
        <Link
          key={path}
          to={path}
          className="inline-flex items-center gap-1 rounded-full border border-brand-200 bg-white px-3 py-1 text-xs font-semibold text-brand-800 shadow-xs hover:bg-brand-50"
        >
          <span>{t('ai.action.openPage', { path })}</span>
          <Arrow />
        </Link>
      ))}
    </div>
  );
}

function loadHistory(): ChatMessage[] {
  const stored = sessionData.read<unknown>(STORAGE_KEYS.chat, []);
  if (!Array.isArray(stored)) return [];
  return stored.filter(
    (m): m is ChatMessage =>
      !!m && typeof m === 'object' && ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') && typeof (m as ChatMessage).content === 'string',
  );
}

export function Assistant() {
  const { language, profile, tasks, progress, dates } = useApp();
  const { t, loc } = useI18n();
  const [params] = useSearchParams();

  const procedureId = params.get('procedure') ?? undefined;
  const procedure = procedureId ? getProcedure(procedureId) : undefined;

  const [tab, setTab] = useState<'chat' | 'document'>('chat');
  const [availability, setAvailability] = useState<AiAvailability | 'checking'>('checking');
  const [messages, setMessages] = useState<ChatMessage[]>(loadHistory);
  const [input, setInput] = useState(procedure ? t('ai.explainPrompt', { title: loc(procedure.title) }) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  const [docText, setDocText] = useState('');
  const [docAttachment, setDocAttachment] = useState<{ attachment: ChatAttachment; previewUrl: string; name: string } | null>(null);
  const [docResult, setDocResult] = useState<string | null>(null);
  const [docError, setDocError] = useState<MessageKey | null>(null);
  const [docBusy, setDocBusy] = useState(false);
  const [docKind, setDocKind] = useState<'explain' | 'form'>('explain');
  const [formResult, setFormResult] = useState<FormGuide | string | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const userContext = useMemo<UserContextSummary | undefined>(() => {
    if (!profile) return undefined;
    const completedCount = tasks.filter((task) => effectiveStatus(task, progress) === 'completed').length;
    return {
      situation: profile.situation,
      citizenship: profile.citizenship,
      accommodation: profile.accommodation,
      arrival: dates.arrival || undefined,
      expiry: dates.expiry || undefined,
      completedCount,
      totalCount: tasks.length,
    };
  }, [profile, tasks, progress, dates]);

  useEffect(() => {
    if (procedure) {
      setTab('chat');
      setInput(t('ai.explainPrompt', { title: loc(procedure.title) }));
    }
  }, [procedureId]);

  useEffect(() => {
    let cancelled = false;
    checkAvailability().then((result) => {
      if (!cancelled) setAvailability(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // The conversation lives for this browser tab only (sessionStorage).
  useEffect(() => {
    sessionData.write(STORAGE_KEYS.chat, messages);
    endRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages, busy]);

  async function ask(text: string) {
    const question = text.trim();
    if (!question || busy || inFlightRef.current) return;
    inFlightRef.current = true;
    const next: ChatMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(next);
    setInput('');
    setError(null);
    setBusy(true);
    try {
      const reply = await sendChat({
        messages: next,
        language,
        procedureId: procedure?.id,
        userContext,
      });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (caught) {
      const code = caught instanceof AiError ? caught.code : 'failed';
      if (code === 'not_configured') setAvailability('not_configured');
      else if (code === 'unreachable') setAvailability('unreachable');
      else setError(code === 'rate_limited' ? 'ai.rateLimited' : 'ai.error');
    } finally {
      inFlightRef.current = false;
      setBusy(false);
    }
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(input);
  }

  function newConversation() {
    setMessages([]);
    setError(null);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ALLOWED_MIME.has(file.type as ChatAttachment['mimeType']) || file.size > MAX_IMAGE_BYTES) {
      setDocError('ai.doc.invalidImage');
      return;
    }
    setDocError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      const comma = dataUrl.indexOf(',');
      if (comma === -1) {
        setDocError('ai.doc.invalidImage');
        return;
      }
      setDocAttachment({
        attachment: {
          mimeType: file.type as ChatAttachment['mimeType'],
          data: dataUrl.slice(comma + 1),
        },
        previewUrl: dataUrl,
        name: file.name,
      });
    };
    reader.readAsDataURL(file);
  }

  async function handleDocumentSubmit(event: FormEvent) {
    event.preventDefault();
    if ((!docText.trim() && !docAttachment) || docBusy) return;
    setDocBusy(true);
    setDocError(null);
    setDocResult(null);
    setFormResult(null);
    try {
      const request = { text: docText, attachment: docAttachment?.attachment, language, userContext };
      if (docKind === 'form') setFormResult(await explainForm(request));
      else setDocResult(await explainDocument(request));
    } catch (caught) {
      const code = caught instanceof AiError ? caught.code : 'failed';
      if (code === 'not_configured') setAvailability('not_configured');
      else if (code === 'unreachable') setAvailability('unreachable');
      else setDocError(code === 'rate_limited' ? 'ai.rateLimited' : 'ai.error');
    } finally {
      setDocBusy(false);
    }
  }

  const unavailable = availability === 'not_configured' || availability === 'unreachable';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title={t('ai.title')} subtitle={t('ai.subtitle')} />
      <Notice>{t('ai.disclaimer')}</Notice>
      <p className="text-sm text-muted">{t('ai.privacy')}</p>

      {availability === 'checking' ? (
        <div role="status" className="space-y-2">
          <p className="text-sm text-muted">{t('ai.checking')}</p>
          <div className="skeleton h-4 w-2/3" aria-hidden="true" />
          <div className="skeleton h-4 w-1/2" aria-hidden="true" />
        </div>
      ) : null}

      {unavailable ? (
        <Notice tone="warning" title={t('ai.unavailable.title')} role="status">
          {availability === 'not_configured' ? t('ai.unavailable.body') : t('ai.unreachable.body')}
        </Notice>
      ) : null}

      <div className="flex flex-wrap gap-2" role="tablist" aria-label={t('ai.title')}>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'chat'}
          onClick={() => setTab('chat')}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'chat'
              ? 'bg-brand-700 text-white shadow-sm'
              : 'border border-slate-300 bg-white text-brand-900 hover:bg-brand-50'
          }`}
        >
          <Icon name="chat" className="size-4" />
          {t('ai.tab.chat')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'document'}
          onClick={() => setTab('document')}
          className={`inline-flex min-h-10 items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            tab === 'document'
              ? 'bg-brand-700 text-white shadow-sm'
              : 'border border-slate-300 bg-white text-brand-900 hover:bg-brand-50'
          }`}
        >
          <Icon name="file" className="size-4" />
          {t('ai.tab.document')}
        </button>
      </div>

      {tab === 'chat' ? (
        <>
          {procedure ? <p className="text-sm font-semibold text-brand-800">{t('ai.aboutProcedure', { title: loc(procedure.title) })}</p> : null}

          <section aria-label={t('ai.title')} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="max-h-[28rem] min-h-40 space-y-4 overflow-y-auto pe-1" aria-live="polite">
              {messages.length === 0 ? <p className="py-8 text-center text-muted">{t('ai.empty')}</p> : null}
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-base ${
                      message.role === 'user' ? 'bg-brand-700 text-white' : 'bg-slate-100 text-ink'
                    }`}
                  >
                    <p className="mb-1 text-xs font-semibold opacity-80">{message.role === 'user' ? t('ai.you') : t('ai.assistant')}</p>
                    {message.role === 'assistant' ? (
                      <>
                        <div>{renderMessageContent(message.content)}</div>
                        <ActionChips content={message.content} />
                      </>
                    ) : (
                      message.content
                    )}
                  </div>
                </div>
              ))}
              {busy ? (
                <p role="status" className="text-sm text-muted">
                  {t('ai.thinking')}
                </p>
              ) : null}
              <div ref={endRef} />
            </div>

            {error ? (
              <div className="mt-3">
                <Notice tone="error" role="alert">
                  {t(error)}
                </Notice>
              </div>
            ) : null}

            <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row">
              <label htmlFor="ai-input" className="sr-only">
                {t('ai.placeholder')}
              </label>
              <textarea
                id="ai-input"
                rows={2}
                maxLength={2000}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void ask(input);
                  }
                }}
                placeholder={t('ai.placeholder')}
                disabled={unavailable || busy}
                className={`${inputClass} flex-1 resize-y disabled:bg-slate-100`}
              />
              <button type="submit" className={btnPrimary} disabled={unavailable || busy || input.trim() === ''}>
                {t('common.send')}
              </button>
            </form>

            {messages.length > 0 ? (
              <div className="mt-3">
                <button type="button" className={btnSecondary} disabled={busy} onClick={newConversation}>
                  {t('ai.newChat')}
                </button>
              </div>
            ) : null}
          </section>

          <section aria-labelledby="examples-title">
            <h2 id="examples-title" className="text-base font-bold text-brand-900">
              {t('ai.examples')}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {EXAMPLES.map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    disabled={unavailable || busy}
                    onClick={() => void ask(t(key))}
                    className="rounded-full border border-slate-400 bg-white px-4 py-2 text-start text-sm font-medium text-brand-900 hover:bg-brand-50 disabled:opacity-50"
                  >
                    {t(key)}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <section className={cardClass} aria-labelledby="doc-explainer-title">
          <h2 id="doc-explainer-title" className="text-lg font-bold text-brand-900">
            {t('ai.doc.title')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('ai.doc.subtitle')}</p>
          <div className="mt-3">
            <Notice tone="warning">{t('ai.doc.privacy')}</Notice>
          </div>

          <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label={t('ai.form.kind')}>
            {(['explain', 'form'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={docKind === kind}
                onClick={() => {
                  setDocKind(kind);
                  setDocResult(null);
                  setFormResult(null);
                }}
                className={`inline-flex min-h-10 items-center gap-2 rounded-lg border px-4 py-2 text-sm font-semibold ${
                  docKind === kind ? 'border-brand-700 bg-brand-700 text-white' : 'border-slate-400 bg-white text-brand-900 hover:bg-brand-50'
                }`}
              >
                <Icon name={kind === 'form' ? 'list' : 'file'} className="size-4" />
                {kind === 'form' ? t('ai.form.kind.form') : t('ai.form.kind.explain')}
              </button>
            ))}
          </div>
          {docKind === 'form' ? <p className="mt-2 text-sm text-muted">{t('ai.form.hint')}</p> : null}

          <form onSubmit={handleDocumentSubmit} className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={handleFileChange}
              />
              <button
                type="button"
                className={btnSecondary}
                disabled={unavailable || docBusy}
                onClick={() => fileInputRef.current?.click()}
              >
                <Icon name="upload" className="size-4" />
                {t('ai.doc.upload')}
              </button>
              {docAttachment ? (
                <button
                  type="button"
                  className="text-sm font-semibold text-red-700 underline underline-offset-2 hover:text-red-900"
                  onClick={() => setDocAttachment(null)}
                >
                  {t('ai.doc.removeImage')} ({docAttachment.name})
                </button>
              ) : null}
            </div>

            {docAttachment ? (
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
                <img
                  src={docAttachment.previewUrl}
                  alt={docAttachment.name}
                  className="max-h-56 w-auto rounded-lg object-contain"
                />
              </div>
            ) : null}

            <div>
              <label htmlFor="doc-text-input" className="sr-only">
                {t('ai.doc.placeholder')}
              </label>
              <textarea
                id="doc-text-input"
                rows={4}
                maxLength={2000}
                value={docText}
                onChange={(event) => setDocText(event.target.value)}
                placeholder={t('ai.doc.placeholder')}
                disabled={unavailable || docBusy}
                className={`${inputClass} resize-y disabled:bg-slate-100`}
              />
            </div>

            <button
              type="submit"
              className={btnPrimary}
              disabled={unavailable || docBusy || (!docText.trim() && !docAttachment)}
            >
              <Icon name="sparkles" className="size-4" />
              {docBusy ? t('ai.thinking') : docKind === 'form' ? t('ai.form.submit') : t('ai.doc.submit')}
            </button>
          </form>

          {docError ? (
            <div className="mt-4">
              <Notice tone="error" role="alert">
                {t(docError)}
              </Notice>
            </div>
          ) : null}

          {formResult && typeof formResult !== 'string' ? <FormGuideView guide={formResult} /> : null}
          {typeof formResult === 'string' ? (
            <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/70 p-4" aria-live="polite">
              <div className="whitespace-pre-wrap text-base text-ink">{renderMessageContent(formResult)}</div>
            </div>
          ) : null}

          {docResult ? (
            <div className="mt-5 rounded-2xl border border-brand-200 bg-brand-50/70 p-4" aria-live="polite">
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-brand-800">{t('ai.doc.result')}</p>
              <div className="whitespace-pre-wrap text-base text-ink">{renderMessageContent(docResult)}</div>
              <ActionChips content={docResult} />
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}
