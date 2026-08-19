import { Volume2 } from "lucide-react";
import { C, S } from "./theme.js";
import { SPEECH_OK, speak } from "./speech.js";

/* ============================================================
   AUDIO — Web Speech, no dependency. Reads the kana so the engine
   never has to guess a kanji reading.

   Its own module rather than a local in App.jsx: the Charts view needs it too,
   and a play button that only exists inside one file is why that view shipped
   silent.
   ============================================================ */
/* Holds its footprint when disabled rather than unmounting — otherwise toggling
   audio off in Settings reflows every row and heading that contains one. */
export default function Say({ text, size = 13, color = C.muted, label = "Play", enabled = true }) {
  if (!text) return null;
  if (!enabled) return <span aria-hidden="true" style={{ display: "inline-block", width: size + 12, flexShrink: 0 }} />;
  return (
    <button className="kd-btn" title={label} aria-label={label}
      onClick={(e) => { e.stopPropagation(); speak(text); }}
      style={{ color: SPEECH_OK ? color : C.rule, padding: S[1] + 2, lineHeight: 0, flexShrink: 0 }}>
      <Volume2 size={size} />
    </button>
  );
}
