"use client";

import {
  ArrowDownToLine,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  FileText,
  FolderOpen,
  FolderPlus,
  Layers3,
  LoaderCircle,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  RotateCcw,
  Search,
  Send,
  Settings2,
  ShieldAlert,
  Sparkles,
  Square,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { diffWordsWithSpace } from "diff";
import Image from "next/image";
import Link from "next/link";
import { KeyboardEvent, ReactNode, useEffect, useRef, useState } from "react";
import rehypeKatex from "rehype-katex";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import { OpenRouterConnection, OpenRouterSettings } from "@/components/openrouter-settings";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  getReviewConfiguration,
  isReviewConfigurationId,
  REVIEW_CONFIGURATIONS,
  ReviewConfiguration,
  ReviewConfigurationId,
} from "@/lib/review-configs";
import {
  CyclePaper,
  deleteReviewCycle,
  getCachedPaperText,
  listReviewCycles,
  ReviewCycle,
  ReviewDirectoryHandle,
  saveCachedPaperText,
  saveReviewCycle,
  scanReviewFolder,
} from "@/lib/review-cycles";

type WorkspaceTab = "review" | "chat";
type MobileView = "papers" | "paper" | WorkspaceTab;
type Review = Record<string, string>;
type Message = { role: "user" | "assistant"; content: string };
type ExtractionStatus = "idle" | "extracting" | "ready" | "error";
type PolishRequest = { controller: AbortController; timedOut: boolean };
type DiffChange = { value: string; added?: boolean; removed?: boolean };
type PolishProposal = { polished: string; changes: DiffChange[] };

const MAX_PDF_BYTES = 30 * 1024 * 1024;
const VENUE_LOGOS: Partial<Record<ReviewConfigurationId, { src: string; width: number; height: number; inverse?: boolean }>> = {
  "acl-arr": { src: "/venues/acl-arr.png", width: 594, height: 542 },
  iclr: { src: "/venues/iclr.svg", width: 107, height: 89 },
  neurips: { src: "/venues/neurips.svg", width: 36, height: 36 },
  icml: { src: "/venues/icml.svg", width: 99, height: 98 },
  cvpr: { src: "/venues/cvpr.svg", width: 354, height: 87, inverse: true },
  iccv: { src: "/venues/iccv.svg", width: 1363, height: 375 },
  eccv: { src: "/venues/eccv.svg", width: 430, height: 189 },
  aaai: { src: "/venues/aaai.jpg", width: 1001, height: 141 },
  aistats: { src: "/venues/aistats.svg", width: 1684, height: 900 },
};

function emptyReview(configuration: ReviewConfiguration): Review {
  return Object.fromEntries(configuration.fields.map((field) => [field.id, ""]));
}

function paperKey(url: string) {
  return `margin:review:${url}`;
}

