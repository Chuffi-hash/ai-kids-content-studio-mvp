import React from 'react';
import { TrashIcon } from './Icons';

interface DeleteButtonProps {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
  className?: string;
}

export function DeleteButton({
  onClick,
  disabled = false,
  title = 'Delete',
  ariaLabel = 'Delete',
  size = 'sm',
  className = '',
}: DeleteButtonProps) {
  const iconSize = size === 'md' ? 16 : 14;

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    onClick(e);
  };

  return (
    <button
      type="button"
      className={`delete-button delete-button-${size} ${className}`}
      onClick={handleClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      <TrashIcon size={iconSize} />
    </button>
  );
}
