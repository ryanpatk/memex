import { useEffect, useRef, useState } from 'react';
import { relativeTime, type AgentToken } from '@memex/core';
import { agentTokenStatus, useAgentTokens } from '../../hooks/useAgentTokens';
import { MCP_ENDPOINT } from '../../data/memexApi';
import Sheet from './Sheet';
import { ToggleGroup } from './Controls';
import { ConfirmSheet, CopyRow, TokenRow } from './TokenParts';
import { usedLabel } from './tokenLabels';

/*
 * Settings → Agent tokens in the Memory Cards look (d32): the MCP URL with
 * Copy, one row per token with Revoke in its •••, one full-width “New agent
 * token” that opens its own sheet (d45). The token is made by memex-api and
 * shown once; closing forgets it. Revoke all stays at the foot as the kill
 * switch (docs/mcp.md).
 */

const SCOPE_LABEL: Record<AgentToken['scope'], string> = { read: 'Read only', read_write: 'Read and write' };
const STATUS_LABEL = { expired: 'Expired', revoked: 'Revoked' } as const;
const EXPIRY_OPTIONS = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
] as const;
type Expiry = (typeof EXPIRY_OPTIONS)[number]['value'];

const AgentTokensSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { tokens, isLoading, loadError, create, revoke, revokeAll } = useAgentTokens(open);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<AgentToken | 'all' | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const live = tokens.filter((t) => agentTokenStatus(t) === 'active');

  useEffect(() => {
    if (!open) {
      setNotice(null);
      setCreating(false);
      setConfirm(null);
    }
  }, [open]);

  const doRevoke = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      if (confirm === 'all') {
        const n = await revokeAll();
        setNotice(n === 0 ? 'No active agent tokens to revoke.' : `Revoked ${n} agent ${n === 1 ? 'token' : 'tokens'}. Access tokens still work.`);
      } else {
        await revoke(confirm.id);
        setNotice(`Revoked “${confirm.client_name}”. It stops working on its next request.`);
      }
    } catch {
      setNotice('Couldn’t revoke. Try again.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <Sheet titleSize="h2" open={open} onClose={onClose} title="Agent tokens" width={760}>
        <p className="mc-body mc-sheet-lede">Let an agent read or write your memex over MCP.</p>
        <CopyRow value={MCP_ENDPOINT} label="MCP server URL" copyLabel="Copy URL" />
        <div aria-live="polite" className="mc-token-live">
          {notice && <p className="mc-lab">{notice}</p>}
        </div>
        {loadError ? (
          <p className="mc-ferr">{loadError}</p>
        ) : isLoading && tokens.length === 0 ? (
          <ul className="mc-token-list" aria-busy="true">
            <li className="mc-token-row is-loading">
              <span className="mc-sk" style={{ width: 220, height: 24 }} />
            </li>
          </ul>
        ) : tokens.length === 0 ? (
          <p className="mc-body mc-token-empty">No agent tokens yet. Make one per agent, so you can revoke each alone.</p>
        ) : (
          <ul className="mc-token-list">
            {tokens.map((token) => {
              const status = agentTokenStatus(token);
              const meta =
                status === 'active'
                  ? `${SCOPE_LABEL[token.scope]} · ${usedLabel(token.last_used_at, relativeTime)}`
                  : `${STATUS_LABEL[status]} · ${SCOPE_LABEL[token.scope]}`;
              return (
                <TokenRow
                  key={token.id}
                  name={token.client_name}
                  meta={meta}
                  inactive={status !== 'active'}
                  onRevoke={status === 'active' ? () => setConfirm(token) : undefined}
                />
              );
            })}
          </ul>
        )}
        <button type="button" className="mc-btn is-primary is-wide" onClick={() => setCreating(true)}>
          New agent token
        </button>
        <p className="mc-lab mc-token-foot">
          Revoke is in each token’s •••.{' '}
          {live.length > 1 && (
            <button type="button" className="mc-linkbtn is-danger" onClick={() => setConfirm('all')}>
              Revoke all agent tokens…
            </button>
          )}
        </p>
      </Sheet>
      <NewAgentTokenSheet open={open && creating} onClose={() => setCreating(false)} create={create} />
      <ConfirmSheet
        open={confirm !== null}
        title={confirm === 'all' ? 'Revoke all agent tokens?' : 'Revoke this token?'}
        body={
          confirm === 'all'
            ? `All ${live.length} active agent tokens stop working on their next request. Access tokens keep working. This can’t be undone; you’d make new tokens.`
            : confirm
              ? `“${confirm.client_name}” stops working on its next request. This can’t be undone; you’d make a new token.`
              : ''
        }
        confirmLabel={confirm === 'all' ? 'Revoke all' : 'Revoke'}
        busy={busy}
        onConfirm={() => void doRevoke()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
};

interface NewAgentTokenSheetProps {
  open: boolean;
  onClose: () => void;
  create: ReturnType<typeof useAgentTokens>['create'];
}

/** New agent token (d45): name, Read or Read and write, Create token; then the token once, with Copy. */
export const NewAgentTokenSheet = ({ open, onClose, create }: NewAgentTokenSheetProps) => {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<AgentToken['scope']>('read');
  const [expiry, setExpiry] = useState<Expiry>('90');
  const [nameError, setNameError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [fresh, setFresh] = useState<{ token: string; name: string } | null>(null);

  // Closing forgets everything, above all the token shown once
  useEffect(() => {
    if (open) return;
    setName('');
    setScope('read');
    setExpiry('90');
    setNameError(null);
    setError(null);
    setFresh(null);
  }, [open]);

  const submit = async () => {
    const trimmed = name.replace(/\s+/g, ' ').trim();
    if (!trimmed) {
      setNameError('Name the agent, so you can tell its token and its writes apart.');
      nameRef.current?.focus();
      return;
    }
    setNameError(null);
    setError(null);
    setSaving(true);
    try {
      const token = await create({ name: trimmed, scope, expiresInDays: expiry === 'never' ? null : Number(expiry) });
      setFresh({ token, name: trimmed });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t create the token.');
    } finally {
      setSaving(false);
    }
  };

  if (fresh) {
    return (
      <Sheet titleSize="h2"
        open={open}
        onClose={onClose}
        title="Your new token"
        width={680}
        footer={
          <div className="mc-sheet-foot-actions">
            <button type="button" className="mc-btn is-primary" onClick={onClose}>
              Done
            </button>
          </div>
        }
      >
        <p className="mc-body mc-sheet-lede">
          Copy the token for “{fresh.name}” now. It won’t be shown again; memex keeps only a hash of it.
        </p>
        <CopyRow value={fresh.token} label={`Token for ${fresh.name}`} />
        <p className="mc-lab mc-token-foot">
          Paste it into the agent’s secret settings as <code translate="no">Authorization: Bearer …</code>
        </p>
      </Sheet>
    );
  }

  return (
    <Sheet titleSize="h2"
      open={open}
      onClose={onClose}
      title="New agent token"
      width={680}
      initialFocus={nameRef}
      footer={
        <>
          <button type="button" className="mc-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="submit"
            form="mc-new-agent-token"
            className="mc-btn is-primary"
            aria-busy={saving || undefined}
            disabled={saving}
          >
            Create token
          </button>
        </>
      }
    >
      <form
        id="mc-new-agent-token"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="mc-flab" htmlFor="mc-agent-token-name">
          Name
        </label>
        <input
          ref={nameRef}
          id="mc-agent-token-name"
          name="agent-name"
          className="mc-inp"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          placeholder="Writing helper…"
          value={name}
          aria-invalid={nameError ? true : undefined}
          aria-describedby={nameError ? 'mc-agent-token-name-error' : undefined}
          onChange={(event) => {
            setName(event.target.value);
            if (nameError) setNameError(null);
          }}
        />
        {nameError && (
          <p className="mc-ferr" id="mc-agent-token-name-error">
            {nameError}
          </p>
        )}
        <p className="mc-flab" id="mc-agent-token-scope">
          It can
        </p>
        <div className="mc-token-scope" role="radiogroup" aria-labelledby="mc-agent-token-scope">
          {(
            [
              ['read', 'Read', 'See cards, spaces and the Journal'],
              ['read_write', 'Read and write', 'Also save, and propose edits in the Inbox'],
            ] as const
          ).map(([value, title, detail]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={scope === value}
              className="mc-choice"
              onClick={() => setScope(value)}
            >
              <span>{title}</span>
              <small>{detail}</small>
            </button>
          ))}
        </div>
        <p className="mc-flab" id="mc-agent-token-expiry">
          Expires after
        </p>
        <ToggleGroup label="Expires after" value={expiry} options={EXPIRY_OPTIONS} onChange={setExpiry} />
        {error && <p className="mc-ferr">{error}</p>}
        <p className="mc-lab mc-token-foot">You’ll see the token once, with a Copy button.</p>
      </form>
    </Sheet>
  );
};

export default AgentTokensSheet;
