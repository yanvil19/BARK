import { useEffect, useState } from 'react';
import AuthImage from './AuthImage.jsx';

// A picture opened full screen: the wheel zooms (1x to 4x), dragging moves it, Escape closes it
export default function ImageZoom({ src, onClose }) {
  const [zoomLevel, setZoomLevel] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [startPos, setStartPos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    function handleEsc(event) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      onWheel={(event) => {
        setZoomLevel((prev) => Math.min(Math.max(event.deltaY < 0 ? prev + 0.2 : prev - 0.2, 1), 4));
      }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 3000,
      }}
    >
      <button
        type="button"
        aria-label="Close image"
        onClick={(event) => {
          event.stopPropagation();
          onClose();
        }}
        style={{
          position: 'absolute',
          top: '20px',
          left: '20px',
          zIndex: 4000,
          background: 'var(--primary-bg)',
          color: 'var(--accent-yellow)',
          border: 'none',
          fontSize: '28px',
          fontWeight: 'bold',
          width: '40px',
          height: '40px',
          borderRadius: '50%',
          cursor: 'pointer',
        }}
      >
        ×
      </button>

      <AuthImage
        src={src}
        alt="Zoomed"
        draggable={false}
        style={{
          maxWidth: '90vw',
          maxHeight: '90vh',
          objectFit: 'contain',
          transform: `translate(${position.x}px, ${position.y}px) scale(${zoomLevel})`,
          transition: dragging ? 'none' : 'transform 0.2s ease',
          borderRadius: '10px',
          boxShadow: '0 0 25px rgba(255,255,255,0.2)',
          cursor: zoomLevel > 1 ? 'grab' : 'zoom-in',
        }}
        onMouseDown={(event) => {
          if (zoomLevel > 1) {
            setDragging(true);
            setStartPos({ x: event.clientX - position.x, y: event.clientY - position.y });
          }
        }}
        onMouseMove={(event) => {
          if (dragging) setPosition({ x: event.clientX - startPos.x, y: event.clientY - startPos.y });
        }}
        onMouseUp={() => setDragging(false)}
        onMouseLeave={() => setDragging(false)}
        onClick={(event) => event.stopPropagation()}
      />
    </div>
  );
}
