import { useState, useEffect } from 'react';
import { acquireImage, isProtectedImageUrl, resolveImageUrl } from '../lib/authImageCache';

// Shows a question/answer image. Protected images are fetched with the user's
// credentials and kept only in the in-memory cache (see lib/authImageCache.js).
export default function AuthImage({ src, alt, className, style, onClick, ...imgProps }) {
  const isProtected = isProtectedImageUrl(src);
  const [loaded, setLoaded] = useState({ src: null, url: null, error: false });

  useEffect(() => {
    if (!src || !isProtected) return undefined;

    let active = true;
    const { promise, release } = acquireImage(src);
    promise
      .then((url) => {
        if (active) setLoaded({ src, url, error: false });
      })
      .catch(() => {
        if (active) setLoaded({ src, url: null, error: true });
      });

    return () => {
      active = false;
      release();
    };
  }, [src, isProtected]);

  // Local previews (blob:/data:) and legacy public URLs are shown as they are
  const objectUrl = isProtected ? (loaded.src === src ? loaded.url : null) : resolveImageUrl(src);
  const error = isProtected && loaded.src === src && loaded.error;

  if (error) {
    return <div className={`auth-image-error ${className || ''}`} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', color: '#9ca3af' }}>Failed to load image</div>;
  }

  if (!objectUrl) {
    return <div className={`auth-image-loading ${className || ''}`} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>Loading...</div>;
  }

  return <img src={objectUrl} alt={alt} className={className} style={style} onClick={onClick} {...imgProps} />;
}
