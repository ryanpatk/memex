import { useEffect, useRef, useState } from 'react';
import type { AgentToken } from '@memex/core';
import { agentTokenStatus, useAgentTokens } from '../hooks/useAgentTokens';
import { MCP_ENDPOINT } from '../data/memexApi';

/*
 * Settings → Agent tokens (docs/mcp.md): tokens for AI agents (a Grok Bot,
 * Claude Code, Cursor) to use memex over MCP. Create one (made by memex-api,
 * shown once here, never stored in the browser), revoke one, or revoke every
 * agent token at once. Extension tokens (Access tokens) are separate and
 * untouched by anything here.
 */

interface AgentTokensModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const fmt = (value: string | null, none: string) => (value ? dateFmt.format(new Date(value)) : none);

const EXPIRY_OPTIONS: { label: string; days: number | null }[] = [
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: '1 year', days: 365 },
  { label: 'Never', days: null },
];

const SCOPE_LABEL: Record<AgentToken['scope'], string> = { read: 'Read only', read_write: 'Read & write' };
const STATUS_LABEL = { active: 'Active', expired: 'Expired', revoked: 'Revoked' } as const;

const AgentTokensModal = ({ isOpen, onClose }: AgentTokensModalProps) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const confirmAllRef = useRef<HTMLButtonElement>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<AgentToken['scope']>('read');
  const [expiry, setExpiry] = useState('90');
  const [creating, setCreating] = useState(false);
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);
  const [copied, setCopied] = useState<'token' | 'url' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmAll, setConfirmAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const { tokens, isLoading, loadError, create, revoke, revokeAll } = useAgentTokens(isOpen);
  const live = tokens.filter((t) => agentTokenStatus(t) === 'active');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (isOpen && !dialog.open) dialog.showModal();
    else if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  // Closing forgets everything, above all the token shown once.
  useEffect(() => {
    if (isOpen) return;
    setFresh(null);
    setCopied(null);
    setName('');
    setScope('read');
    setExpiry('90');
    setError(null);
    setNameError(null);
    setConfirmingId(null);
    setConfirmAll(false);
    setNotice(null);
  }, [isOpen]);

  useEffect(() => {
    if (confirmAll) confirmAllRef.current?.focus();
  }, [confirmAll]);

  const handleCreate = async () => {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      setNameError('Name the agent, so you can tell its token and its writes apart.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setError(null);
    setCreating(true);
    try {
      const token = await create({ name: trimmed, scope, expiresInDays: expiry === 'never' ? null : Number(expiry) });
      setFresh({ token, name: trimmed });
      setCopied(null);
      setName('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create the token.');
    } finally {
      setCreating(false);
    }
  };

  const copy = async (what: 'token' | 'url', value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(what);
    } catch {
      setError('Copy failed; select the text and copy it yourself.');
    }
  };

  const handleRevoke = async (token: AgentToken) => {
    setBusy(token.id);
    setError(null);
    try {
      await revoke(token.id);
      setNotice(`Revoked “${token.client_name}”. It stops working on its next request.`);
    } catch {
      setError('Couldn’t revoke that token. Try again.');
    } finally {
      setBusy(null);
      setConfirmingId(null);
    }
  };

  const handleRevokeAll = async () => {
    setBusy('all');
    setError(null);
    try {
      const n = await revokeAll();
      setFresh(null);
      setNotice(n === 0 ? 'No active agent tokens to revoke.' : `Revoked ${n} agent ${n === 1 ? 'token' : 'tokens'}. Extension tokens still work.`);
    } catch {
      setError('Couldn’t revoke the tokens. Try again.');
    } finally {
      setBusy(null);
      setConfirmAll(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      className="app-modal agent-tokens-modal"
      aria-labelledby="agent-tokens-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="app-modal-header">
        <div className="app-modal-title-wrap">
          <h2 id="agent-tokens-title" className="app-modal-title">
            Agent tokens
          </h2>
        </div>
        <button type="button" className="app-modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </header>

      <div className="app-modal-body">
        <p className="api-tokens-help">
          Let an AI agent (a Grok Bot, Claude Code, Cursor) use memex over MCP. <strong>Read only</strong> can search and read.{' '}
          <strong>Read &amp; write</strong> can also add jots, notes, tasks and links; anything it wants to change that you made comes to your Inbox
          to approve. Nothing can delete. One token per agent, so you can revoke each alone.
        </p>

        <div className="agent-tokens-endpoint">
          <span className="app-field-label">MCP server URL</span>
          <div className="api-tokens-fresh-row">
            <code className="api-tokens-value" translate="no">
              {MCP_ENDPOINT}
            </code>
            <button type="button" className="bookmark-toolbar-cta is-secondary is-chip" onClick={() => copy('url', MCP_ENDPOINT)}>
              {copied === 'url' ? 'Copied ✓' : 'Copy'}
            </button>
          </div>
        </div>

        {fresh && (
          <div className="api-tokens-fresh" role="status">
            <p className="app-field-label">Token for “{fresh.name}”: copy it now, it won’t be shown again</p>
            <div className="api-tokens-fresh-row">
              <code className="api-tokens-value" translate="no">
                {fresh.token}
              </code>
              <button type="button" className="bookmark-toolbar-cta is-chip" onClick={() => copy('token', fresh.token)}>
                {copied === 'token' ? 'Copied ✓' : 'Copy'}
              </button>
            </div>
            <p className="api-tokens-help">
              Paste it into the agent’s secret or environment settings as <code translate="no">Authorization: Bearer …</code>. memex keeps only a
              hash of it.{' '}
              <button type="button" className="agent-tokens-link" onClick={() => setFresh(null)}>
                Done
              </button>
            </p>
          </div>
        )}

        <form
          className="agent-tokens-create"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <div className="app-field">
            <label className="app-field-label" htmlFor="agent-token-name">
              Agent name
            </label>
            <input
              ref={nameRef}
              id="agent-token-name"
              name="agent-name"
              type="text"
              className="input-field"
              autoComplete="off"
              spellCheck={false}
              maxLength={80}
              placeholder="Grok Bot: memex project…"
              value={name}
              aria-invalid={nameError ? true : undefined}
              aria-describedby={nameError ? 'agent-token-name-error' : undefined}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError(null);
              }}
            />
            {nameError && (
              <p className="agent-tokens-error" id="agent-token-name-error">
                {nameError}
              </p>
            )}
          </div>
          <div className="agent-tokens-options">
            <div className="app-field">
              <span className="app-field-label" id="agent-token-scope-label">
                Access
              </span>
              <div className="memex-segmented" role="radiogroup" aria-labelledby="agent-token-scope-label">
                {(['read', 'read_write'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={scope === value}
                    className={scope === value ? 'is-active' : undefined}
                    onClick={() => setScope(value)}
                  >
                    {SCOPE_LABEL[value]}
                  </button>
                ))}
              </div>
            </div>
            <div className="app-field">
              <label className="app-field-label" htmlFor="agent-token-expiry">
                Expires after
              </label>
              <select id="agent-token-expiry" name="expiry" className="input-field" value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                {EXPIRY_OPTIONS.map((o) => (
                  <option key={o.label} value={o.days === null ? 'never' : String(o.days)}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" className="bookmark-toolbar-cta is-chip agent-tokens-submit" disabled={creating}>
            {creating && <span className="agent-tokens-spinner" aria-hidden="true" />}
            Create token
          </button>
        </form>

        <div aria-live="polite" className="agent-tokens-live">
          {error && <p className="agent-tokens-error">{error}</p>}
          {notice && !error && <p className="api-tokens-help">{notice}</p>}
        </div>

        <div className="api-tokens-list">
          {isLoading && tokens.length === 0 && <p className="api-tokens-help">Loading…</p>}
          {loadError && <p className="agent-tokens-error">{loadError}</p>}
          {!isLoading && !loadError && tokens.length === 0 && <p className="api-tokens-help">No agent tokens yet.</p>}
          {tokens.map((token) => {
            const status = agentTokenStatus(token);
            return (
              <div key={token.id} className={`api-tokens-row agent-tokens-row is-${status}`}>
                <div className="api-tokens-row-info">
                  <span className="api-tokens-row-name" translate="no">
                    {token.client_name}
                  </span>
                  <span className="api-tokens-row-meta">
                    <span className={`agent-tokens-status is-${status}`}>{STATUS_LABEL[status]}</span> · {SCOPE_LABEL[token.scope]} · created{' '}
                    {fmt(token.created_at, '—')} · last used {fmt(token.last_used_at, 'never')} ·{' '}
                    {status === 'revoked'
                      ? `revoked ${fmt(token.revoked_at, '')}`
                      : token.expires_at
                        ? `${status === 'expired' ? 'expired' : 'expires'} ${fmt(token.expires_at, '')}`
                        : 'never expires'}
                  </span>
                </div>
                {status === 'active' && (
                  <button
                    type="button"
                    className="bookmark-toolbar-cta is-secondary is-chip api-tokens-revoke"
                    disabled={busy !== null}
                    onClick={() => (confirmingId === token.id ? void handleRevoke(token) : setConfirmingId(token.id))}
                    onBlur={() => setConfirmingId((id) => (id === token.id ? null : id))}
                  >
                    {busy === token.id ? 'Revoking…' : confirmingId === token.id ? 'Confirm revoke?' : 'Revoke'}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="agent-tokens-killswitch">
          {!confirmAll ? (
            <button type="button" className="btn-danger btn-compact" disabled={live.length === 0 || busy !== null} onClick={() => setConfirmAll(true)}>
              Revoke all agent tokens…
            </button>
          ) : (
            <div className="agent-tokens-confirm" role="alertdialog" aria-labelledby="agent-tokens-confirm-text">
              <p id="agent-tokens-confirm-text" className="api-tokens-help">
                Revoke all {live.length} active agent {live.length === 1 ? 'token' : 'tokens'}? Every connected agent loses access on its next
                request. Extension tokens keep working. This can’t be undone; you’d create new tokens.
              </p>
              <div className="agent-tokens-confirm-actions">
                <button ref={confirmAllRef} type="button" className="btn-danger btn-compact" disabled={busy !== null} onClick={() => void handleRevokeAll()}>
                  {busy === 'all' && <span className="agent-tokens-spinner" aria-hidden="true" />}
                  Revoke all
                </button>
                <button type="button" className="btn-secondary btn-compact" disabled={busy !== null} onClick={() => setConfirmAll(false)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
};

export default AgentTokensModal;
