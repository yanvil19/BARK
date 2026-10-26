import AuthImage from './AuthImage';
import '../styles/components/AnswerImage.css';

// Thumbnail of an answer choice's image. With onZoom the thumbnail is a button
// that opens the image without selecting the answer choice it sits in.
export default function AnswerImage({ src, onZoom, alt = 'Answer image', className = '' }) {
  if (!src) return null;

  const image = <AuthImage src={src} alt={alt} className="answer-image-img" draggable={false} />;

  if (!onZoom) {
    return <span className={`answer-image ${className}`}>{image}</span>;
  }

  return (
    <button
      type="button"
      className={`answer-image answer-image--zoomable ${className}`}
      title="View image"
      aria-label="View answer image"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onZoom(src);
      }}
    >
      {image}
    </button>
  );
}
