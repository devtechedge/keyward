"use client";

import { useEffect, useState } from "react";

interface Connection {
  kind: string;
  label: string;
  token_fingerprint: string;
  token_masked: string;
  scope: string | null;
  updated_at: string;
}

const KINDS = [
  {
    id: "openai",
    label: "OpenAI",
    hint: "An organisation admin key, so keyward can list every key and read spend.",
    placeholder: "sk-admin-...",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    hint: "An organisation admin key. Personal accounts cannot create one.",
    placeholder: "sk-ant-admin01-...",
  },
  {
    id: "github",
    label: "GitHub",
    hint: "A token with read access to your repositories, so keyward can scan them for leaked keys.",
    placeholder: "github_pat_...",
  },
  {
    id: "vercel",
    label: "Vercel",
    hint: "A team token, so keyward can read the environment variables of every project.",
    placeholder: "vercel token",
  },
];

export function ConnectionsPanel() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [kind, setKind] = useState("openai");
  const [token, setToken] = useState("");
  const [label, setLabel] = useState("");
  const [teamId, setTeamId] = useState("");
  const [status, setStatus] = useState<{ kind: "idle" | "busy" | "ok" | "error"; message: string }>({
    kind: "idle",
    message: "",
  });

  async function load() {
    try {
      const res = await fetch("/api/connections");
      const body = (await res.json()) as { connections?: Connection[] };
      setConnections(body.connections ?? []);
    } catch {
      setConnections([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function connect(event: React.FormEvent) {
    event.preventDefault();
    if (!token.trim()) return;
    setStatus({ kind: "busy", message: "Encrypting and storing" });
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind,
          label: label.trim() || undefined,
          token: token.trim(),
          teamId: teamId.trim() || undefined,
        }),
      });
      const body = (await res.json()) as { ok: boolean; error?: string; masked?: string };
      if (!body.ok) {
        setStatus({ kind: "error", message: body.error ?? "Could not connect" });
        return;
      }
      setToken("");
      setLabel("");
      setTeamId("");
      setStatus({ kind: "ok", message: `Stored ${body.masked ?? "the credential"}` });
      await load();
    } catch (error) {
      setStatus({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const active = KINDS.find((k) => k.id === kind);

  return (
    <div>
      <div className="card">
        <div className="card-head">
          <span className="title">Connected accounts</span>
          <span className="faint" style={{ fontSize: 12.5 }}>
            {connections.length} connected
          </span>
        </div>
        <div className="card-body">
          {connections.length === 0 ? (
            <p className="muted" style={{ margin: 0, fontSize: 14 }}>
              Nothing connected yet. The demo dataset is shown until an account is connected.
            </p>
          ) : (
            <div className="table-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Kind</th>
                    <th>Credential</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.map((connection) => (
                    <tr key={`${connection.kind}-${connection.label}`}>
                      <td style={{ fontWeight: 550 }}>{connection.label}</td>
                      <td className="muted">{connection.kind}</td>
                      <td className="mono muted">{connection.token_masked}</td>
                      <td className="muted">
                        {new Date(connection.updated_at).toISOString().slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <form className="card" style={{ marginTop: 16 }} onSubmit={connect}>
        <div className="card-head">
          <span className="title">Connect an account</span>
          <span className="faint" style={{ fontSize: 12.5 }}>
            encrypted at rest
          </span>
        </div>
        <div className="card-body">
          <div className="connect-grid">
            <label className="field">
              <span className="field-label">Account type</span>
              <select
                className="input"
                value={kind}
                onChange={(event) => setKind(event.target.value)}
              >
                {KINDS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                placeholder="optional"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            {kind === "vercel" ? (
              <label className="field">
                <span className="field-label">Team id</span>
                <input
                  className="input"
                  placeholder="devtechedge1"
                  value={teamId}
                  onChange={(event) => setTeamId(event.target.value)}
                />
              </label>
            ) : null}
            <label className="field field-wide">
              <span className="field-label">Credential</span>
              <input
                className="input mono"
                type="password"
                placeholder={active?.placeholder}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                autoComplete="off"
              />
              <span className="field-hint">{active?.hint}</span>
            </label>
          </div>

          <div style={{ display: "flex", gap: 14, alignItems: "center", marginTop: 18 }}>
            <button className="btn btn-primary" type="submit" disabled={status.kind === "busy"}>
              {status.kind === "busy" ? "Storing" : "Connect"}
            </button>
            {status.kind === "ok" ? (
              <span className="notice notice-ok">{status.message}</span>
            ) : null}
            {status.kind === "error" ? (
              <span className="notice notice-error">{status.message}</span>
            ) : null}
          </div>

          <p className="muted" style={{ fontSize: 13.5, marginTop: 16, marginBottom: 0 }}>
            The credential is encrypted with a key that stays in the server environment. It is
            decrypted only for the request that needs it, and it is never sent to the browser, logged or
            stored in the clear.
          </p>
        </div>
      </form>
    </div>
  );
}
