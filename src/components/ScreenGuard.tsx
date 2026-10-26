'use client';

import { useEffect, useState } from 'react';

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

/**
 * Deters screenshots / copying while a student is taking an exercise.
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

  useEffect(() => {
    document.body.classList.add('screen-guard');

    const hide = () => {
      if (paused) return;
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
      document.body.classList.remove('screen-guard');
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

  const mark = `${studentName} · ${new Date().toLocaleDateString()}`;

  return (
    <>
      {/* Repeating watermark with the student's name */}
      <div className="sg-watermark" aria-hidden="true">
        {Array.from({ length: 40 }).map((_, i) => (
          <span key={i}>{mark}</span>
        ))}
      </div>

      {hidden && (
        <div
          className="sg-shield"
          role="alertdialog"
          aria-modal="true"
          onClick={() => setHidden(false)}
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
