import React, { useState, useEffect, useRef } from 'react';
import './Sidebar.css';
import { ActiveAccount } from '../App';
import ValtsLogo from './hiyokologo';

type Page = 'account' | 'setting' | 'rank' | 'search';

interface SidebarProps {
  currentPage: Page;
  onPageChange: (page: Page) => void;
  activeAccount: ActiveAccount | null;
}

const Sidebar: React.FC<SidebarProps> = ({ currentPage, onPageChange, activeAccount }) => {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [displayAccount, setDisplayAccount] = useState<ActiveAccount | null>(activeAccount);
  const [animClass, setAnimClass] = useState('');
  const prevIdRef = useRef(activeAccount?.accountname);

  useEffect(() => {
    if (activeAccount?.accountname === prevIdRef.current) {
      setDisplayAccount(activeAccount);
      return;
    }
    // 旧アカウントをフェードアウト
    setAnimClass('account-exit');
    const timer = setTimeout(() => {
      setDisplayAccount(activeAccount);
      prevIdRef.current = activeAccount?.accountname;
      setAnimClass('account-enter');
      // enterアニメーション後にクラスを外す
      setTimeout(() => setAnimClass(''), 350);
    }, 250);
    return () => clearTimeout(timer);
  }, [activeAccount]);

  return (
    <div className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <ValtsLogo size={37} />
        <span className="logo-text">Hiyoko</span>
      </div>

      <button className="collapse-button" onClick={() => setIsCollapsed(!isCollapsed)}>
        <svg className="collapse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {isCollapsed ? (
            <path d="M9 18l6-6-6-6" />
          ) : (
            <path d="M15 18l-6-6 6-6" />
          )}
        </svg>
      </button>

      <nav className="sidebar-nav">
        <button
          className={`nav-item ${currentPage === 'account' ? 'active' : ''}`}
          onClick={() => onPageChange('account')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" fill="currentColor"/>
          </svg>
          <span>Account</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'rank' ? 'active' : ''}`}
          onClick={() => onPageChange('rank')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M23 4v6h-6"/>
            <path d="M1 20v-6h6"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          <span>Update</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'search' ? 'active' : ''}`}
          onClick={() => onPageChange('search')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24" fill="none">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
            <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <span>Search</span>
        </button>

        <button
          className={`nav-item ${currentPage === 'setting' ? 'active' : ''}`}
          onClick={() => onPageChange('setting')}
        >
          <svg className="nav-icon" viewBox="0 0 24 24">
            <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" fill="currentColor"/>
          </svg>
          <span>Setting</span>
        </button>

      </nav>

      <div className="sidebar-bottom">
        <div className="sidebar-game-launcher">
          <button className="game-launcher-btn" title="Riot Client" onClick={() => window.electron.riot.launchClient()}>
            <div className="game-icon-frame">
              <img src="./riotclient.png" alt="Riot Client" draggable={false} />
            </div>
          </button>
          <button className="game-launcher-btn" title="VALORANT" onClick={() => window.electron.riot.launchValorant()}>
            <div className="game-icon-frame">
              <img src="./valoranticon.png" alt="VALORANT" draggable={false} className="no-radius" />
            </div>
          </button>
          <button className="game-launcher-btn" title="League of Legends" onClick={() => window.electron.riot.launchLoL()}>
            <div className="game-icon-frame">
              <img src="./League_of_Legends_icon.png" alt="League of Legends" draggable={false} />
            </div>
          </button>
          <button className="game-launcher-btn game-kill-btn" title="ゲームを終了" onClick={() => window.electron.riot.killGames()}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <line x1="5" y1="5" x2="19" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
              <line x1="19" y1="5" x2="5" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>
        <div className={`sidebar-active-account ${animClass} ${!displayAccount ? 'no-account' : ''}`}>
          <div className="active-account-avatar">
            {displayAccount?.valorant?.usericon ? (
              <img src={displayAccount.valorant.usericon} alt={displayAccount.accountname} />
            ) : displayAccount ? (
              displayAccount.accountname.charAt(0).toUpperCase()
            ) : (
              <svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" style={{ opacity: 0.4 }}>
                <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
              </svg>
            )}
          </div>
          <div className="active-account-info">
            <div className="active-account-name">
              {displayAccount?.accountname ?? '未ログイン'}
            </div>
            <div className="active-account-rank">
              {displayAccount?.valorant?.rank || (displayAccount ? 'Unranked' : '')}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
