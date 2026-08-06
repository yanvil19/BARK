import { useState, useEffect } from 'react';
import { getStoredAuthToken } from '../lib/api';

const BASE = import.meta.env.VITE_API_URL || '';

export default function AuthImage({ src, alt, className, style, onClick }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    
    // If it's a full external URL (like legacy R2), just use it directly
    if (src && /^https?:\/\//i.test(src) && !src.includes('/api/questions/image/')) {
      setObjectUrl(src);
      return;
    }

    if (!src) return;

    // Resolve relative path to absolute API path
    const url = src.startsWith('/') ? `${BASE}${src}` : src;

    const fetchImage = async () => {
      try {
        const token = getStoredAuthToken();
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        
        if (!res.ok) throw new Error('Failed to fetch image');
        
        const blob = await res.blob();
        if (active) {
          setObjectUrl(URL.createObjectURL(blob));
        }
      } catch (err) {
        if (active) setError(true);
      }
    };

    fetchImage();

    return () => {
      active = false;
      if (objectUrl && objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (error) {
    return <div className={`auth-image-error ${className || ''}`} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6', color: '#9ca3af' }}>Failed to load image</div>;
  }

  if (!objectUrl) {
    return <div className={`auth-image-loading ${className || ''}`} style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}>Loading...</div>;
  }

  return <img src={objectUrl} alt={alt} className={className} style={style} onClick={onClick} />;
}
