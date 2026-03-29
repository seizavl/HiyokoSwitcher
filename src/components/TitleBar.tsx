import React from 'react';
import './TitleBar.css';

const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    window.electron?.window.minimize();
  };

  const handleClose = () => {
    window.electron?.window.close();
  };

  return (
    <div className="title-bar">
      <div className="title-bar-drag">
        <span className="title-text">HiyokoSwitcher</span>
      </div>
      <div className="title-bar-controls">
        <button className="title-bar-button minimize" onClick={handleMinimize}>
          ─
        </button>
        <button className="title-bar-button close" onClick={handleClose}>
          ✕
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
