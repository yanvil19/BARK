import { useState, useEffect } from 'react';
import { getStoredAuthToken } from '../lib/api';
import { getOfflineImage, saveOfflineImage } from '../lib/offlineDb';

const BASE = import.meta.env.VITE_API_URL || '';

export default function AuthImage({ src, alt, className, style, onClick }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const [error, setError] = useState(false);
  const [isOfflineMissing, setIsOfflineMissing] = useState(false);

  useEffect(() => {
    let active = true;

    // If it's a full external URL (like legacy R2), just use it directly
    if (src && /^https?:\/\//i.test(src) && !src.includes('/api/questions/image/')) {
      setObjectUrl(src);
      return;
    }

    if (!src) return;

    // Standardize key (relative path like /api/questions/image/...)
    const relativeKey = src.replace(/^https?:\/\/[^/]+/i, '');
    const absoluteUrl = src.startsWith('/') ? `${BASE}${src}` : src;

    const loadImage = async () => {
      try {
        // 1. Check IndexedDB offline image cache first
        const cachedBlob = await getOfflineImage(relativeKey) || await getOfflineImage(src);
        if (cachedBlob && active) {
          setObjectUrl(URL.createObjectURL(cachedBlob));
          return;
        }

        // 2. If offline and not in cache, flag as missing offline
        if (!navigator.onLine) {
          if (active) setIsOfflineMissing(true);
          return;
        }

        // 3. Online: Fetch from network
        const token = getStoredAuthToken();
        const res = await fetch(absoluteUrl, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });

        if (!res.ok) throw new Error('Failed to fetch image');

        const blob = await res.blob();
        if (active) {
          setObjectUrl(URL.createObjectURL(blob));
          // Cache in IndexedDB for subsequent offline use
          saveOfflineImage(relativeKey, blob).catch(() => {});
        }
      } catch (err) {
        if (active) {
          if (!navigator.onLine) {
            setIsOfflineMissing(true);
          } else {
            setError(true);
          }
        }
      }
    };

    loadImage();

    return () => {
      active = false;
      if (objectUrl && objectUrl.startsWith('blob:')) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [src]);

  if (isOfflineMissing) {
    return (
      <div
        className={`auth-image-offline ${className || ''}`}
        style={{
          ...style,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          color: '#6b7280',
          padding: '16px',
          textAlign: 'center',
          fontSize: '0.85rem',
          border: '1px dashed #d1d5db',
          borderRadius: '8px',
        }}
      >
        <span>📷 Image not downloaded for offline use</span>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`auth-image-error ${className || ''}`}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
          color: '#9ca3af',
        }}
      >
        Failed to load image
      </div>
    );
  }

  if (!objectUrl) {
    return (
      <div
        className={`auth-image-loading ${className || ''}`}
        style={{
          ...style,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#f3f4f6',
        }}
      >
        Loading image...
      </div>
    );
  }

  return <img src={objectUrl} alt={alt} className={className} style={style} onClick={onClick} />;
}
