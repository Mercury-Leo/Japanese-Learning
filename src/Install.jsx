/* The one nudge the platform will not draw for us.

   Chromium fires beforeinstallprompt and lets us hand it back from a button of
   our own. iOS Safari has no such event — the only thing we can do there is
   name the menu item, so that branch is text with no button. An installed
   window sees neither: beforeinstallprompt does not fire in standalone, and the
   iOS branch checks display-mode itself. Dismissal sticks, because a banner
   that returns every visit is an advert. */
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { C, T, S } from "./theme.js";
import { IKEY } from "./storage.js";

const wasDismissed = () => {
  try { return localStorage.getItem(IKEY) === "1"; } catch { return false; }
};
const installed = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || navigator.standalone === true;

export default function Install({ offset = false }) {
  const [evt, setEvt] = useState(null);   // the Chromium event, once it arrives
  const [ios, setIos] = useState(false);
  const [gone, setGone] = useState(wasDismissed);

  useEffect(() => {
    if (installed()) return;
    if (/iphone|ipad|ipod/i.test(navigator.userAgent)) setIos(true);
    const onPrompt = (e) => { e.preventDefault(); setEvt(e); };
    const onInstalled = () => setGone(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (gone || (!evt && !ios)) return null;

  const dismiss = () => {
    setGone(true);
    try { localStorage.setItem(IKEY, "1"); } catch { /* session-only */ }
  };

  return (
    /* The audio toast is transient and owns the corner while it is up, so this
       one steps above it rather than unmounting and losing the event. */
    <div className="kd-toast" style={offset ? { bottom: 104 } : undefined}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: S[3] }}>
        <span className="kd-micro" style={{ letterSpacing: ".16em", color: C.stem, paddingTop: 2, flexShrink: 0 }}>INSTALL</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: T.sm, lineHeight: 1.55 }}>
            {evt
              ? "言葉帳 installs as an app — own window, works offline, no store."
              : "Add 言葉帳 to your home screen from the Share menu to use it as an app, offline."}
          </div>
          {evt && (
            <button className="kd-btn" onClick={() => { evt.prompt(); setEvt(null); }}
              style={{ marginTop: S[3], background: C.stem, color: C.panel, padding: "6px 12px", fontSize: T.fine }}>
              Install
            </button>
          )}
        </div>
        <button className="kd-btn" onClick={dismiss} aria-label="Dismiss"
          style={{ color: C.muted, padding: 2, lineHeight: 0, flexShrink: 0 }}>
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
