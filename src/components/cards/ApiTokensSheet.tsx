import { useEffect, useRef, useState } from 'react';
import { relativeTime, type ApiToken } from '@memex/core';
import { useApiTokens } from '../../hooks/useApiTokens';
import Sheet from './Sheet';
import { ConfirmSheet, CopyRow, TokenRow } from './TokenParts';
import { usedLabel } from './tokenLabels';

/*
 * Settings → Access tokens in the Memory Cards look: the Agent tokens layout
 * (d32) for the browser extension's tokens. One row per token with Revoke in
 * its •••, one full-width “New access token”; a new token is shown once.
 */

const ApiTokensSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { tokens, isLoading, isCreating, createToken, revokeToken } = useApiTokens(open);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ApiToken | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setCreating(false);
      setConfirm(null);
      setNotice(null);
    }
  }, [open]);

  const doRevoke = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await revokeToken(confirm.id);
      setNotice(`Revoked “${confirm.name}”.`);
    } catch {
      setNotice('Couldn’t revoke. Try again.');
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  return (
    <>
      <Sheet titleSize="h2" open={open} onClose={onClose} title="Access tokens" width={760}>
        <p className="mc-body mc-sheet-lede">Let the memex browser extension save to your cards. Treat each token like a password.</p>
        <div aria-live="polite" className="mc-token-live">
          {notice && <p className="mc-lab">{notice}</p>}
        </div>
        {isLoading && tokens.length === 0 ? (
          <ul className="mc-token-list" aria-busy="true">
            <li className="mc-token-row is-loading">
              <span className="mc-sk" style={{ width: 220, height: 24 }} />
            </li>
          </ul>
        ) : tokens.length === 0 ? (
          <p className="mc-body mc-token-empty">No access tokens yet.</p>
        ) : (
          <ul className="mc-token-list">
            {tokens.map((token) => (
              <TokenRow
                key={token.id}
                name={token.name}
                meta={`Saves links · ${usedLabel(token.last_used_at, relativeTime)}`}
                onRevoke={() => setConfirm(token)}
              />
            ))}
          </ul>
        )}
        <button type="button" className="mc-btn is-primary is-wide" onClick={() => setCreating(true)}>
          New access token
        </button>
        <p className="mc-lab mc-token-foot">Revoke is in each token’s •••.</p>
      </Sheet>
      <NewApiTokenSheet open={open && creating} onClose={() => setCreating(false)} create={createToken} saving={isCreating} />
      <ConfirmSheet
        open={confirm !== null}
        title="Revoke this token?"
        body={confirm ? `“${confirm.name}” stops saving right away. This can’t be undone; you’d make a new token.` : ''}
        confirmLabel="Revoke"
        busy={busy}
        onConfirm={() => void doRevoke()}
        onClose={() => setConfirm(null)}
      />
    </>
  );
};

interface NewApiTokenSheetProps {
  open: boolean;
  onClose: () => void;
  create: (name: string) => Promise<string>;
  saving: boolean;
}

const NewApiTokenSheet = ({ open, onClose, create, saving }: NewApiTokenSheetProps) => {
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<string | null>(null);

  useEffect(() => {
    if (open) return;
    setName('');
    setError(null);
    setFresh(null);
  }, [open]);

  const submit = async () => {
    setError(null);
    try {
      setFresh(await create(name.trim()));
    } catch {
      setError('Couldn’t create the token. Check your connection and try again.');
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
        <p className="mc-body mc-sheet-lede">Copy it now and paste it into the extension’s options. It won’t be shown again.</p>
        <CopyRow value={fresh} label="New access token" />
      </Sheet>
    );
  }

  return (
    <Sheet titleSize="h2"
      open={open}
      onClose={onClose}
      title="New access token"
      width={680}
      initialFocus={nameRef}
      footer={
        <>
          <button type="button" className="mc-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form="mc-new-api-token" className="mc-btn is-primary" aria-busy={saving || undefined} disabled={saving}>
            Create token
          </button>
        </>
      }
    >
      <form
        id="mc-new-api-token"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="mc-flab" htmlFor="mc-api-token-name">
          Name
        </label>
        <input
          ref={nameRef}
          id="mc-api-token-name"
          name="token-name"
          className="mc-inp"
          autoComplete="off"
          spellCheck={false}
          maxLength={80}
          placeholder="Chrome extension…"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {error && <p className="mc-ferr">{error}</p>}
        <p className="mc-lab mc-token-foot">You’ll see the token once, with a Copy button.</p>
      </form>
    </Sheet>
  );
};

export default ApiTokensSheet;
