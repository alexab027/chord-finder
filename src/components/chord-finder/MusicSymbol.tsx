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

const MUSIC_GLYPHS: Record<MusicSymbolName, string> = {
  "whole-note": VexFlow.Glyphs.noteWhole,
  "half-note": VexFlow.Glyphs.noteHalfUp,
  "quarter-note": VexFlow.Glyphs.noteQuarterUp,
  "eighth-note": VexFlow.Glyphs.note8thUp,
  "whole-rest": VexFlow.Glyphs.restWhole,
  "half-rest": VexFlow.Glyphs.restHalf,
  "quarter-rest": VexFlow.Glyphs.restQuarter,
  "eighth-rest": VexFlow.Glyphs.rest8th,
  sharp: VexFlow.Glyphs.accidentalSharp,
  flat: VexFlow.Glyphs.accidentalFlat,
  natural: VexFlow.Glyphs.accidentalNatural,
};

const VERTICAL_OFFSET: Record<MusicSymbolName, number> = {
  "whole-note": 7,
  "half-note": 7,
  "quarter-note": 7,
  "eighth-note": 7,
  "whole-rest": 3,
  "half-rest": 3,
  "quarter-rest": 3,
  "eighth-rest": 3,
  sharp: 4,
  flat: 4,
  natural: 4,
};

export default function MusicSymbol({
  name,
  className = "h-5 w-5",
}: MusicSymbolProps) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex items-center justify-center ${className}`}
      data-music-symbol={name}
      style={{
        fontFamily: "Bravura",
        fontSize: "23px",
        lineHeight: 1,
        transform: `translateY(${VERTICAL_OFFSET[name]}px)`,
      }}
    >
      {MUSIC_GLYPHS[name]}
    </span>
  );
}
