import React, { useState, useEffect, useRef, useCallback } from 'react';
import './Rank.css';
import ConfirmModal from '../../components/ConfirmModal';

interface AccountType {
  id: string;
  accountname: string;
  accounttag: string;
  hasLoginData?: boolean;
  valorant: {
    rank: string;
    rankicon: string;
    level: number;
    usericon: string;
  };
}

type UpdateMode = 'rank' | 'session' | 'both';
type ItemStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

const Rank: React.FC = () => {
  const [accounts, setAccounts] = useState<AccountType[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [updateMode, setUpdateMode] = useState<UpdateMode>('rank');
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [completedCount, setCompletedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [itemStatuses, setItemStatuses] = useState<Map<string, ItemStatus>>(new Map());

  const [showSessionConfirm, setShowSessionConfirm] = useState(false);
  const [show2faConfirm, setShow2faConfirm] = useState(false);
  const confirmResolveRef = useRef<((value: string) => void) | null>(null);
  const [use2faConfirm, setUse2faConfirm] = useState(false);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await window.electron.accounts.getAll();
      setAccounts(data);
    } catch (e) {
      console.error(e);
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === accounts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(accounts.map(a => a.id)));
    }
  };

  const waitForSessionConfirm = useCallback((): Promise<string> => {
    return new Promise(resolve => {
      confirmResolveRef.current = resolve;
      setShowSessionConfirm(true);
    });
  }, []);

  const handleSessionConfirmSelect = (value: string) => {
    setShowSessionConfirm(false);
    if (value === '2fa') {
      setShow2faConfirm(true);
    } else {
      confirmResolveRef.current?.(value);
    }
  };

  const handle2faConfirmSelect = (value: string) => {
    setShow2faConfirm(false);
    confirmResolveRef.current?.(value === 'done' ? 'success' : 'failed');
  };

  const updateStatus = (id: string, status: ItemStatus) => {
    setItemStatuses(prev => new Map(prev).set(id, status));
  };

  const handleStart = async () => {
    const selected = accounts.filter(a => selectedIds.has(a.id));
    if (selected.length === 0) return;

    // セッション更新前に activeAccountId を記録
    const settings = await window.electron.settings.get();
    const prevActiveId = settings.activeAccountId ?? null;

    setIsRunning(true);
    setProgress(0);
    setCompletedCount(0);
    setTotalCount(selected.length);

    const initStatuses = new Map<string, ItemStatus>();
    selected.forEach(a => initStatuses.set(a.id, 'idle'));
    setItemStatuses(initStatuses);

    let completed = 0;
    const total = selected.length;

    for (let i = 0; i < selected.length; i++) {
      const account = selected[i];
      // Henrik API のレートリミット回避のため、2 件目以降は短いディレイを挟む
      if (i > 0 && (updateMode === 'rank' || updateMode === 'both')) {
        await new Promise(r => setTimeout(r, 500));
      }
      updateStatus(account.id, 'running');
      try {
        if (updateMode === 'rank' || updateMode === 'both') {
          const updated = await window.electron.accounts.updateRank(account.id);
          setAccounts(prev => prev.map(a =>
            a.id === account.id ? { ...a, valorant: updated.valorant } : a
          ));
        }

        if (updateMode === 'session' || updateMode === 'both') {
          if (!account.hasLoginData) {
            updateStatus(account.id, 'skipped');
            completed++;
            setCompletedCount(completed);
            setProgress(Math.round((completed / total) * 100));
            continue;
          }

          // handleAddAccount と同じフロー
          const killed = await window.electron.riot.killClient();
          if (killed) await new Promise(r => setTimeout(r, 1000));
          await window.electron.riot.deleteYaml();
          await new Promise(r => setTimeout(r, 1000));
          await window.electron.accounts.login(account.id);
          window.electron.window.focus();

          if (use2faConfirm) {
            const result = await waitForSessionConfirm();
            if (result === 'success') {
              const killed2 = await window.electron.riot.killClient();
              if (killed2) await new Promise(r => setTimeout(r, 2000));
              await window.electron.riot.saveYaml(account.id);
            }
          } else {
            await new Promise(r => setTimeout(r, 2000));
            await window.electron.riot.killClient();
            await window.electron.riot.saveYaml(account.id);
          }
        }

        updateStatus(account.id, 'done');
      } catch (e: any) {
        updateStatus(account.id, 'error');
      }

      completed++;
      setCompletedCount(completed);
      setProgress(Math.round((completed / total) * 100));
    }

    setIsRunning(false);

    // セッション更新後、元の activeAccount の YAML に戻す
    if (prevActiveId && (updateMode === 'session' || updateMode === 'both')) {
      try {
        await window.electron.riot.killClient();
        await window.electron.riot.restoreYaml(prevActiveId);
      } catch (e) {
        console.error('Failed to restore active account YAML:', e);
      }
    }

    await loadAccounts();
    setTimeout(() => {
      setProgress(0);
      setCompletedCount(0);
      setTotalCount(0);
      setItemStatuses(new Map());
    }, 5000);
  };

  const allSelected = accounts.length > 0 && selectedIds.size === accounts.length;
  const selectedCount = selectedIds.size;

  return (
    <div className="rp-container">
      {showSessionConfirm && (
        <ConfirmModal
          title="ログイン結果を選択"
          message="Riot Clientでのログインは成功しましたか？"
          closable={false}
          options={[
            { label: '成功', value: 'success', style: 'primary' },
            { label: '2FA認証', value: '2fa', style: 'secondary' },
            { label: '失敗', value: 'failed', style: 'warning' },
          ]}
          onSelect={handleSessionConfirmSelect}
        />
      )}
      {show2faConfirm && (
        <ConfirmModal
          title="2FA認証"
          message="2FA認証を完了してから選択してください。"
          closable={false}
          options={[
            { label: '認証完了', value: 'done', style: 'primary' },
            { label: '失敗', value: 'failed', style: 'warning' },
          ]}
          onSelect={handle2faConfirmSelect}
        />
      )}

      <div className="rp-card">
        <div className="rp-title-row">
          <h2 className="rp-title">Update</h2>
          <label className="rp-2fa-toggle" onClick={() => setUse2faConfirm(v => !v)}>
            <div className={`rp-checkbox ${use2faConfirm ? 'checked' : ''}`}>
              {use2faConfirm && (
                <svg viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </div>
            <span className="rp-2fa-label">二段階認証確認をする</span>
          </label>
        </div>

        <div className="rp-list">
          {accounts.length === 0 ? (
            <div className="rp-empty">アカウントが登録されていません</div>
          ) : (
            accounts.map(account => {
              const status = itemStatuses.get(account.id);
              const isSelected = selectedIds.has(account.id);
              return (
                <div
                  key={account.id}
                  className={`rp-item ${isSelected ? 'selected' : ''} ${isRunning ? 'no-interact' : ''}`}
                  onClick={() => !isRunning && toggleSelect(account.id)}
                >
                  <div className={`rp-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected && (
                      <svg viewBox="0 0 12 12" fill="none">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>

                  <div className="rp-avatar">
                    {account.valorant?.usericon ? (
                      <img src={account.valorant.usericon} alt={account.accountname} />
                    ) : (
                      account.accountname.charAt(0).toUpperCase()
                    )}
                  </div>

                  {account.valorant?.rankicon && (
                    <img className="rp-rankicon" src={account.valorant.rankicon} alt={account.valorant.rank} />
                  )}

                  <div className="rp-info">
                    <div className="rp-name">
                      {account.accountname}
                      <span className="rp-tag">#{account.accounttag}</span>
                    </div>
                    <div className="rp-rank">{account.valorant?.rank || 'Unranked'}</div>
                  </div>

                  {status && status !== 'idle' && (
                    <div className={`rp-status rp-status-${status}`}>
                      {status === 'running' && <div className="rp-spinner" />}
                      {status === 'done' && '✓'}
                      {status === 'error' && '✗'}
                      {status === 'skipped' && '—'}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        <div className="rp-footer">
          <button
            className={`rp-select-all ${allSelected ? 'active' : ''}`}
            onClick={toggleSelectAll}
            disabled={isRunning || accounts.length === 0}
          >
            {allSelected ? '全解除' : '全選択'}
          </button>

          <div className="rp-progress-area">
            {(isRunning || progress > 0) && (
              <>
                <div className="rp-progress-bar">
                  <div className="rp-progress-fill" style={{ width: `${progress}%` }} />
                </div>
                <div className="rp-progress-label">{completedCount} / {totalCount}</div>
              </>
            )}
          </div>

          <div className="rp-mode-tabs">
            {(['rank', 'session', 'both'] as UpdateMode[]).map(mode => (
              <button
                key={mode}
                className={`rp-mode-tab ${updateMode === mode ? 'active' : ''}`}
                onClick={() => !isRunning && setUpdateMode(mode)}
                disabled={isRunning}
              >
                {mode === 'rank' ? 'ランク' : mode === 'session' ? 'セッション' : '両方'}
              </button>
            ))}
          </div>

          <button
            className="rp-start"
            onClick={handleStart}
            disabled={isRunning || selectedCount === 0}
          >
            {isRunning ? '更新中...' : `更新 (${selectedCount})`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Rank;
