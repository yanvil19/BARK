import AuthImage from './AuthImage';
import '../styles/components/PassageImages.css';

// Thumbnails of a question group's shared passage images. With onZoom each
// thumbnail is a button that opens the full image.
export default function PassageImages({ images, onZoom, className = '' }) {
  if (!Array.isArray(images) || images.length === 0) return null;

  return (
    <div className={`passage-images ${className}`}>
      {images.map((src, idx) => {
        const image = (
          <AuthImage src={src} alt={`Shared passage image ${idx + 1}`} className="passage-image-img" draggable={false} />
        );

        if (!onZoom) {
          return <span key={src} className="passage-image">{image}</span>;
        }

        return (
          <button
            key={src}
            type="button"
            className="passage-image passage-image--zoomable"
            title="View image"
            aria-label={`View shared passage image ${idx + 1}`}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onZoom(src);
            }}
          >
            {image}
          </button>
        );
      })}
    </div>
  );
}
