"use client";

import { useRef, useState } from "react";

interface ImportResult {
  deckName: string;
  cardCount: number;
}

interface DeckOption {
  id: string;
  name: string;
}

type Status = "idle" | "picked" | "loading" | "done" | "error";

export function ImportZone({ decks, onImported }: { decks: DeckOption[]; onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [targetDeckId, setTargetDeckId] = useState("");
  const [newDeckName, setNewDeckName] = useState("");

  function reset() {
    setStatus("idle");
    setResults([]);
    setError("");
    setPendingFile(null);
    setTargetDeckId("");
    setNewDeckName("");
  }

  function handleFile(file: File) {
    if (file.name.endsWith(".apkg")) {
      uploadApkg(file);
      return;
    }
    if (file.name.endsWith(".txt")) {
      setPendingFile(file);
      setStatus("picked");
      return;
    }
    setError("File must be a .apkg or .txt file");
    setStatus("error");
  }

  async function uploadApkg(file: File) {
    setStatus("loading");
    setError("");
    setResults([]);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch("/api/import/apkg", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setStatus("error");
        return;
      }

      setResults(data.imported);
      setStatus("done");
      onImported();
    } catch {
      setError("Network error — please try again");
      setStatus("error");
    }
  }

  async function uploadText() {
    if (!pendingFile) return;
    const name = newDeckName.trim();
    if (!targetDeckId && !name) {
      setError("Enter a name for the new deck");
      setStatus("error");
      return;
    }

    setStatus("loading");
    setError("");

    const form = new FormData();
    form.append("file", pendingFile);
    if (targetDeckId) form.append("deckId", targetDeckId);
    else form.append("deckName", name);

    try {
      const res = await fetch("/api/import/text", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Import failed");
        setStatus("error");
        return;
      }

      setResults([data.imported]);
      setStatus("done");
      onImported();
    } catch {
      setError("Network error — please try again");
      setStatus("error");
    }
  }

  function onInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={`import-zone${dragging ? " dragging" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".apkg,.txt"
        className="hidden"
        onChange={onInputChange}
      />

      {status === "idle" && (
        <>
          <p className="import-label">Import cards</p>
          <p className="import-sub">
            Drop an Anki .apkg or a text file (front;back per line), or{" "}
            <span className="amber-link" onClick={() => inputRef.current?.click()}>
              browse
            </span>
          </p>
        </>
      )}

      {status === "picked" && pendingFile && (
        <div onClick={(e) => e.stopPropagation()}>
          <p className="import-label">{pendingFile.name}</p>
          <p className="import-sub" style={{ marginBottom: "0.5rem" }}>
            One <code>front;back</code> pair per line
          </p>
          <select
            className="field-input"
            value={targetDeckId}
            onChange={(e) => setTargetDeckId(e.target.value)}
            style={{ width: "100%" }}
          >
            <option value="">+ New deck</option>
            {decks.map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
          {!targetDeckId && (
            <input
              className="field-input"
              placeholder="Deck name…"
              value={newDeckName}
              onChange={(e) => setNewDeckName(e.target.value)}
              style={{ width: "100%", marginTop: "0.5rem" }}
            />
          )}
          <div className="inline-form-actions" style={{ marginTop: "0.75rem" }}>
            <button type="button" className="app-btn-primary sm" onClick={uploadText}>Import</button>
            <button type="button" className="app-btn-ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {status === "loading" && (
        <p className="import-label">Importing…</p>
      )}

      {status === "done" && (
        <>
          <p className="import-label" style={{ color: "var(--sage)" }}>Import complete</p>
          {results.map((r) => (
            <p key={r.deckName} className="import-sub">
              {r.deckName} — {r.cardCount} cards
            </p>
          ))}
          <p
            className="amber-link import-sub"
            style={{ marginTop: "0.5rem" }}
            onClick={reset}
          >
            Import another
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <p className="import-label" style={{ color: "var(--rust)" }}>{error}</p>
          <p
            className="amber-link import-sub"
            style={{ marginTop: "0.25rem" }}
            onClick={reset}
          >
            Try again
          </p>
        </>
      )}
    </div>
  );
}
