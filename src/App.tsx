import React, { useState, useEffect } from 'react';
import './App.css';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import { AlertProvider } from './components/AlertProvider';
import Account from './pages/Account/Account';
import Setting from './pages/Setting/Setting';
import Rank from './pages/Rank/Rank';
import Search from './pages/Search/Search';
import LiveGame from './pages/LiveGame/LiveGame';
import SplashScreen from './components/SplashScreen';

type Page = 'account' | 'setting' | 'rank' | 'search' | 'livegame';
export type PythonStatus = 'starting' | 'ready' | 'error';

export interface ActiveAccount {
  accountname: string;
  accounttag: string;
  valorant: {
    rank: string;
    rankicon: string;
    level: number;
    usericon: string;
  };
}

function App(): JSX.Element {
  const [showSplash, setShowSplash] = useState(true);
  const [currentPage, setCurrentPage] = useState<Page>('account');
  const [animationKey, setAnimationKey] = useState(0);
  const [activeAccount, setActiveAccount] = useState<ActiveAccount | null>(null);
  const [pythonStatus, setPythonStatus] = useState<PythonStatus>('starting');
  const [liveGameSearch, setLiveGameSearch] = useState<{ name: string; tag: string } | null>(null);
  const [isIngame, setIsIngame] = useState(false);
  const [showLiveGameTab, setShowLiveGameTab] = useState(false);

  const loadActiveAccount = async () => {
    try {
      const settings = await window.electron.settings.get();
      setShowLiveGameTab(settings.liveGameTab === true);
      if (settings.activeAccountId) {
        const accounts = await window.electron.accounts.getAll();
        const account = accounts.find((a: any) => a.id === settings.activeAccountId);
        setActiveAccount(account || null);
      } else {
        setActiveAccount(null);
      }
    } catch (error) {
      console.error('Failed to load active account:', error);
    }
  };

  useEffect(() => {
    loadActiveAccount();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.electron?.window?.appReady?.();
      });
    });
    const unsub = window.electron?.python?.onStatus?.((status) => {
      setPythonStatus(status);
    });
    return () => unsub?.();
  }, []);

  useEffect(() => {
    // タブ非表示時はインゲーム表示が不要なのでポーリングしない
    if (!showLiveGameTab) {
      setIsIngame(false);
      return;
    }
    const poll = async () => {
      try {
        const state = await window.electron.livegame.getState();
        setIsIngame(state === 'ingame' || state === 'pregame');
      } catch {}
    };
    poll();
    const id = setInterval(poll, 8000);
    return () => clearInterval(id);
  }, [showLiveGameTab]);

  // タブが非表示になったときに LiveGame ページに居たら Account に戻す
  useEffect(() => {
    if (!showLiveGameTab && currentPage === 'livegame') {
      setCurrentPage('account');
    }
  }, [showLiveGameTab, currentPage]);

  useEffect(() => {
    if (currentPage === 'account') {
      loadActiveAccount();
    }
  }, [currentPage]);

  // アカウントページから戻ってきた時にも更新されるようにイベントを使う
  useEffect(() => {
    const handleFocus = () => loadActiveAccount();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  const handlePageChange = (page: Page) => {
    if (page === currentPage) return;
    setCurrentPage(page);
    setAnimationKey(prev => prev + 1);
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'account':
        return <Account onActiveChange={loadActiveAccount} pythonStatus={pythonStatus} />;
      case 'setting':
        return <Setting />;
      case 'rank':
        return <Rank />;
      case 'search':
        return <Search autoSearch={liveGameSearch} onAutoSearchDone={() => setLiveGameSearch(null)} />;
      case 'livegame':
        return <LiveGame onPlayerClick={(name, tag) => { setLiveGameSearch({ name, tag }); handlePageChange('search'); }} />;
      default:
        return <Account onActiveChange={loadActiveAccount} />;
    }
  };

  return (
    <AlertProvider>
      {showSplash && <SplashScreen onFinish={() => setShowSplash(false)} />}
      <div className="app">
        <TitleBar />
        <div className="app-container">
          <Sidebar currentPage={currentPage} onPageChange={handlePageChange} activeAccount={activeAccount} isIngame={isIngame} showLiveGame={showLiveGameTab} />
          <main className="main-content" key={animationKey}>
            {renderPage()}
          </main>
        </div>
      </div>
    </AlertProvider>
  );
}

export default App;
