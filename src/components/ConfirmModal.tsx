import React from 'react';
import './ConfirmModal.css';

export interface ConfirmModalOption {
  label: string;
  value: string;
  style?: 'primary' | 'secondary' | 'warning';
}

interface ConfirmModalProps {
  title: string;
  message?: string;
  options: ConfirmModalOption[];
  onSelect: (value: string) => void;
  onClose?: () => void;
  closable?: boolean;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({ title, message, options, onSelect, onClose, closable = true }) => {
  return (
    <div className="confirm-modal-overlay" onClick={closable ? onClose : undefined}>
      <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
        {closable && (
          <button className="confirm-modal-close" onClick={onClose}>
            &times;
          </button>
        )}
        <div className="confirm-modal-title">{title}</div>
        {message && <div className="confirm-modal-message">{message}</div>}
        <div className="confirm-modal-buttons">
          {options.map((option) => (
            <button
              key={option.value}
              className={`confirm-modal-btn confirm-modal-btn-${option.style || 'secondary'}`}
              onClick={() => onSelect(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ConfirmModal;
