import { useEffect, useRef, useState } from 'react';

/**
 * InstallPromptButton — Android / Desktop only.
 * iOS is handled separately by IosInstallPrompt.jsx.
 *
 * Renders an "Install App" button whenever the browser fires
 * beforeinstallprompt. Hides automatically when:
 *   - Already running in standalone (PWA) mode
 *   - Running on iOS (IosInstallPrompt handles that path)
 *   - The browser hasn't fired beforeinstallprompt yet (e.g. already installed)
 */
export default function InstallPromptButton() {
  const deferredPrompt = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Already in standalone — don't show
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    // iOS is handled by IosInstallPrompt; skip here.
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (isIos) return;

    const handler = (e) => {
      e.preventDefault();          // Stop the mini-infobar
      deferredPrompt.current = e;  // Stash so we can call .prompt() later
      setVisible(true);
    };

    window.addEventListener('beforeinstallprompt', handler);

    // If app is installed via the prompt, hide the button
    window.addEventListener('appinstalled', () => {
      deferredPrompt.current = null;
      setVisible(false);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt.current) return;
    deferredPrompt.current.prompt();
    const { outcome } = await deferredPrompt.current.userChoice;
    if (outcome === 'accepted') {
      deferredPrompt.current = null;
      setVisible(false);
    }
  }

  if (!visible) return null;

  return (
    <button
      className="install-app-btn"
      onClick={handleInstall}
      title="Install NU-BOARD as an app"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M12 2v13M7 11l5 5 5-5" />
        <path d="M3 18h18v2a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-2z" />
      </svg>
      Install App
    </button>
  );
}
