import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MusicSymbol, { type MusicSymbolName } from "./MusicSymbol";

const SYMBOLS: MusicSymbolName[] = [
  "whole-note",
  "half-note",
  "quarter-note",
  "eighth-note",
  "whole-rest",
  "half-rest",
  "quarter-rest",
  "eighth-rest",
  "sharp",
  "flat",
  "natural",
];

describe("MusicSymbol", () => {
  it.each(SYMBOLS)("renders %s from the VexFlow Bravura font", (name) => {
    const markup = renderToStaticMarkup(<MusicSymbol name={name} />);

    expect(markup).toContain(`data-music-symbol="${name}"`);
    expect(markup).toContain("font-family:Bravura");
    expect(markup).not.toContain("<svg");
  });
});
