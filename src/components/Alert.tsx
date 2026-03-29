import React, { useEffect, useState } from 'react';
import './Alert.css';

interface AlertProps {
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  onClose: () => void;
  autoClose: number;
}

const Alert: React.FC<AlertProps> = ({ type, title, message, onClose, autoClose }) => {
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsRemoving(true);
    }, autoClose);

    return () => clearTimeout(timer);
  }, [autoClose]);

  useEffect(() => {
    if (isRemoving) {
      const timer = setTimeout(onClose, 150);
      return () => clearTimeout(timer);
    }
  }, [isRemoving, onClose]);

  const icons = {
    success: '✓',
    error: '!',
    warning: '!',
    info: 'ℹ',
  };

  const handleClose = () => {
    setIsRemoving(true);
  };

  return (
    <div className={`alert alert-${type} ${isRemoving ? 'removing' : ''}`}>
      <div className="alert-icon">{icons[type]}</div>
      <div className="alert-content">
        <div className="alert-title">{title}</div>
        <div className="alert-message">{message}</div>
      </div>
      <button className="alert-close" onClick={handleClose}>
        ×
      </button>
    </div>
  );
};

export default Alert;
