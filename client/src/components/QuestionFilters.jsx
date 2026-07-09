import React from 'react';
import '../styles/QuestionFilters.css';

export default function QuestionFilters({
  className = "",
  searchQuery,
  onSearchChange,
  searchPlaceholder = "Search questions...",
  role,
  subjectFilter,
  onSubjectChange,
  subjectOptions = [],
  programFilter,
  onProgramChange,
  programOptions = [],
  sortBy,
  onSortChange,
  sortOptions = [
    { value: 'newest', label: 'Sort: Newest' },
    { value: 'oldest', label: 'Sort: Oldest' }
  ]
}) {
  return (
    <div className={`qf-filters ${className}`}>
      <input
        className="qf-search"
        type="text"
        placeholder={searchPlaceholder}
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      <select
        className="qf-filter-select qf-filter-select--subject"
        value={subjectFilter}
        onChange={(e) => onSubjectChange(e.target.value)}
      >
        <option value="">Filter: All Subjects</option>
        {subjectOptions.map((tag) => (
          <option key={tag.id} value={tag.id}>
            {tag.name}
          </option>
        ))}
      </select>

      {role === 'dean' && (
        <select
          className="qf-filter-select qf-filter-select--program"
          value={programFilter || ''}
          onChange={(e) => onProgramChange(e.target.value)}
        >
          <option value="">Filter: All Programs</option>
          {programOptions.map((p) => (
            <option key={p.id || p._id} value={p.id || p._id}>
              {p.name} {p.code ? `(${p.code})` : ''}
            </option>
          ))}
        </select>
      )}

      <select
        className="qf-filter-select qf-sort"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
      >
        {sortOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
