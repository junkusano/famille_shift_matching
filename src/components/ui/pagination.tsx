import React from 'react';

interface PaginationProps {
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ totalPages, currentPage, onPageChange }) => {
  if (totalPages <= 1) return null;

  const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

  return (
    <div className="flex space-x-2">
      {pages.map((page) => (
        <button
          key={page}
          onClick={() => onPageChange(page)}
          className={`px-3 py-1 border rounded ${page === currentPage ? 'bg-blue-500 text-white' : 'bg-white text-black'}`}
        >
          {page}
        </button>
      ))}
    </div>
  );
};

export default Pagination;
