import React, { useEffect, useState } from 'react';
import ValtsLogo from './hiyokologo';
import './SplashScreen.css';

interface SplashScreenProps {
  onFinish: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onFinish }) => {
  const [phase, setPhase] = useState<'in' | 'hold' | 'out'>('in');

  useEffect(() => {
    const holdTimer = setTimeout(() => setPhase('hold'), 600);
    const outTimer = setTimeout(() => setPhase('out'), 1400);
    const doneTimer = setTimeout(() => onFinish(), 1900);
    return () => {
      clearTimeout(holdTimer);
      clearTimeout(outTimer);
      clearTimeout(doneTimer);
    };
  }, [onFinish]);

  return (
    <div className={`splash-overlay splash-${phase}`}>
      <div className="splash-content">
        <div className="splash-logo">
          <ValtsLogo size={96} />
        </div>
        <div className="splash-name">HiyokoSwitcher</div>
      </div>
    </div>
  );
};

export default SplashScreen;
