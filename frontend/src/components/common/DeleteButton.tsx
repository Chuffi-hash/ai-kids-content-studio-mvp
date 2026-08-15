interface DeleteButtonProps {
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  ariaLabel?: string;
  size?: 'sm' | 'md';
}

export function DeleteButton({
  onClick,
  disabled = false,
  title = 'Delete',
  ariaLabel = 'Delete',
  size = 'sm',
}: DeleteButtonProps) {
  return (
    <button
      className={`delete-button delete-button-${size}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
    >
      🗑
    </button>
  );
}
