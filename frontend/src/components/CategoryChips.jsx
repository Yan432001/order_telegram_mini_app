import React from 'react';

function CategoryChips({ categories, selectedCategory, onSelectCategory }) {
  return (
    <div className="categories">
      <button
        className={`category-chip ${selectedCategory === 'All' ? 'active' : ''}`}
        onClick={() => onSelectCategory('All')}
      >
        All
      </button>
      {categories.map((cat) => (
        <button
          key={cat.id}
          className={`category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
          onClick={() => onSelectCategory(cat.id)}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}

export default CategoryChips;