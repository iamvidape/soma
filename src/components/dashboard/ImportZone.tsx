"use client";

import { useRef, useState } from "react";

interface ImportResult {
  deckName: string;
  cardCount: number;
}

export function ImportZone({ onImported }: { onImported: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [results, setResults] = useState<ImportResult[]>([]);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  async function handleFile(file: File) {
    if (!file.name.endsWith(".apkg")) {
      setError("File must be a .apkg file");
      setStatus("error");
      return;
    }

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
        accept=".apkg"
        className="hidden"
        onChange={onInputChange}
      />

      {status === "idle" && (
        <>
          <p className="import-label">Import an Anki deck</p>
          <p className="import-sub">
            Drop a .apkg file or{" "}
            <span className="amber-link" onClick={() => inputRef.current?.click()}>
              browse
            </span>
          </p>
        </>
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
            onClick={() => { setStatus("idle"); setResults([]); }}
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
            onClick={() => setStatus("idle")}
          >
            Try again
          </p>
        </>
      )}
    </div>
  );
}
