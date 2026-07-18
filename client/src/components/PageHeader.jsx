import React from 'react';
import '../styles/components/PageHeader.css';

export default function PageHeader({ title, subtitle, children, className = '' }) {
  return (
    <header className={`shared-page-header ${className}`}>
      <div className="shared-page-header-text">
        <h1 className="shared-page-header-title">{title}</h1>
        {subtitle && <p className="shared-page-header-subtitle">{subtitle}</p>}
      </div>
      {children && <div className="shared-page-header-actions">{children}</div>}
    </header>
  );
}
