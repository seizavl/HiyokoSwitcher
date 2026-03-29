import React, { useState, useEffect } from 'react';
import './App.css';
import TitleBar from './components/TitleBar';
import Sidebar from './components/Sidebar';
import { AlertProvider } from './components/AlertProvider';
import Account from './pages/Account/Account';
import Setting from './pages/Setting/Setting';
import Rank from './pages/Rank/Rank';
import Search from './pages/Search/Search';
import SplashScreen from './components/SplashScreen';

type Page = 'account' | 'setting' | 'rank' | 'search';
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

  const loadActiveAccount = async () => {
    try {
      const settings = await window.electron.settings.get();
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
        return <Search />;
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
          <Sidebar currentPage={currentPage} onPageChange={handlePageChange} activeAccount={activeAccount} />
          <main className="main-content" key={animationKey}>
            {renderPage()}
          </main>
        </div>
      </div>
    </AlertProvider>
  );
}

export default App;
