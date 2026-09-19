import { useEffect, useState } from 'react';
import '../styles/shared/IosInstallPrompt.css';

export default function IosInstallPrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Detect iOS
    const ua = window.navigator.userAgent.toLowerCase();
    const isIos = /iphone|ipad|ipod/.test(ua) && !window.MSStream;

    // Detect if already installed / standalone
    const isStandalone =
      window.navigator.standalone === true ||
      window.matchMedia('(display-mode: standalone)').matches;

    // Check if dismissed
    const dismissed = localStorage.getItem('nu_board_ios_install_dismissed');

    if (isIos && !isStandalone && !dismissed) {
      // Short delay so page loads smoothly first
      const timer = setTimeout(() => setShow(true), 1500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('nu_board_ios_install_dismissed', 'true');
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="ios-prompt-backdrop" onClick={handleDismiss}>
      <div className="ios-prompt-card" onClick={(e) => e.stopPropagation()}>
        <div className="ios-prompt-header">
          <div className="ios-prompt-icon-wrapper">
            <img src="/src/assets/barklogo.png" alt="NU-BOARD" className="ios-prompt-logo" />
          </div>
          <div>
            <h3 className="ios-prompt-title">Install NU-BOARD for Offline Use</h3>
            <p className="ios-prompt-subtitle">Take your board exams anywhere, even without Wi-Fi or data.</p>
          </div>
          <button type="button" className="ios-prompt-close" onClick={handleDismiss} aria-label="Close">
            &times;
          </button>
        </div>

        <div className="ios-prompt-steps">
          <div className="ios-prompt-step">
            <span className="ios-prompt-num">1</span>
            <span>Tap the <strong>Share</strong> button at the bottom of Safari:</span>
            <span className="ios-prompt-share-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                <polyline points="16 6 12 2 8 6" />
                <line x1="12" y1="2" x2="12" y2="15" />
              </svg>
            </span>
          </div>

          <div className="ios-prompt-step">
            <span className="ios-prompt-num">2</span>
            <span>Scroll down and select <strong>Add to Home Screen</strong>:</span>
            <span className="ios-prompt-plus-icon" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
            </span>
          </div>

          <div className="ios-prompt-step">
            <span className="ios-prompt-num">3</span>
            <span>Tap <strong>Add</strong> in the top-right corner. You're ready to test offline!</span>
          </div>
        </div>

        <div className="ios-prompt-footer">
          <button type="button" className="ios-prompt-btn" onClick={handleDismiss}>
            Got It
          </button>
        </div>
      </div>
    </div>
  );
}
