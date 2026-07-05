export interface ParsedTextCard {
  front: string;
  back: string;
}

/** Parses `front;back` per-line text (Anki-style plain text export). */
export function parseTextImport(text: string): ParsedTextCard[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const sep = line.indexOf(";");
      if (sep === -1) return [];
      const front = line.slice(0, sep).trim();
      const back = line.slice(sep + 1).trim();
      if (!front || !back) return [];
      return [{ front, back }];
    });
}