function countWords(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function ReviewPanel({
  configuration,
  review,
  onChange,
  connection,
  onOpenProviderSettings,
  saveState,
  onExport,
  onCopy,
  reviewed,
  onToggleReviewed,
}: {
  configuration: ReviewConfiguration;
  review: Review;
  onChange: (key: string, value: string) => void;
  connection: OpenRouterConnection;
  onOpenProviderSettings: () => void;
  saveState: "saved" | "saving";
  onExport: () => void;
  onCopy: () => void;
  reviewed?: boolean;
  onToggleReviewed?: () => void;
}) {
  const [collapsed, setCollapsed] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [polishing, setPolishing] = useState<string | null>(null);
  const [polishError, setPolishError] = useState<{ key: string; message: string } | null>(null);
  const [polishProposals, setPolishProposals] = useState<Partial<Record<string, PolishProposal>>>({});
  const polishRequestRef = useRef<PolishRequest | null>(null);

  useEffect(() => () => polishRequestRef.current?.controller.abort(), []);

  async function copyReview() {
    await onCopy();
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  async function polishField(key: string, label: string) {
    if (!review[key].trim() || polishing) return;
    if (!connection.apiKey || !connection.model) {
      setPolishError({ key, message: "Connect OpenRouter and choose a model to polish this field." });
      onOpenProviderSettings();
      return;
    }

    setPolishing(key);
    setPolishError(null);
    const activeRequest: PolishRequest = { controller: new AbortController(), timedOut: false };
    polishRequestRef.current = activeRequest;
    const timeout = window.setTimeout(() => {
      activeRequest.timedOut = true;
      activeRequest.controller.abort();
    }, 45_000);
    try {
      const response = await fetch("/api/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-OpenRouter-Key": connection.apiKey },
        body: JSON.stringify({ content: review[key], field: label, model: connection.model }),
        signal: activeRequest.controller.signal,
      });
      const body = await response.json().catch(() => ({ error: "This field could not be polished." }));
      if (!response.ok) throw new Error(body.error || "This field could not be polished.");
      if (typeof body.polished !== "string" || !body.polished.trim()) throw new Error("The selected model returned an empty response.");
      setPolishProposals((current) => ({
        ...current,
        [key]: { polished: body.polished, changes: diffWordsWithSpace(review[key], body.polished) },
      }));
    } catch (caught) {
      if ((caught as Error).name === "AbortError") {
        if (activeRequest.timedOut) {
          setPolishError({ key, message: "Polishing timed out. Try again or choose a faster model." });
        }
      } else {
        setPolishError({ key, message: caught instanceof Error ? caught.message : "This field could not be polished." });
      }
    } finally {
      window.clearTimeout(timeout);
      if (polishRequestRef.current === activeRequest) polishRequestRef.current = null;
      setPolishing(null);
    }
  }

  function resolvePolishProposal(key: string, accept: boolean) {
    const proposal = polishProposals[key];
    if (accept && proposal) onChange(key, proposal.polished);
    setPolishProposals((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  return (
    <div className="review-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Structured review · {configuration.venue}</p>
          <h2>Build your assessment</h2>
        </div>
        <div className="save-state" aria-live="polite">
          {saveState === "saving" ? <LoaderCircle className="spin" size={13} /> : <Check size={13} />}
          {saveState}
        </div>
      </div>

      <div className="review-fields">
        {configuration.fields.map((field, index) => {
          const isCollapsed = collapsed.includes(field.id);
          const proposal = polishProposals[field.id];
          return (
            <section className={`review-field ${isCollapsed ? "is-collapsed" : ""}`} key={field.id}>
              <div className="field-header">
                <button
                  className="field-heading"
                  type="button"
                  aria-expanded={!isCollapsed}
                  onClick={() =>
                    setCollapsed((current) =>
                      current.includes(field.id) ? current.filter((key) => key !== field.id) : [...current, field.id],
                    )
                  }
                >
                  <span className="field-number">{String(index + 1).padStart(2, "0")}</span>
                  <span className="field-title">
                    <span className="field-label">{field.label}</span>
                    <span className="field-description" id={`${field.id}-description`}>{field.description}</span>
                  </span>
                  <span className="field-count">{countWords(review[field.id] || "")} words</span>
                  <ChevronDown size={16} />
                </button>
                <button
                  className="polish-button"
                  type="button"
                  title={`Polish ${field.label.toLowerCase()} with ${connection.model || "OpenRouter"}`}
                  disabled={!review[field.id]?.trim() || Boolean(proposal) || (polishing !== null && polishing !== field.id)}
                  onClick={() => polishing === field.id ? polishRequestRef.current?.controller.abort() : void polishField(field.id, field.label)}
                >
                  {polishing === field.id ? <Square size={11} /> : <Sparkles size={13} />}
                  {polishing === field.id ? "Stop" : "Polish"}
                </button>
              </div>
              {!isCollapsed && (
                <>
                  {proposal ? (
                    <div className="polish-proposal">
                      <div className="proposal-heading">
                        <span><Sparkles size={13} /> Suggested revision</span>
                        <small>Removed text is struck through; additions are highlighted.</small>
                      </div>
                      <div className="polish-diff" aria-label={`Suggested changes to ${field.label}`}>
                        {proposal.changes.map((change, index) => change.removed ? (
                          <del key={index}>{change.value}</del>
                        ) : change.added ? (
                          <ins key={index}>{change.value}</ins>
                        ) : (
                          <span key={index}>{change.value}</span>
                        ))}
                      </div>
                      <div className="proposal-actions">
                        <button className="proposal-discard" type="button" onClick={() => resolvePolishProposal(field.id, false)}><X size={13} /> Discard</button>
                        <button className="proposal-accept" type="button" onClick={() => resolvePolishProposal(field.id, true)}><Check size={13} /> Accept changes</button>
                      </div>
                    </div>
                  ) : (
                    <textarea
                      aria-label={field.label}
                      aria-describedby={`${field.id}-description`}
                      placeholder={`Write your ${field.label.toLowerCase()} here.`}
                      value={review[field.id] || ""}
                      onChange={(event) => onChange(field.id, event.target.value)}
                    />
                  )}
                  {polishError?.key === field.id && <p className="polish-error" role="alert">{polishError.message}</p>}
                </>
              )}
            </section>
          );
        })}
      </div>

      <div className="review-actions">
        {onToggleReviewed && (
          <button className={`reviewed-button ${reviewed ? "is-reviewed" : ""}`} type="button" onClick={onToggleReviewed}>
            <CheckCircle2 size={15} /> {reviewed ? "Reviewed" : "Mark reviewed"}
          </button>
        )}
        <button className="secondary-button" type="button" onClick={copyReview}>
          {copied ? <Check size={15} /> : <Clipboard size={15} />}
          {copied ? "Copied" : "Copy"}
        </button>
        <button className="primary-button" type="button" onClick={onExport}>
          <ArrowDownToLine size={15} /> Export review
        </button>
      </div>
    </div>
  );
}

function linkifyCitations(text: string) {
  return text.replace(/\[([^\]\n]+)\](?!\()/g, (group, inner: string) => {
    if (!/pp?\./i.test(inner)) return group;
    const itemPattern = /pp?\.\s*\d+(?:\s*[-–—]\s*\d+)?|\d+(?:\s*[-–—]\s*\d+)?/gi;
    if (inner.replace(itemPattern, "").replace(/[,;\s]/g, "") !== "") return group;
    const items = inner.match(itemPattern) ?? [];
    if (!items.length) return group;
    const links = items.map((item) => {
      const label = item.trim();
      return `[${label}](#paper-page-${label.match(/\d+/)?.[0]})`;
    });
    if (links.length === 1) return links[0];
    let cursor = 0;
    let result = "[";
    items.forEach((item, index) => {
      const position = inner.indexOf(item, cursor);
      result += inner.slice(cursor, position) + links[index];
      cursor = position + item.length;
    });
    return result + inner.slice(cursor) + "]";
  });
}

function normalizeLatexDelimiters(text: string) {
  return text
    .replace(/\\\[([\s\S]*?)\\\]/g, (_, math: string) => `\n\n$$\n${math.trim()}\n$$\n\n`)
    .replace(/\\\(([^\n]*?)\\\)/g, (_, math: string) => `$${math.trim()}$`);
}

function MarkdownMessage({ children, onPage }: { children: string; onPage: (page: number) => void }) {
  const markdown = linkifyCitations(normalizeLatexDelimiters(children));
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        a: ({ href, children: linkChildren }) => {
          const page = href?.match(/^#paper-page-(\d+)$/)?.[1];
          return page ? (
            <button className="citation" type="button" onClick={() => onPage(Number(page))}>{linkChildren}</button>
          ) : (
            <a href={href} target="_blank" rel="noreferrer">{linkChildren}</a>
          );
        },
      }}
    >
      {markdown}
    </ReactMarkdown>
  );
}

function ChatPanel({ paperText, isLocal, extractionStatus, extractionError, connection, messages, setMessages, onPage }: {
  paperText: string;
  isLocal: boolean;
  extractionStatus: ExtractionStatus;
  extractionError: string;
  connection: OpenRouterConnection;
  messages: Message[];
  setMessages: (messages: Message[]) => void;
  onPage: (page: number) => void;
}) {
  const [input, setInput] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [hasConsented, setHasConsented] = useState(!isLocal);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const suggestions = ["What is the central contribution?", "Explain the evaluation setup.", "Which limitations do the authors acknowledge?"];

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  async function sendMessage(value: string) {
    const question = value.trim();
    if (!question || isSending) return;

    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages([...nextMessages, { role: "assistant", content: "" }]);
    setInput("");
    setError("");
    setIsSending(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(connection.apiKey ? { "X-OpenRouter-Key": connection.apiKey } : {}),
        },
        body: JSON.stringify({ paperText: paperText || undefined, model: connection.model || undefined, messages: nextMessages }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "The assistant could not answer." }));
        throw new Error(body.error || "The assistant could not answer.");
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("The assistant returned an empty response.");
      const decoder = new TextDecoder();
      let answer = "";
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        answer += decoder.decode(chunk, { stream: true });
        setMessages([...nextMessages, { role: "assistant", content: answer }]);
      }
    } catch (caught) {
      if ((caught as Error).name !== "AbortError") {
        setMessages(nextMessages);
        setError(caught instanceof Error ? caught.message : "The assistant could not answer.");
      }
    } finally {
      setIsSending(false);
      abortRef.current = null;
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void sendMessage(input);
    }
  }

  return (
    <div className="chat-panel">
      <div className="panel-heading chat-heading">
        <div>
          <p className="eyebrow">Paper-grounded assistant</p>
          <h2>Ask the paper</h2>
        </div>
        <div className="chat-heading-actions">
          {messages.length > 0 && !isSending && (
            <button className="icon-button" type="button" aria-label="Clear conversation" onClick={() => setMessages([])}><RotateCcw size={16} /></button>
          )}
        </div>
      </div>

      <div className="messages" ref={scrollRef} aria-live="polite">
        {isLocal && !hasConsented ? (
          <div className="consent-card">
            <div className="consent-icon"><ShieldAlert size={22} /></div>
            <p className="eyebrow">Confidentiality check</p>
            <h3>Before asking the paper</h3>
            <p>Extracted text is cached only in this browser. It is not sent to the configured model provider until you enable chat.</p>
            <p>Confirm that your venue permits external LLM use and that you accept its data policy.</p>
            <button className="primary-button" type="button" onClick={() => setHasConsented(true)}>I understand, enable chat</button>
          </div>
        ) : isLocal && extractionStatus === "extracting" ? (
          <div className="chat-empty extraction-state">
            <LoaderCircle className="spin" size={24} />
            <h3>Preparing the paper</h3>
            <p>Extracting page-aware text for questions and citations. Future opens will use the local browser cache.</p>
          </div>
        ) : isLocal && extractionStatus === "error" ? (
          <div className="chat-empty extraction-state">
            <X size={24} />
            <h3>Text extraction failed</h3>
            <p>{extractionError}</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="chat-empty">
            <div className="spark-mark"><Sparkles size={20} /></div>
            <h3>Interrogate the evidence</h3>
            <p>Answers use the loaded paper and cite relevant pages when the text supports them.</p>
            <div className="suggestions">
              {suggestions.map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => void sendMessage(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div className={`message ${message.role}`} key={`${message.role}-${index}`}>
              <span className="message-role">{message.role === "user" ? "You" : "Margin"}</span>
              <div className="message-content">
                {message.content ? <MarkdownMessage onPage={onPage}>{message.content}</MarkdownMessage> : <span className="thinking">Reading the paper</span>}
              </div>
            </div>
          ))
        )}
        {error && <div className="chat-error">{error}</div>}
      </div>

      {(!isLocal || (hasConsented && extractionStatus === "ready")) && <div className="composer">
        <textarea
          aria-label="Ask a question about the paper"
          placeholder="Ask about a claim, method, or result…"
          value={input}
          rows={2}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
        />
        {isSending ? (
          <button className="send-button stop" type="button" aria-label="Stop response" onClick={() => abortRef.current?.abort()}><Square size={14} /></button>
        ) : (
          <button className="send-button" type="button" aria-label="Send question" disabled={!input.trim()} onClick={() => void sendMessage(input)}><Send size={16} /></button>
        )}
        <span className="composer-hint">⌘ Enter to send</span>
      </div>}
    </div>
  );
}

