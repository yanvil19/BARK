import { useEffect, useLayoutEffect, useRef, useState } from 'react';

// Things drawn above a full-screen panel that close on Escape by themselves
const LAYERS_ABOVE = '.ca-image-overlay, .ca-modal-overlay, [aria-modal="true"], [role="menu"]';

// How long a glide may take before is-gliding comes off anyway: a little over the 260ms glide
const GLIDE_LIMIT_MS = 400;

// Full screen zooms in and out like a macOS window: quick off the mark, then a long soft settle
const ZOOM_IN_MS = 440;
const ZOOM_OUT_MS = 380;
const ZOOM_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';

function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// Frames that move the full-screen panel's edges from its place beside the list (rect) out to the
// window's (full). The panel really is that size on each frame, so its text keeps its size and
// its lines rewrap as it grows, like a window being resized; its side margins grow with it (see
// is-fullscreen in QuestionApprovals.css). It lifts off the page with a soft shadow and rounded
// corners on the way, and settles flat and square.
function zoomFrames(rect, full, radius) {
  return [
    {
      top: `${rect.top - full.top}px`,
      right: `${full.right - rect.right}px`,
      bottom: `${full.bottom - rect.bottom}px`,
      left: `${rect.left - full.left}px`,
      borderRadius: `${radius}px`,
      boxShadow: '0 18px 48px rgba(26, 31, 75, 0.24)',
      overflow: 'hidden',
    },
    {
      top: '0px',
      right: '0px',
      bottom: '0px',
      left: '0px',
      borderRadius: '0px',
      boxShadow: '0 0 0 rgba(26, 31, 75, 0)',
      overflow: 'hidden',
    },
  ];
}

function cornerRadius(panel) {
  return parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 0;
}

// The side panel of a list page (the shared ca- layout): whether it is widened over the list,
// whether it covers the whole window, and the glide between widths. openKey is whatever the
// page keeps for the open item; when it empties, full screen ends, so the next item opens beside
// the list. Pass layoutClass() and onLayoutTransitionEnd to ca-layout, sidebarClass to ca-sidebar.
export default function usePanelLayout(openKey) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isGliding, setIsGliding] = useState(false);
  // Counts the glides, so one that starts while another runs gets its own time limit
  const [glideCount, setGlideCount] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const isOpen = Boolean(openKey);
  const [wasOpen, setWasOpen] = useState(isOpen);

  // The zoom running on the panel, where the panel stood before zooming in, and whether it is
  // on its way out
  const zoom = useRef(null);
  const zoomFrom = useRef(null);
  const zoomingOut = useRef(false);

  function startGlide() {
    setIsGliding(true);
    setGlideCount((count) => count + 1);
  }

  function stopZoom() {
    zoom.current?.cancel();
    zoom.current = null;
    zoomingOut.current = false;
  }

  if (!openKey && isFullscreen) setIsFullscreen(false);

  // Opening an item, or closing it, widens or narrows the columns when the panel is set wide, so
  // they glide there like the button's change. Set while rendering, so is-gliding arrives with
  // the new widths. A narrow panel keeps its width, and going from item to item moves nothing.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isExpanded) startGlide();
  }

  // The glide ends with the layout's transition. Where none runs (reduced motion, no @property
  // support, or nothing to move), is-gliding still comes off, so the page doesn't wait on it.
  useEffect(() => {
    if (!isGliding) return undefined;
    const timer = setTimeout(() => setIsGliding(false), GLIDE_LIMIT_MS);
    return () => clearTimeout(timer);
  }, [isGliding, glideCount]);

  // Zooming in: the panel already covers the window, so it starts drawn at its old place and
  // grows to fill it. Runs before the browser paints, so the full-screen panel never flashes.
  // Leaving full screen, the zoom out has already played, so its last frame is cleared here.
  useLayoutEffect(() => {
    const from = zoomFrom.current;
    zoomFrom.current = null;
    if (!isFullscreen) {
      stopZoom();
      return;
    }
    if (!from || !from.panel.isConnected) return;
    stopZoom();
    zoom.current = from.panel.animate(
      zoomFrames(from.rect, from.panel.getBoundingClientRect(), from.radius),
      { duration: ZOOM_IN_MS, easing: ZOOM_EASING },
    );
  }, [isFullscreen]);

  // A panel closed mid-zoom drops it; the empty panel may be the same element
  useLayoutEffect(() => {
    if (!isOpen) stopZoom();
  }, [isOpen]);

  function enterFullscreen(trigger) {
    const panel = trigger?.closest?.('.ca-sidebar');
    zoomFrom.current = panel && !prefersReducedMotion()
      ? { panel, rect: panel.getBoundingClientRect(), radius: cornerRadius(panel) }
      : null;
    setIsFullscreen(true);
  }

  // Zooming out: the panel shrinks back to its place beside the list while still covering the
  // window, then leaves full screen where it landed. Its place is measured by taking full screen
  // off for a moment, before anything is painted.
  function exitFullscreen() {
    if (zoomingOut.current) return;
    const panel = document.querySelector('.ca-sidebar.is-fullscreen');
    if (!panel || prefersReducedMotion()) {
      setIsFullscreen(false);
      return;
    }
    stopZoom();
    const full = panel.getBoundingClientRect();
    panel.classList.remove('is-fullscreen');
    const rect = panel.getBoundingClientRect();
    const radius = cornerRadius(panel);
    panel.classList.add('is-fullscreen');

    const animation = panel.animate(zoomFrames(rect, full, radius).reverse(), {
      duration: ZOOM_OUT_MS,
      easing: ZOOM_EASING,
      fill: 'forwards',
    });
    zoom.current = animation;
    zoomingOut.current = true;
    animation.finished.then(
      () => {
        if (zoom.current === animation) setIsFullscreen(false);
      },
      () => {},
    );
  }

  // Escape leaves full screen, unless a window, image or menu is open above the panel: that one
  // closes first. Capture phase, so this looks before their own Escape handlers remove them.
  useEffect(() => {
    if (!isFullscreen) return undefined;
    const exitOnEscape = (event) => {
      if (event.key === 'Escape' && !document.querySelector(LAYERS_ABOVE)) exitFullscreen();
    };
    window.addEventListener('keydown', exitOnEscape, true);
    return () => window.removeEventListener('keydown', exitOnEscape, true);
  });

  return {
    isExpanded,
    isGliding,
    isFullscreen,
    // is-gliding turns the width transition on, for the button and for opening or closing an item
    toggleExpanded: () => {
      startGlide();
      setIsExpanded((value) => !value);
    },
    // Called with the full-screen button's click, which says which panel to zoom
    toggleFullscreen: (event) => {
      if (isFullscreen) exitFullscreen();
      else enterFullscreen(event?.currentTarget);
    },
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
