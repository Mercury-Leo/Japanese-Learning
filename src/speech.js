import { useState, useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import { TextToSpeech } from "@capacitor-community/text-to-speech";

/* Android's System WebView has no speechSynthesis, so inside the app speech goes
   to the platform's own engine through the TTS plugin — the same engine, and the
   same Japanese voice, that the rest of the phone uses. */
const NATIVE = Capacitor.isNativePlatform();

export const SPEECH_OK = NATIVE || (typeof window !== "undefined" && !!window.speechSynthesis);

/* One subscriber, so a play button in any panel can surface a failure without
   threading a callback through every component. */
let audioReporter = null;
export const setAudioReporter = (fn) => { audioReporter = fn; };
const reportAudio = (msg) => { if (audioReporter) audioReporter(msg); };

const pickJa = (vs) =>
  vs.find((v) => /^ja[-_]?jp$/i.test(v.lang)) || vs.find((v) => /^ja/i.test(v.lang)) || null;

export function speak(text) {
  if (!text) return;
  /* The plugin rejects instead of going quiet — no Japanese voice installed, or
     an engine still binding — so a catch does the job of the web path's check-back
     timer. Its default queue strategy flushes whatever is still playing, so the
     cancel-then-defer dance below is not needed either. */
  if (NATIVE) {
    TextToSpeech.speak({ text, lang: "ja-JP", rate: 0.85 })
      .catch((err) => reportAudio("Speech failed: " + ((err && err.message) || "unknown error")));
    return;
  }
  const synth = SPEECH_OK ? window.speechSynthesis : null;
  if (!synth) {
    reportAudio("This browser doesn't expose speech synthesis, so audio isn't available here.");
    return;
  }

  const go = () => {
    try {
      const voices = synth.getVoices() || [];
      const v = pickJa(voices);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      u.rate = 0.85;
      if (v) u.voice = v;

      let started = false;
      u.onstart = () => { started = true; };
      u.onerror = (e) => {
        const why = (e && e.error) || "unknown";
        reportAudio(why === "not-allowed"
          ? "Speech was blocked by the page."
          : "Speech failed (" + why + ").");
      };
      synth.speak(u);

      /* A frame that blocks speech fires no events at all, so check back. */
      setTimeout(() => {
        if (started || synth.speaking) return;
        if (voices.length === 0) reportAudio("No voices are reachable, so nothing can be spoken.");
        else if (!v) reportAudio("No Japanese voice on this device — found " + voices.length + " voices, none ja-JP. Add one in your OS speech settings.");
        else reportAudio("Using " + v.name + ", but no audio played.");
      }, 1500);
    } catch (err) {
      reportAudio("Speech threw: " + ((err && err.message) || "unknown error"));
    }
  };

  /* Chrome drops an utterance queued in the same tick as cancel(), so only
     cancel when something is genuinely playing — and then defer. Staying
     synchronous otherwise keeps the user gesture intact, which iOS requires. */
  if (synth.speaking || synth.pending) { synth.cancel(); setTimeout(go, 90); }
  else go();
}

/** The voice list populates asynchronously, hence the listener and late re-read. */
export function useSpeechStatus() {
  const [st, setSt] = useState({ supported: SPEECH_OK, voices: 0, ja: 0 });
  useEffect(() => {
    if (!SPEECH_OK) return;
    const count = (vs) =>
      setSt({ supported: true, voices: vs.length, ja: vs.filter((v) => /^ja/i.test(v.lang)).length });
    /* The plugin lists voices with the same lang tags. Its engine binds a moment
       after launch and the call errors until it has, so ask again until it answers. */
    if (NATIVE) {
      let t, tries = 5;
      const read = () => TextToSpeech.getSupportedVoices()
        .then((r) => count(r.voices), () => { if (tries--) t = setTimeout(read, 600); });
      read();
      return () => clearTimeout(t);
    }
    const synth = window.speechSynthesis;
    const read = () => count(synth.getVoices() || []);
    read();
    const t = setTimeout(read, 600);
    if (synth.addEventListener) synth.addEventListener("voiceschanged", read);
    return () => {
      clearTimeout(t);
      if (synth.removeEventListener) synth.removeEventListener("voiceschanged", read);
    };
  }, []);
  return st;
}
