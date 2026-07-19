"use client";

import { Check, Eye, EyeOff, KeyRound, LoaderCircle, Search, Unplug, X } from "lucide-react";
import { useEffect, useState } from "react";

export type OpenRouterConnection = {
  apiKey: string;
  model: string;
};

type Model = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  promptPrice: string;
  completionPrice: string;
};

function tokenPrice(value: string) {
  const perMillion = Number(value) * 1_000_000;
  if (!Number.isFinite(perMillion)) return "—";
  if (perMillion === 0) return "Free";
  return `$${perMillion < 0.01 ? perMillion.toFixed(4) : perMillion.toFixed(2)}`;
}

function contextLabel(tokens: number) {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(tokens % 1_000_000 ? 1 : 0)}M`;
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`;
  return String(tokens || "—");
}

export function OpenRouterSettings({
  connection,
  onChange,
  onClose,
}: {
  connection: OpenRouterConnection;
  onChange: (connection: OpenRouterConnection) => void;
  onClose: () => void;
}) {
  const [draftKey, setDraftKey] = useState(connection.apiKey);
  const [connectedKey, setConnectedKey] = useState(connection.apiKey);
  const [selectedModel, setSelectedModel] = useState(connection.model);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("most-popular");
  const [models, setModels] = useState<Model[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!connectedKey) return;
    const timer = window.setTimeout(async () => {
      setLoadingModels(true);
      setError("");
      try {
        const response = await fetch(`/api/openrouter/models?q=${encodeURIComponent(query)}&sort=${encodeURIComponent(sort)}`, {
          headers: { "X-OpenRouter-Key": connectedKey },
        });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Models could not be loaded.");
        setModels(body.models);
      } catch (caught) {
        setModels([]);
        setError(caught instanceof Error ? caught.message : "Models could not be loaded.");
      } finally {
        setLoadingModels(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [connectedKey, query, sort]);

  async function connect() {
    const key = draftKey.trim();
    if (!key) {
      setError("Enter an OpenRouter API key.");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const response = await fetch("/api/openrouter/connect", {
        method: "POST",
        headers: { "X-OpenRouter-Key": key },
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "OpenRouter rejected this API key.");
      setConnectedKey(key);
      onChange({ apiKey: key, model: selectedModel });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "OpenRouter could not be connected.");
    } finally {
      setConnecting(false);
    }
  }

  function saveModel() {
    const model = selectedModel.trim();
    if (!connectedKey) {
      setError("Connect an OpenRouter key first.");
      return;
    }
    if (!model) {
      setError("Choose or enter a model name.");
      return;
    }
    onChange({ apiKey: connectedKey, model });
    onClose();
  }

  function disconnect() {
    setDraftKey("");
    setConnectedKey("");
    setModels([]);
    setError("");
    onChange({ apiKey: "", model: selectedModel });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="provider-modal" role="dialog" aria-modal="true" aria-labelledby="provider-dialog-title">
        <div className="provider-modal-heading">
          <div>
            <p className="eyebrow">Model provider</p>
            <h2 id="provider-dialog-title">Connect OpenRouter</h2>
          </div>
          <button className="icon-button" type="button" aria-label="Close OpenRouter settings" onClick={onClose}><X size={17} /></button>
        </div>

        <div className="provider-key-section">
          <label htmlFor="openrouter-key">OpenRouter API key</label>
          <div className="key-input">
            <KeyRound size={15} />
            <input id="openrouter-key" type={showKey ? "text" : "password"} autoComplete="off" placeholder="sk-or-v1-…" value={draftKey} onChange={(event) => setDraftKey(event.target.value)} />
            <button type="button" aria-label={showKey ? "Hide API key" : "Show API key"} onClick={() => setShowKey((current) => !current)}>{showKey ? <EyeOff size={15} /> : <Eye size={15} />}</button>
          </div>
          <div className="key-actions">
            <span>{connectedKey ? <><i className="connected-dot" /> Connected for this tab</> : "The key is removed when this tab closes."}</span>
            {connectedKey && <button type="button" onClick={disconnect}><Unplug size={13} /> Disconnect</button>}
            <button className="primary-button" type="button" disabled={connecting || draftKey.trim() === connectedKey} onClick={() => void connect()}>
              {connecting ? <LoaderCircle className="spin" size={14} /> : connectedKey ? "Update key" : "Connect"}
            </button>
          </div>
        </div>

        <div className={`model-picker ${connectedKey ? "" : "is-disabled"}`}>
          <div className="model-picker-heading">
            <div><label htmlFor="model-search">OpenRouter models</label><span>{models.length} results</span></div>
            <div className="model-controls">
              <label className="model-search"><Search size={14} /><input id="model-search" disabled={!connectedKey} placeholder="Search model names and slugs" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
              <select aria-label="Sort models" disabled={!connectedKey} value={sort} onChange={(event) => setSort(event.target.value)}>
                <option value="most-popular">Most popular</option>
                <option value="input-low">Input price: low to high</option>
                <option value="input-high">Input price: high to low</option>
                <option value="output-low">Output price: low to high</option>
                <option value="output-high">Output price: high to low</option>
                <option value="latency-low-to-high">Lowest latency</option>
                <option value="throughput-high-to-low">Highest throughput</option>
              </select>
            </div>
          </div>
          <div className="model-results">
            {loadingModels ? (
              <div className="models-state"><LoaderCircle className="spin" size={20} /> Loading models</div>
            ) : models.length ? models.map((model) => {
              const free = Number(model.promptPrice) === 0 && Number(model.completionPrice) === 0;
              return (
                <button className={selectedModel === model.id ? "selected" : ""} type="button" key={model.id} onClick={() => setSelectedModel(model.id)}>
                  <span className="model-check">{selectedModel === model.id && <Check size={12} />}</span>
                  <span className="model-main"><strong>{model.name}</strong><small>{model.id}</small><em>{model.description}</em></span>
                  <span className="model-meta"><b>{contextLabel(model.contextLength)} ctx</b><small>{free ? "Free" : `${tokenPrice(model.promptPrice)} / ${tokenPrice(model.completionPrice)} per 1M`}</small></span>
                </button>
              );
            }) : (
              <div className="models-state">{connectedKey ? "No matching text models." : "Connect a key to search OpenRouter."}</div>
            )}
          </div>
        </div>

        <div className="provider-footer">
          <div>
            <label htmlFor="selected-model">Selected model slug</label>
            <input id="selected-model" placeholder="provider/model-name" value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)} />
          </div>
          {error && <div className="provider-error">{error}</div>}
          <button className="primary-button" type="button" onClick={saveModel}>Use this model</button>
        </div>
      </section>
    </div>
  );
}
