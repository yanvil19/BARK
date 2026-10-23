import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import '../styles/components/ActionMenu.css';

/**
 * ActionMenu Component
 *
 * A reusable 3-dot [...] action button with an attached dropdown menu.
 * Uses a portal to render the dropdown menu at the root level, ensuring it is
 * never clipped by scrollable table containers or parent overflow restrictions.
 *
 * Props:
 * - items: Array<{
 *     key: string | number,
 *     label?: React.ReactNode,
 *     onClick?: () => void,
 *     danger?: boolean,
 *     disabled?: boolean,
 *     divider?: boolean,
 *     icon?: React.ReactNode
 *   }>
 * - ariaLabel: string (default: 'More actions')
 * - title: string (default: 'More actions')
 * - className: string (extra classes for trigger button)
 * - menuClassName: string (extra classes for dropdown menu)
 * - disabled: boolean
 * - children: React.ReactNode (custom trigger content instead of standard 3 dots)
 */
export default function ActionMenu({
  items = [],
  ariaLabel = 'More actions',
  title = 'More actions',
  className = '',
  menuClassName = '',
  disabled = false,
  children,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useRef(Math.random().toString(36).slice(2));

  // Position calculation
  const updatePosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const estimatedHeight = items.length * 38 + 16;
    const opensUp = rect.bottom + estimatedHeight > window.innerHeight - 12;

    setCoords({
      right: Math.max(window.innerWidth - rect.right, 8),
      ...(opensUp
        ? { bottom: window.innerHeight - rect.top + 6 }
        : { top: rect.bottom + 6 }),
    });
  };

  const handleToggle = (e) => {
    e.stopPropagation();
    if (disabled || items.length === 0) return;

    if (isOpen) {
      setIsOpen(false);
    } else {
      // Broadcast to close any other active ActionMenu instance
      window.dispatchEvent(
        new CustomEvent('ui-action-menu-open', { detail: menuId.current })
      );
      updatePosition();
      setIsOpen(true);
    }
  };

  // Close when any other ActionMenu opens
  useEffect(() => {
    const handleOtherMenuOpen = (e) => {
      if (e.detail !== menuId.current) {
        setIsOpen(false);
      }
    };

    window.addEventListener('ui-action-menu-open', handleOtherMenuOpen);
    return () => {
      window.removeEventListener('ui-action-menu-open', handleOtherMenuOpen);
    };
  }, []);

  // Close listeners: click outside (pointerdown capture), escape key, window resize/scroll
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    };

    const handleOutsidePointer = (e) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target)
      ) {
        setIsOpen(false);
      }
    };

    const handleWindowChange = () => {
      setIsOpen(false);
    };

    // Use capture phase on pointerdown to ensure it fires before child stopPropagation
    document.addEventListener('pointerdown', handleOutsidePointer, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleWindowChange, true);
    window.addEventListener('resize', handleWindowChange);

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointer, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleWindowChange, true);
      window.removeEventListener('resize', handleWindowChange);
    };
  }, [isOpen]);

  const menuElement = isOpen && coords && (
    <div
      ref={menuRef}
      className={`ui-action-menu-dropdown ambe-menu ${menuClassName}`.trim()}
      role="menu"
      style={{
        position: 'fixed',
        zIndex: 1100,
        top: coords.top !== undefined ? coords.top : 'auto',
        bottom: coords.bottom !== undefined ? coords.bottom : 'auto',
        right: coords.right !== undefined ? coords.right : 'auto',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {items.map((item, idx) => {
        if (item.divider) {
          return (
            <div
              key={item.key || `divider-${idx}`}
              className="ui-action-menu-divider ambe-menu-divider"
              role="separator"
            />
          );
        }

        const itemClasses = [
          'ui-action-menu-item',
          'ambe-menu-item',
          item.danger ? 'danger' : '',
        ].filter(Boolean).join(' ');

        return (
          <button
            key={item.key || idx}
            type="button"
            role="menuitem"
            className={itemClasses}
            disabled={item.disabled}
            onClick={() => {
              setIsOpen(false);
              if (typeof item.onClick === 'function') {
                item.onClick();
              }
            }}
          >
            {item.icon && <span className="ui-action-menu-item-icon">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={`ui-action-menu-btn ambe-btn-icon ambe-btn-more ${className}`.trim()}
        onClick={handleToggle}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title={title}
      >
        {children || (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="5" cy="12" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="19" cy="12" r="2" />
          </svg>
        )}
      </button>

      {typeof document !== 'undefined' && createPortal(menuElement, document.body)}
    </>
  );
}
