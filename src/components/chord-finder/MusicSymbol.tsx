import VexFlow from "vexflow";

export type MusicSymbolName =
  | "whole-note"
  | "half-note"
  | "quarter-note"
  | "eighth-note"
  | "whole-rest"
  | "half-rest"
  | "quarter-rest"
  | "eighth-rest"
  | "sharp"
  | "flat"
  | "natural";

type MusicSymbolProps = {
  name: MusicSymbolName;
  className?: string;
};

const NOTE_GLYPHS: Partial<Record<MusicSymbolName, string>> = {
  "whole-note": VexFlow.Glyphs.noteWhole,
  "half-note": VexFlow.Glyphs.noteHalfUp,
  "quarter-note": VexFlow.Glyphs.noteQuarterUp,
  "eighth-note": VexFlow.Glyphs.note8thUp,
};

export default function MusicSymbol({
  name,
  className = "h-5 w-5",
}: MusicSymbolProps) {
  const noteGlyph = NOTE_GLYPHS[name];

  if (noteGlyph) {
    return (
      <span
        aria-hidden="true"
        className={`inline-flex items-center justify-center ${className}`}
        style={{
          fontFamily: "Bravura",
          fontSize: "23px",
          lineHeight: 1,
          transform: "translateY(7px)",
        }}
      >
        {noteGlyph}
      </span>
    );
  }

  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {name === "whole-rest" && (
        <>
          <path d="M5 8h14" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 8h8v5H8z" fill="currentColor" />
        </>
      )}

      {name === "half-rest" && (
        <>
          <path d="M5 15h14" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 10h8v5H8z" fill="currentColor" />
        </>
      )}

      {name === "quarter-rest" && (
        <path
          d="m13.8 3.5-4.1 5 3.4 3.2-2.8 3.3 3 2.4-2.1 3.1"
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="2.4"
        />
      )}

      {name === "eighth-rest" && (
        <>
          <circle cx="9" cy="7" fill="currentColor" r="2.4" />
          <path
            d="M10.8 7.8h5.3l-4.3 11"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.2"
          />
        </>
      )}

      {name === "sharp" && (
        <>
          <path
            d="M9 3 8 21M16 3l-1 18"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <path
            d="m5.5 9.5 13-2M5 16.5l13-2"
            stroke="currentColor"
            strokeWidth="2.2"
          />
        </>
      )}

      {name === "flat" && (
        <>
          <path d="M9 3v18" stroke="currentColor" strokeWidth="2" />
          <path
            d="M9 11.5c6-3.6 9.2 4.8 0 7.2"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </>
      )}

      {name === "natural" && (
        <>
          <path d="M8 3v15M16 6v15" stroke="currentColor" strokeWidth="2" />
          <path
            d="m8 11 8-2.5M8 16l8-2.5"
            stroke="currentColor"
            strokeWidth="2"
          />
        </>
      )}
    </svg>
  );
}
