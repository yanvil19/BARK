import React from 'react';
import DropdownSelect from './DropdownSelect.jsx';
import '../styles/components/QuestionFilters.css';

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

      <DropdownSelect
        className="qf-filter-select--subject"
        value={subjectFilter}
        onChange={(e) => onSubjectChange(e.target.value)}
        placeholder="Filter: All Subjects"
        options={subjectOptions.map((tag) => ({ value: tag.id, label: tag.name }))}
      />

      {role === 'dean' && (
        <DropdownSelect
          className="qf-filter-select--program"
          value={programFilter || ''}
          onChange={(e) => onProgramChange(e.target.value)}
          placeholder="Filter: All Programs"
          options={programOptions.map((p) => ({
            value: p.id || p._id,
            label: `${p.name}${p.code ? ` (${p.code})` : ''}`,
          }))}
        />
      )}

      <DropdownSelect
        className="qf-sort"
        value={sortBy}
        onChange={(e) => onSortChange(e.target.value)}
        options={sortOptions}
      />
    </div>
  );
}
