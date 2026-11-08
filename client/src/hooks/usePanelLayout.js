import { useEffect, useState } from 'react';

// Things drawn above a full-screen panel that close on Escape by themselves
const LAYERS_ABOVE = '.ca-image-overlay, .ca-modal-overlay, [aria-modal="true"], [role="menu"]';

// The side panel of a list page (the shared ca- layout): whether it is widened over the list,
// whether it covers the whole window, and the glide between widths. openKey is whatever the
// page keeps for the open item; when it empties, full screen ends, so the next item opens beside
// the list. Pass layoutClass() and onLayoutTransitionEnd to ca-layout, sidebarClass to ca-sidebar.
export default function usePanelLayout(openKey) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGliding, setIsGliding] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  if (!openKey && isFullscreen) setIsFullscreen(false);

  // Escape leaves full screen, unless a window, image or menu is open above the panel: that one
  // closes first. Capture phase, so this looks before their own Escape handlers remove them.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const exitOnEscape = (event) => {
      if (event.key === 'Escape' && !document.querySelector(LAYERS_ABOVE)) setIsFullscreen(false);
    };
    window.addEventListener('keydown', exitOnEscape, true);
    return () => window.removeEventListener('keydown', exitOnEscape, true);
  }, [isFullscreen]);

  return {
    isExpanded,
    isGliding,
    isFullscreen,
    // is-gliding turns the width transition on for the button only, so opening and closing an
    // item still change the columns at once
    toggleExpanded: () => {
      setIsGliding(true);
      setIsExpanded((value) => !value);
    },
    toggleFullscreen: () => setIsFullscreen((value) => !value),
    layoutClass: (isShown) => [
      'ca-layout',
      isShown && isExpanded && 'is-sidebar-expanded',
      isGliding && 'is-gliding',
    ].filter(Boolean).join(' '),
    onLayoutTransitionEnd: (event) => {
      if (event.target === event.currentTarget) setIsGliding(false);
    },
    sidebarClass: `ca-sidebar${isFullscreen ? ' is-fullscreen' : ''}`,
  };
}