function TabButton({ active, icon, children, onClick }: { active: boolean; icon: ReactNode; children: ReactNode; onClick: () => void }) {
  return <button role="tab" aria-selected={active} className={active ? "active" : ""} type="button" onClick={onClick}>{icon}{children}</button>;
}

function CycleManager({
  cycles,
  activeCycleId,
  cycleName,
  setCycleName,
  configurationId,
  setConfigurationId,
  creating,
  error,
  onCreate,
  onFallbackCreate,
  onOpen,
  onRename,
  onRemove,
  onClose,
}: {
  cycles: ReviewCycle[];
  activeCycleId: string;
  cycleName: string;
  setCycleName: (name: string) => void;
  configurationId: ReviewConfigurationId | "";
  setConfigurationId: (id: ReviewConfigurationId | "") => void;
  creating: boolean;
  error: string;
  onCreate: () => void;
  onFallbackCreate: () => void;
  onOpen: (cycle: ReviewCycle) => void;
  onRename: (cycle: ReviewCycle) => void;
  onRemove: (cycle: ReviewCycle) => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="cycle-modal" role="dialog" aria-modal="true" aria-labelledby="cycle-dialog-title">
        <div className="cycle-modal-heading">
          <div>
            <p className="eyebrow">Review library</p>
            <h2 id="cycle-dialog-title">Your review cycles</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close cycle manager" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="new-cycle-form">
          <div className="cycle-form-fields">
            <label>
              <span>Review venue</span>
              <select
                value={configurationId}
                onChange={(event) => setConfigurationId(isReviewConfigurationId(event.target.value) ? event.target.value : "")}
                required
              >
                <option value="">Select a venue</option>
                {REVIEW_CONFIGURATIONS.map((configuration) => (
                  <option value={configuration.id} key={configuration.id}>{configuration.venue}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Cycle name <small>(optional)</small></span>
              <input id="cycle-name" placeholder="Uses the folder name" value={cycleName} onChange={(event) => setCycleName(event.target.value)} />
            </label>
          </div>
          <div className="cycle-folder-action">
            <button className="primary-button" type="button" disabled={creating || !configurationId} onClick={onCreate}>
              {creating ? <LoaderCircle className="spin" size={15} /> : <FolderPlus size={15} />}
              Choose folder
            </button>
          </div>
          <small>Select the venue form, then choose a folder containing PDFs. Subfolders are ignored.</small>
          <button className="folder-fallback" type="button" disabled={creating || !configurationId} onClick={onFallbackCreate}>
            Folder picker not opening? Use standard folder selection
          </button>
          {error && <div className="cycle-form-error">{error}</div>}
        </div>

        <div className="cycle-list">
          {cycles.length === 0 ? (
            <div className="cycle-list-empty"><Layers3 size={22} /><span>No saved cycles yet.</span></div>
          ) : cycles.map((cycle) => (
            <article className={cycle.id === activeCycleId ? "active" : ""} key={cycle.id}>
              <button className="cycle-open" type="button" onClick={() => onOpen(cycle)}>
                <span className="cycle-folder"><FolderOpen size={17} /></span>
                <span><strong>{cycle.name}</strong><small>{cycle.configuration.venue} · {cycle.reviewed.length} of {cycle.papers.length} reviewed</small></span>
              </button>
              <button className="cycle-action" type="button" aria-label={`Rename ${cycle.name}`} onClick={() => onRename(cycle)}>Rename</button>
              <button className="cycle-action danger" type="button" aria-label={`Remove ${cycle.name}`} onClick={() => onRemove(cycle)}><Trash2 size={14} /></button>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PaperNavigator({
  cycle,
  activePaper,
  hasDraft,
  onSelect,
  onRefresh,
  onManage,
  onCollapse,
}: {
  cycle: ReviewCycle;
  activePaper: string;
  hasDraft: (paper: CyclePaper) => boolean;
  onSelect: (paper: CyclePaper) => void;
  onRefresh: () => void;
  onManage: () => void;
  onCollapse: () => void;
}) {
  const [query, setQuery] = useState("");
  const papers = cycle.papers.filter((paper) => paper.name.toLowerCase().includes(query.toLowerCase()));
  const progress = cycle.papers.length ? Math.round((cycle.reviewed.length / cycle.papers.length) * 100) : 0;

  return (
    <aside className="cycle-sidebar" aria-label={`${cycle.name} papers`}>
      <div className="cycle-sidebar-heading">
        <div className="cycle-title-row">
          <button type="button" onClick={onManage}><span>Review cycle · {cycle.configuration.venue}</span><strong>{cycle.name}</strong></button>
          <button className="collapse-cycle" type="button" aria-label="Hide review cycle sidebar" onClick={onCollapse}><PanelLeftClose size={16} /></button>
        </div>
        <div className="cycle-progress"><span><strong>{cycle.reviewed.length}</strong> / {cycle.papers.length} reviewed</span><i><b style={{ width: `${progress}%` }} /></i></div>
      </div>
      <label className="paper-search"><Search size={14} /><input aria-label="Search papers" placeholder="Search papers" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="paper-list">
        {papers.map((paper, index) => {
          const reviewed = cycle.reviewed.includes(paper.name);
          const draft = hasDraft(paper);
          return (
            <button className={paper.name === activePaper ? "active" : ""} type="button" key={paper.name} onClick={() => onSelect(paper)}>
              <span className={`paper-status ${reviewed ? "reviewed" : draft ? "progress" : ""}`}>{reviewed ? <Check size={11} /> : index + 1}</span>
              <span><strong>{paper.name.replace(/\.pdf$/i, "")}</strong><small>{reviewed ? "Reviewed" : draft ? "In progress" : "Not started"}</small></span>
            </button>
          );
        })}
        {papers.length === 0 && <p className="no-papers">No matching PDFs.</p>}
      </div>
      <div className="cycle-sidebar-actions">
        <button type="button" onClick={onRefresh}><RefreshCw size={14} /> Refresh folder</button>
        <button type="button" onClick={onManage}><Layers3 size={14} /> All cycles</button>
      </div>
    </aside>
  );
}

export function ReviewDesk() {
  const [paperId, setPaperId] = useState("");
  const [paperName, setPaperName] = useState("");
  const [paperText, setPaperText] = useState("");
  const [pdfSrc, setPdfSrc] = useState("");
  const [pdfPage, setPdfPage] = useState(1);
  const [review, setReview] = useState<Review>({});
  const [messages, setMessages] = useState<Message[]>([]);
  const [tab, setTab] = useState<WorkspaceTab>("review");
  const [mobileView, setMobileView] = useState<MobileView>("paper");
  const [loadError, setLoadError] = useState("");
  const [extractionStatus, setExtractionStatus] = useState<ExtractionStatus>("idle");
  const [extractionError, setExtractionError] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving">("saved");
  const [cycles, setCycles] = useState<ReviewCycle[]>([]);
  const [activeCycleId, setActiveCycleId] = useState("");
  const [activePaperName, setActivePaperName] = useState("");
  const [showCycleManager, setShowCycleManager] = useState(false);
  const [cycleSidebarCollapsed, setCycleSidebarCollapsed] = useState(false);
  const [cycleName, setCycleName] = useState("");
  const [configurationId, setConfigurationId] = useState<ReviewConfigurationId | "">("");
  const [creatingCycle, setCreatingCycle] = useState(false);
  const [fallbackCycleId, setFallbackCycleId] = useState("");
  const [openRouterConnection, setOpenRouterConnection] = useState<OpenRouterConnection>({ apiKey: "", model: "" });
  const [showProviderSettings, setShowProviderSettings] = useState(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const loadingRef = useRef(false);
  const reviewRef = useRef<Review>({});
  const cycleFilesRef = useRef(new Map<string, Map<string, File>>());
  const paperTextCacheRef = useRef(new Map<string, { size: number; lastModified: number; text: string }>());
  const extractionPromisesRef = useRef(new Map<string, Promise<string>>());
  const removedCycleIdsRef = useRef(new Set<string>());
  const extractionRequestRef = useRef(0);

  const activeCycle = cycles.find((cycle) => cycle.id === activeCycleId);

  useEffect(() => {
    void listReviewCycles().then(setCycles).catch(() => setLoadError("Saved review cycles could not be loaded."));
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setOpenRouterConnection({
        apiKey: sessionStorage.getItem("margin:openrouter:key") || "",
        model: localStorage.getItem("margin:openrouter:model") || "",
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => () => { if (pdfSrc.startsWith("blob:")) URL.revokeObjectURL(pdfSrc); }, [pdfSrc]);

  useEffect(() => {
    if (!paperId) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(paperKey(paperId), JSON.stringify(review));
      setSaveState("saved");
    }, 450);
    return () => window.clearTimeout(timer);
  }, [paperId, review]);

  function restoreReview(id: string, configuration: ReviewConfiguration) {
    const saved = localStorage.getItem(paperKey(id));
    const next = emptyReview(configuration);
    if (saved) {
      try {
        const stored = JSON.parse(saved) as Record<string, unknown>;
        for (const field of configuration.fields) {
          const value = stored[field.id];
          if (typeof value === "string") next[field.id] = value;
        }
      } catch {
        // A malformed local draft should not prevent the paper from opening.
      }
    }
    reviewRef.current = next;
    setReview(next);
  }

  function persistCurrentReview() {
    if (!paperId) return;
    localStorage.setItem(paperKey(paperId), JSON.stringify(reviewRef.current));
    setSaveState("saved");
  }

  async function extractLocalPdf(file: File, requestId: number, id: string, cycleId: string) {
    setExtractionStatus("extracting");
    setExtractionError("");
    try {
      const memoryCached = paperTextCacheRef.current.get(id);
      let text = memoryCached?.size === file.size && memoryCached.lastModified === file.lastModified ? memoryCached.text : null;
      if (!text) text = await getCachedPaperText(id, file.size, file.lastModified).catch(() => null);

      if (!text) {
        const extractionKey = `${id}:${file.size}:${file.lastModified}`;
        let extraction = extractionPromisesRef.current.get(extractionKey);
        if (!extraction) {
          extraction = (async () => {
            const form = new FormData();
            form.append("file", file);
            const response = await fetch("/api/extract", { method: "POST", body: form });
            const body = await response.json();
            if (!response.ok) throw new Error(body.error || "The paper text could not be extracted.");
            if (typeof body.text !== "string" || !body.text.trim()) throw new Error("The paper text could not be extracted.");
            if (!removedCycleIdsRef.current.has(cycleId)) {
              await saveCachedPaperText({ id, cycleId, size: file.size, lastModified: file.lastModified, text: body.text }).catch(() => undefined);
            }
            return body.text as string;
          })().finally(() => extractionPromisesRef.current.delete(extractionKey));
          extractionPromisesRef.current.set(extractionKey, extraction);
        }
        text = await extraction;
      }

      if (removedCycleIdsRef.current.has(cycleId)) return;
      paperTextCacheRef.current.set(id, { size: file.size, lastModified: file.lastModified, text });
      if (extractionRequestRef.current !== requestId) return;
      setPaperText(text);
      setExtractionStatus("ready");
    } catch (error) {
      if (extractionRequestRef.current !== requestId) return;
      setExtractionStatus("error");
      setExtractionError(error instanceof Error ? error.message : "The paper text could not be extracted.");
    }
  }

  async function openPdfFile(file: File, id: string, name: string, cycleId: string, configuration: ReviewConfiguration) {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoadError("");
    try {
      if (file.size > MAX_PDF_BYTES) throw new Error("This PDF is larger than the 30 MB limit.");
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) throw new Error("Choose a PDF file.");
      if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-") throw new Error("The selected file is not a valid PDF.");

      setPdfSrc(URL.createObjectURL(file));
      setActiveCycleId(cycleId);
      setActivePaperName(name);
      setPaperId(id);
      setPaperName(name.replace(/\.pdf$/i, ""));
      setPaperText("");
      setPdfPage(1);
      setMessages([]);
      restoreReview(id, configuration);
      setMobileView("paper");
      const requestId = ++extractionRequestRef.current;
      void extractLocalPdf(file, requestId, id, cycleId);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The PDF could not be loaded.");
    } finally {
      loadingRef.current = false;
    }
  }

  async function ensureFolderPermission(handle: ReviewDirectoryHandle) {
    if (await handle.queryPermission({ mode: "read" }) === "granted") return true;
    return (await handle.requestPermission({ mode: "read" })) === "granted";
  }

  async function openCyclePaper(cycle: ReviewCycle, paper: CyclePaper) {
    persistCurrentReview();
    try {
      let file = cycleFilesRef.current.get(cycle.id)?.get(paper.name);
      if (!file && cycle.handle) file = await (await cycle.handle.getFileHandle(paper.name)).getFile();
      if (!file) {
        setFallbackCycleId(cycle.id);
        folderInputRef.current?.click();
        setLoadError("Select the cycle folder again to restore access.");
        return;
      }
      persistCurrentReview();
      await openPdfFile(file, `cycle:${cycle.id}:${paper.name}`, paper.name, cycle.id, cycle.configuration);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "This paper could not be opened.");
    }
  }

  async function openCycle(cycle: ReviewCycle) {
    setLoadError("");
    if (cycle.handle && !(await ensureFolderPermission(cycle.handle))) {
      setLoadError("Folder access is required to open this review cycle.");
      return;
    }
    if (!cycle.handle && !cycleFilesRef.current.has(cycle.id)) {
      setFallbackCycleId(cycle.id);
      folderInputRef.current?.click();
      return;
    }
    setShowCycleManager(false);
    setMobileView("papers");
    if (cycle.papers.length) await openCyclePaper(cycle, cycle.papers[0]);
    else setActiveCycleId(cycle.id);
  }

  async function createCycle() {
    if (!configurationId) {
      setLoadError("Select a review venue before choosing a folder.");
      return;
    }
    const requestedName = cycleName.trim();
    const configuration = getReviewConfiguration(configurationId);
    const picker = (window as Window & { showDirectoryPicker?: () => Promise<ReviewDirectoryHandle> }).showDirectoryPicker;
    if (!picker) {
      setFallbackCycleId("__new__");
      folderInputRef.current?.click();
      return;
    }

    setCreatingCycle(true);
    setLoadError("");
    try {
      const handle = await picker.call(window);
      const papers = await scanReviewFolder(handle);
      if (!papers.length) throw new Error("The selected folder does not contain any PDF files.");
      const cycle: ReviewCycle = {
        id: crypto.randomUUID(),
        name: requestedName || handle.name,
        papers,
        reviewed: [],
        createdAt: Date.now(),
        configuration,
        handle,
      };
      await saveReviewCycle(cycle);
      setCycles((current) => [cycle, ...current]);
      setCycleName("");
      setConfigurationId("");
      await openCycle(cycle);
    } catch (error) {
      if ((error as Error).name !== "AbortError") setLoadError(error instanceof Error ? error.message : "The review cycle could not be created.");
    } finally {
      setCreatingCycle(false);
    }
  }

  function createCycleWithFallback() {
    if (!configurationId) {
      setLoadError("Select a review venue before choosing a folder.");
      return;
    }
    setLoadError("");
    setFallbackCycleId("__new__");
    folderInputRef.current?.click();
  }

  async function handleFallbackFolder(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).filter((file) => {
      const relativePath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;
      return file.name.toLowerCase().endsWith(".pdf") && relativePath.split("/").length <= 2;
    });
    if (!selected.length) {
      setLoadError("The selected folder does not contain any top-level PDF files.");
      return;
    }

    const fileMap = new Map(selected.map((file) => [file.name, file]));
    const firstPath = (selected[0] as File & { webkitRelativePath?: string }).webkitRelativePath || "";
    const folderName = firstPath.includes("/") ? firstPath.split("/")[0] : "Review cycle";
    const papers = selected
      .map((file) => ({ name: file.name, size: file.size, lastModified: file.lastModified }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
    let cycle: ReviewCycle;
    if (fallbackCycleId && fallbackCycleId !== "__new__") {
      const existing = cycles.find((item) => item.id === fallbackCycleId);
      if (!existing) return;
      cycle = { ...existing, papers, reviewed: existing.reviewed.filter((name) => fileMap.has(name)) };
      setCycles((current) => current.map((item) => item.id === cycle.id ? cycle : item));
    } else {
      if (!configurationId) {
        setLoadError("Select a review venue before choosing a folder.");
        return;
      }
      cycle = {
        id: crypto.randomUUID(),
        name: cycleName.trim() || folderName,
        papers,
        reviewed: [],
        createdAt: Date.now(),
        configuration: getReviewConfiguration(configurationId),
      };
      setCycles((current) => [cycle, ...current]);
      setCycleName("");
      setConfigurationId("");
    }
    cycleFilesRef.current.set(cycle.id, fileMap);
    await saveReviewCycle(cycle);
    setFallbackCycleId("");
    setShowCycleManager(false);
    await openCycle(cycle);
    if (folderInputRef.current) folderInputRef.current.value = "";
  }

  async function refreshCycle(cycle: ReviewCycle) {
    if (!cycle.handle) {
      setFallbackCycleId(cycle.id);
      folderInputRef.current?.click();
      return;
    }
    if (!(await ensureFolderPermission(cycle.handle))) return;
    const papers = await scanReviewFolder(cycle.handle);
    const next = { ...cycle, papers, reviewed: cycle.reviewed.filter((name) => papers.some((paper) => paper.name === name)) };
    setCycles((current) => current.map((item) => item.id === next.id ? next : item));
    await saveReviewCycle(next);
  }

  async function renameCycle(cycle: ReviewCycle) {
    const name = window.prompt("Rename review cycle", cycle.name)?.trim();
    if (!name || name === cycle.name) return;
    const next = { ...cycle, name };
    setCycles((current) => current.map((item) => item.id === next.id ? next : item));
    await saveReviewCycle(next);
  }

  async function removeCycle(cycle: ReviewCycle) {
    if (!window.confirm(`Remove “${cycle.name}”? The folder and review drafts will not be deleted. Cached paper text for this cycle will be removed.`)) return;
    if (activeCycleId === cycle.id) persistCurrentReview();
    removedCycleIdsRef.current.add(cycle.id);
    await deleteReviewCycle(cycle.id);
    for (const id of paperTextCacheRef.current.keys()) {
      if (id.startsWith(`cycle:${cycle.id}:`)) paperTextCacheRef.current.delete(id);
    }
    setCycles((current) => current.filter((item) => item.id !== cycle.id));
    cycleFilesRef.current.delete(cycle.id);
    if (activeCycleId === cycle.id) {
      extractionRequestRef.current += 1;
      setActiveCycleId("");
      setActivePaperName("");
      setPaperId("");
      setPaperName("");
      setPaperText("");
      setPdfSrc("");
      reviewRef.current = {};
      setReview({});
      setMessages([]);
    }
  }

  function returnToLanding() {
    persistCurrentReview();
    extractionRequestRef.current += 1;
    setActiveCycleId("");
    setActivePaperName("");
    setPaperId("");
    setPaperName("");
    setPaperText("");
    setPdfSrc("");
    reviewRef.current = {};
    setReview({});
    setMessages([]);
    setLoadError("");
    setShowCycleManager(false);
    setTab("review");
    setMobileView("paper");
  }

  function changePage(page: number) {
    const nextPage = Math.max(1, page);
    setPdfPage(nextPage);
    setMobileView("paper");
  }

  function markdownReview() {
    if (!activeCycle) return "";
    return activeCycle.configuration.fields
      .map((field) => `## ${field.label}\n\n${review[field.id]?.trim() || "_Not provided._"}`)
      .join("\n\n");
  }

  function exportReview() {
    const blob = new Blob([`# Review: ${paperName}\n\n${markdownReview()}\n`], { type: "text/markdown" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${paperName.replace(/[^a-z0-9-_]+/gi, "-")}-review.md`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  async function copyReview() {
    await navigator.clipboard.writeText(markdownReview());
  }

  function updateReview(key: string, value: string) {
    setSaveState("saving");
    setReview((current) => {
      const next = { ...current, [key]: value };
      reviewRef.current = next;
      return next;
    });
  }

  async function toggleReviewed() {
    if (!activeCycle || !activePaperName) return;
    persistCurrentReview();
    const reviewed = activeCycle.reviewed.includes(activePaperName)
      ? activeCycle.reviewed.filter((name) => name !== activePaperName)
      : [...activeCycle.reviewed, activePaperName];
    const next = { ...activeCycle, reviewed };
    setCycles((current) => current.map((cycle) => cycle.id === next.id ? next : cycle));
    await saveReviewCycle(next);
  }

  function cyclePaperHasDraft(cycle: ReviewCycle, paper: CyclePaper) {
    try {
      const stored = localStorage.getItem(paperKey(`cycle:${cycle.id}:${paper.name}`));
      if (!stored) return false;
      const draft = JSON.parse(stored) as Record<string, unknown>;
      return cycle.configuration.fields.some((field) => {
        const value = draft[field.id];
        return typeof value === "string" && Boolean(value.trim());
      });
    } catch {
      return false;
    }
  }

  function updateOpenRouterConnection(connection: OpenRouterConnection) {
    setOpenRouterConnection(connection);
    if (connection.apiKey) sessionStorage.setItem("margin:openrouter:key", connection.apiKey);
    else sessionStorage.removeItem("margin:openrouter:key");
    if (connection.model) localStorage.setItem("margin:openrouter:model", connection.model);
    else localStorage.removeItem("margin:openrouter:model");
  }

  const viewerSrc = pdfSrc ? `${pdfSrc}#page=${pdfPage}&view=FitH` : "";

  return (
    <main className={`app-shell mobile-${mobileView}`}>
      <input
        ref={(node) => {
          folderInputRef.current = node;
          node?.setAttribute("webkitdirectory", "");
          node?.setAttribute("directory", "");
        }}
        className="visually-hidden"
        type="file"
        multiple
        accept="application/pdf,.pdf"
        aria-label="Choose a folder of PDFs"
        onChange={(event) => void handleFallbackFolder(event.target.files)}
      />
      <header className="topbar">
        <Link className="brand" href="/" aria-label="Margin home" onClick={returnToLanding}>
          <span className="brand-mark"><span>M</span></span>
          <span><strong>Margin</strong><small>Paper review desk</small></span>
        </Link>
        <div className="header-tools">
          <ThemeToggle />
          <button className="cycles-button" type="button" onClick={() => setShowCycleManager(true)}><Layers3 size={14} /> Cycles{cycles.length ? ` · ${cycles.length}` : ""}</button>
          <button
            className={`openrouter-button ${openRouterConnection.apiKey && openRouterConnection.model ? "connected" : ""}`}
            type="button"
            aria-label={openRouterConnection.model ? `Configure OpenRouter model ${openRouterConnection.model}` : "Connect OpenRouter"}
            title={openRouterConnection.model || "Connect OpenRouter"}
            onClick={() => setShowProviderSettings(true)}
          >
            <Settings2 size={14} />
            <span>{openRouterConnection.apiKey ? openRouterConnection.model || "Choose model" : "OpenRouter"}</span>
          </button>
        </div>
      </header>
      {paperId && loadError && <div className="load-banner"><span>{loadError}</span><button type="button" aria-label="Dismiss message" onClick={() => setLoadError("")}><X size={14} /></button></div>}

      {!paperId || !activeCycle ? (
        <section className="empty-state">
          <div className="empty-paper" aria-hidden="true">
            <span className="paper-line title" /><span className="paper-line" /><span className="paper-line short" />
            <span className="paper-block" />
            <span className="paper-line" /><span className="paper-line medium" />
            <span className="margin-note">review<br />starts<br />here</span>
          </div>
          <div className="empty-copy">
            <p className="eyebrow">A quieter way to review</p>
            <h1>Read closely.<br /><em>Write clearly.</em></h1>
            <p>Open a folder of papers to move through a complete review cycle without changing context.</p>
            <button className="cycle-start" type="button" onClick={() => { setLoadError(""); setShowCycleManager(true); }}>
              <span className="upload-mark"><FolderPlus size={17} /></span>
              <span><strong>Start a review cycle</strong><small>Open a named folder of papers</small></span>
              <ChevronRight size={17} />
            </button>
            <div className="venue-support" aria-label="Supported review venues">
              <span>Venue-ready review forms</span>
              <div className="venue-logo-grid">
                {REVIEW_CONFIGURATIONS.map((configuration) => {
                  const logo = VENUE_LOGOS[configuration.id];
                  return (
                    <span className={`venue-logo${logo?.inverse ? " inverse" : ""}`} title={configuration.venue} key={configuration.id}>
                      {logo
                        ? <Image src={logo.src} width={logo.width} height={logo.height} alt={`${configuration.venue} logo`} unoptimized />
                        : <span className="venue-logo-text">{configuration.venue}</span>}
                    </span>
                  );
                })}
              </div>
              <small className="venue-marks-note">Conference names and marks belong to their respective organizations; no affiliation is implied.</small>
            </div>
            {cycles.length > 0 && <div className="recent-cycles">{cycles.slice(0, 3).map((cycle) => <button type="button" key={cycle.id} onClick={() => void openCycle(cycle)}>{cycle.name}<span>{cycle.reviewed.length}/{cycle.papers.length}</span></button>)}</div>}
            {loadError && <div className="load-error"><span>{loadError}</span></div>}
            <p className="ethics-note" role="note">
              <ShieldAlert size={12} />
              <span><strong>Not a replacement for reviewers.</strong> Margin does not review papers for you — AI features assist with reading and prose only, and every judgment remains your responsibility as the human reviewer.</span>
            </p>
            <span className="privacy-note">PDFs are read from your folder · drafts and extracted chat text stay in this browser</span>
          </div>
        </section>
      ) : (
        <div className={`workspace ${activeCycle ? "has-cycle" : ""} ${cycleSidebarCollapsed ? "cycle-collapsed" : ""}`}>
          {activeCycle && (
            <PaperNavigator
              cycle={activeCycle}
              activePaper={activePaperName}
              hasDraft={(paper) => cyclePaperHasDraft(activeCycle, paper)}
              onSelect={(paper) => void openCyclePaper(activeCycle, paper)}
              onRefresh={() => void refreshCycle(activeCycle)}
              onManage={() => setShowCycleManager(true)}
              onCollapse={() => setCycleSidebarCollapsed(true)}
            />
          )}
          <section className="paper-pane" aria-label="Paper viewer">
            <div className="paper-toolbar">
              <div className="paper-identity">
                {activeCycle && cycleSidebarCollapsed && (
                  <button className="restore-cycle" type="button" aria-label="Show review cycle sidebar" onClick={() => setCycleSidebarCollapsed(false)}><PanelLeftOpen size={16} /></button>
                )}
                <span>CYCLE PDF</span>
                <strong title={paperName}>{paperName}</strong>
              </div>
              <div className="page-control">
                <button type="button" aria-label="Previous page" disabled={pdfPage === 1} onClick={() => changePage(pdfPage - 1)}><ChevronLeft size={16} /></button>
                <label>Page <input aria-label="Page number" inputMode="numeric" value={pdfPage} onChange={(event) => changePage(Number(event.target.value) || 1)} /></label>
                <button type="button" aria-label="Next page" onClick={() => changePage(pdfPage + 1)}><ChevronRight size={16} /></button>
              </div>
            </div>
            <div className="pdf-frame-wrap">
              <iframe key={viewerSrc} className="pdf-frame" src={viewerSrc} title="OpenReview paper PDF" />
              <div className="citation-margin" aria-hidden="true"><span style={{ top: `${Math.min(82, 14 + pdfPage * 3)}%` }}>{pdfPage}</span></div>
            </div>
          </section>

          <aside className="side-pane">
            <div className="side-tabs" role="tablist" aria-label="Review workspace">
              <TabButton active={tab === "review"} icon={<FileText size={15} />} onClick={() => { setTab("review"); setMobileView("review"); }}>Review</TabButton>
              <TabButton active={tab === "chat"} icon={<MessageSquareText size={15} />} onClick={() => { setTab("chat"); setMobileView("chat"); }}>Ask paper</TabButton>
            </div>
            <div className="side-content">
              {tab === "review" ? (
                <ReviewPanel
                  key={paperId}
                  configuration={activeCycle.configuration}
                  review={review}
                  connection={openRouterConnection}
                  onOpenProviderSettings={() => setShowProviderSettings(true)}
                  saveState={saveState}
                  onChange={updateReview}
                  onExport={exportReview}
                  onCopy={copyReview}
                  reviewed={activeCycle?.reviewed.includes(activePaperName)}
                  onToggleReviewed={activeCycle ? () => void toggleReviewed() : undefined}
                />
              ) : (
                <ChatPanel
                  key={paperId}
                  paperText={paperText}
                  isLocal
                  extractionStatus={extractionStatus}
                  extractionError={extractionError}
                  connection={openRouterConnection}
                  messages={messages}
                  setMessages={setMessages}
                  onPage={changePage}
                />
              )}
            </div>
          </aside>
        </div>
      )}

      {paperId && (
        <nav className={`mobile-nav ${activeCycle ? "has-cycle" : ""}`} aria-label="Workspace views">
          {activeCycle && <button className={mobileView === "papers" ? "active" : ""} type="button" onClick={() => setMobileView("papers")}><Layers3 size={18} />Papers</button>}
          <button className={mobileView === "paper" ? "active" : ""} type="button" onClick={() => setMobileView("paper")}><BookOpen size={18} />Paper</button>
          <button className={mobileView === "review" ? "active" : ""} type="button" onClick={() => { setTab("review"); setMobileView("review"); }}><PanelRight size={18} />Review</button>
          <button className={mobileView === "chat" ? "active" : ""} type="button" onClick={() => { setTab("chat"); setMobileView("chat"); }}><MessageSquareText size={18} />Ask</button>
        </nav>
      )}
      {showCycleManager && (
        <CycleManager
          cycles={cycles}
          activeCycleId={activeCycleId}
          cycleName={cycleName}
          setCycleName={setCycleName}
          configurationId={configurationId}
          setConfigurationId={setConfigurationId}
          creating={creatingCycle}
          error={loadError}
          onCreate={() => void createCycle()}
          onFallbackCreate={createCycleWithFallback}
          onOpen={(cycle) => void openCycle(cycle)}
          onRename={(cycle) => void renameCycle(cycle)}
          onRemove={(cycle) => void removeCycle(cycle)}
          onClose={() => setShowCycleManager(false)}
        />
      )}
      {showProviderSettings && (
        <OpenRouterSettings
          connection={openRouterConnection}
          onChange={updateOpenRouterConnection}
          onClose={() => setShowProviderSettings(false)}
        />
      )}
    </main>
  );
}
