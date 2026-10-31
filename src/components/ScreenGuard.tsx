'use client';

import { useEffect, useState } from 'react';
import { watermarkBackground } from '@/lib/watermark';

let paused = false;
/** Run a native dialog (confirm/alert) without it triggering the guard. */
export function withGuardPaused<T>(fn: () => T): T {
  paused = true;
  try {
    return fn();
  } finally {
    setTimeout(() => (paused = false), 300);
  }
}

/** Same, for async work such as the native share sheet (which takes focus away from the page). */
export async function withGuardPausedAsync<T>(fn: () => Promise<T>): Promise<T> {
  paused = true;
  try {
    return await fn();
  } finally {
    setTimeout(() => (paused = false), 600);
  }
}

/**
 * Deters screenshots / copying while a student is taking an exercise or reviewing the answers.
 *
 * NOTE: A web page cannot truly block OS-level screenshots (or a phone camera).
 * This guard makes it much harder by:
 *  - hiding the questions the moment a screenshot shortcut is pressed
 *    (PrintScreen, Win/Cmd key → Win+Shift+S / Cmd+Shift+3/4/5, Ctrl+Shift+S, …)
 *  - hiding the questions whenever the page loses focus (Snipping Tool, alt-tab, app switch)
 *  - clearing the clipboard after PrintScreen
 *  - blocking right-click, copy/cut, text selection, drag, printing and save-page
 *  - overlaying a watermark with the student's name so leaked photos are traceable
 */
export default function ScreenGuard({ studentName }: { studentName: string }) {
  const [hidden, setHidden] = useState(false);
  const [warnings, setWarnings] = useState(0);
  // Name + date + time on every screenshot or photo, so a leaked picture can be traced back.
  // (Set after mount so the server and the browser never disagree about the time.)
  const [mark, setMark] = useState(studentName);
  useEffect(() => {
    const d = new Date();
    const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setMark(`${studentName} · ${d.toLocaleDateString()} ${time}`);
  }, [studentName]);

  useEffect(() => {
    document.body.classList.add('screen-guard');

    const hide = () => {
      if (paused) return;
      // Hide the page itself right now, in the same frame, so nothing is left under the shield
      document.body.classList.add('sg-hidden');
      setHidden((was) => {
        if (!was) setWarnings((w) => w + 1);
        return true;
      });
    };

    const isEditable = (t: EventTarget | null) =>
      t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);

    const clearClipboard = () => {
      try {
        navigator.clipboard?.writeText('');
      } catch {}
    };

    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;

      // Win / Cmd key (start of Win+Shift+S, Cmd+Shift+3/4/5) and PrintScreen
      if (k === 'Meta' || k === 'OS' || k === 'PrintScreen' || k === 'Snapshot') {
        hide();
        if (k === 'PrintScreen') clearClipboard();
        return;
      }
      // Browser screenshot / devtools / print / save shortcuts
      if (
        (ctrl && e.shiftKey && ['s', 'S', 'i', 'I', 'j', 'J', 'c', 'C', 'x', 'X'].includes(k)) ||
        (ctrl && ['p', 'P', 's', 'S', 'u', 'U'].includes(k)) ||
        k === 'F12'
      ) {
        e.preventDefault();
        e.stopPropagation();
        hide();
        return;
      }
      // Copy / cut outside of answer inputs
      if (ctrl && ['c', 'C', 'x', 'X', 'a', 'A'].includes(k) && !isEditable(e.target)) {
        e.preventDefault();
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      // Some browsers only report PrintScreen on keyup
      if (e.key === 'PrintScreen' || e.key === 'Snapshot') {
        clearClipboard();
        hide();
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') hide();
    };
    const onBlur = () => hide();

    const block = (e: Event) => {
      if (!isEditable(e.target)) e.preventDefault();
    };
    const blockAlways = (e: Event) => e.preventDefault();

    const onBeforePrint = () => hide();

    // Backup for browsers that do not fire "blur" reliably (snipping tools, overlays):
    // notice focus being LOST. Only a change from focused to not-focused counts, so
    // in-app browsers that always report "no focus" never get stuck behind the shield.
    let hadFocus = document.hasFocus();
    const focusTimer = window.setInterval(() => {
      const nowFocused = document.hasFocus();
      if (hadFocus && !nowFocused) hide();
      hadFocus = nowFocused;
    }, 250);

    // Phone gestures that take a screenshot: 3-finger swipe/tap and the Samsung palm swipe
    // (a very large touch). A heuristic: the shield simply asks to tap to continue.
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 3) return hide();
      for (let i = 0; i < e.touches.length; i++) {
        const t = e.touches[i];
        if ((t.radiusX || 0) > 40 || (t.radiusY || 0) > 40) return hide();
      }
    };
    window.addEventListener('touchstart', onTouchStart, { capture: true, passive: true });

    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('keyup', onKeyUp, true);
    window.addEventListener('blur', onBlur);
    window.addEventListener('beforeprint', onBeforePrint);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('contextmenu', blockAlways);
    document.addEventListener('copy', block);
    document.addEventListener('cut', block);
    document.addEventListener('selectstart', block);
    document.addEventListener('dragstart', blockAlways);

    return () => {
      window.clearInterval(focusTimer);
      window.removeEventListener('touchstart', onTouchStart, true);
      document.body.classList.remove('screen-guard');
      document.body.classList.remove('sg-hidden');
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('beforeprint', onBeforePrint);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('contextmenu', blockAlways);
      document.removeEventListener('copy', block);
      document.removeEventListener('cut', block);
      document.removeEventListener('selectstart', block);
      document.removeEventListener('dragstart', blockAlways);
    };
  }, []);

  return (
    <>
      {/* Repeating watermark with the student's name */}
      <div className="sg-watermark" aria-hidden="true" style={{ backgroundImage: watermarkBackground(mark) }} />

      {hidden && (
        <div
          className="sg-shield"
          role="alertdialog"
          aria-modal="true"
          onClick={() => {
            document.body.classList.remove('sg-hidden');
            setHidden(false);
          }}
        >
          <div className="sg-shield-box">
            <div style={{ fontSize: '2.4rem' }}>🔒</div>
            <h2 style={{ margin: '6px 0' }}>មិនអនុញ្ញាតឱ្យថតអេក្រង់ទេ</h2>
            <p className="muted" style={{ margin: 0 }}>
              Screenshots are not allowed during the exercise.
            </p>
            {warnings > 1 && (
              <p style={{ color: 'var(--bad)', fontWeight: 600, margin: '8px 0 0' }}>
                ការព្រមាន៖ {warnings} ដង
              </p>
            )}
            <button type="button" className="btn" style={{ marginTop: 14 }} id="screen-guard-continue">
              ចុចដើម្បីបន្ត (Continue)
            </button>
          </div>
        </div>
      )}
    </>
  );
}
