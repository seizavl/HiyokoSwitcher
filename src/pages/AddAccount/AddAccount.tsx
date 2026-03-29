import React, { useState, useRef } from 'react';
import './AddAccount.css';
import { useAlert } from '../../components/AlertProvider';
import ConfirmModal from '../../components/ConfirmModal';

const AddAccount: React.FC = () => {
  const { addAlert } = useAlert();
  const [accountname, setAccountname] = useState('');
  const [accounttag, setAccounttag] = useState('');
  const [accountId, setAccountId] = useState('');
  const [accountPassword, setAccountPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showLoginConfirm, setShowLoginConfirm] = useState(false);
  const [show2faConfirm, setShow2faConfirm] = useState(false);
  const [pendingAccountId, setPendingAccountId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!accountname || !accounttag) {
      addAlert('error', 'エラー', 'アカウント名とタグを入力してください');
      return;
    }

    setIsLoading(true);

    try {
      // #を削除
      const cleanTag = accounttag.replace(/^#/, '');

      // IDとパスワードが入力されている場合、ログイン確認フローを実行
      if (accountId && accountPassword) {
        // まずアカウントをAPIから追加（後でモーダル確認後に保存確定）
        const newAccount = await (window.electron.accounts.add as any)({
          accountname,
          accounttag: cleanTag,
          valorant: { rank: '', rankicon: '', level: 0, usericon: '' },
          riotId: accountId || undefined,
          riotPassword: accountPassword || undefined,
        });

        console.log('Account added (pending confirmation):', newAccount);

        // 3. Riot Clientを落としてからyamlを削除して1秒待つ
        const killed = await window.electron.riot.killClient();
        if (killed) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await window.electron.riot.deleteYaml();
        await new Promise(resolve => setTimeout(resolve, 1000));

        // 4. Riot Clientを起動してログイン
        addAlert('info', '自動ログイン開始', 'Riot Clientを起動して自動ログインします...');
        const loginResult = await window.electron.accounts.login(newAccount.id);

        if (loginResult) {
          // 5. アプリを最前面にしてモーダルを出す
          window.electron.window.focus();
          setPendingAccountId(newAccount.id);
          setShowLoginConfirm(true);
        }
      } else {
        // IDパスワードなしの場合はそのまま追加
        const newAccount = await (window.electron.accounts.add as any)({
          accountname,
          accounttag: cleanTag,
          valorant: { rank: '', rankicon: '', level: 0, usericon: '' },
        });
        console.log('Account added:', newAccount);
        addAlert('success', 'アカウント追加完了', 'アカウントが正常に追加されました。');
      }

      // フォームをリセット
      setAccountname('');
      setAccounttag('');
      setAccountId('');
      setAccountPassword('');

      // 最初の入力欄にフォーカスを戻す
      setTimeout(() => nameInputRef.current?.focus(), 100);
    } catch (error: any) {
      console.error('Failed to add account:', error);
      const errorMessage = error.message || 'アカウントの追加に失敗しました';
      addAlert('error', 'エラー', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const saveLoginData = async (accountId: string) => {
    try {
      // Riot Clientのタスクを落としてShutdownData.yamlを生成させる
      const killed = await window.electron.riot.killClient();
      if (killed) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      // ShutdownData.yaml生成後にyamlを保存
      await window.electron.riot.saveYaml(accountId);
      // トグルをそのアカウントに設定
      const settings = await window.electron.settings.get();
      await window.electron.settings.save({ ...settings, activeAccountId: accountId });
      addAlert('success', '保存完了', 'アカウントを追加してログインデータを保存しました。');
    } catch (error: any) {
      console.error('Failed to save login data:', error);
      addAlert('error', 'エラー', 'ログインデータの保存に失敗しました。');
    }
  };

  const restorePreviousYaml = async () => {
    try {
      const settings = await window.electron.settings.get();
      if (settings.activeAccountId) {
        await window.electron.riot.restoreYaml(settings.activeAccountId);
      }
    } catch (error: any) {
      console.error('Failed to restore yaml:', error);
    }
  };

  const deleteFailedAccount = async (accountId: string) => {
    try {
      await window.electron.accounts.delete(accountId);
    } catch (error: any) {
      console.error('Failed to delete account:', error);
    }
  };

  const handleLoginConfirm = async (value: string) => {
    setShowLoginConfirm(false);
    switch (value) {
      case 'success':
        if (pendingAccountId) {
          await saveLoginData(pendingAccountId);
        }
        break;
      case 'failed':
        if (pendingAccountId) {
          await deleteFailedAccount(pendingAccountId);
        }
        await restorePreviousYaml();
        addAlert('error', 'ログイン失敗', 'ログインに失敗しました。ID/パスワードを確認してください。');
        break;
      case '2fa':
        setShow2faConfirm(true);
        return;
    }
    setPendingAccountId(null);
  };

  const handle2faConfirm = async (value: string) => {
    setShow2faConfirm(false);
    if (value === 'done') {
      if (pendingAccountId) {
        await saveLoginData(pendingAccountId);
      }
    } else if (value === 'failed') {
      if (pendingAccountId) {
        await deleteFailedAccount(pendingAccountId);
      }
      await restorePreviousYaml();
      addAlert('error', 'ログイン失敗', '二段階認証に失敗しました。');
    }
    setPendingAccountId(null);
  };

  return (
    <div className="page-container">
      {show2faConfirm && (
        <ConfirmModal
          title="二段階認証は完了しましたか？"
          message="Riot Clientで二段階認証コードを入力してから選択してください。"
          options={[
            { label: 'できました', value: 'done', style: 'primary' },
            { label: 'できませんでした', value: 'failed', style: 'secondary' },
          ]}
          onSelect={handle2faConfirm}
          closable={false}
        />
      )}
      {showLoginConfirm && (
        <ConfirmModal
          title="Riotアカウントにログインできましたか？"
          message="Riot Clientの状態を確認して選択してください。"
          options={[
            { label: 'できました', value: 'success', style: 'primary' },
            { label: 'できませんでした', value: 'failed', style: 'secondary' },
            { label: '二段階認証があります', value: '2fa', style: 'warning' },
          ]}
          onSelect={handleLoginConfirm}
          closable={false}
        />
      )}
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-content">
            <div className="spinner-large"></div>
            <div className="loading-text">Adding account...</div>
            <div className="loading-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
          </div>
        </div>
      )}
      <div className="glass-card">
        <h2 className="page-title">Add Account</h2>
        <form className="add-account-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Account Name</label>
            <input
              ref={nameInputRef}
              type="text"
              className="form-input"
              placeholder="Enter account name"
              value={accountname}
              onChange={(e) => setAccountname(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Account Tag</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter tag (e.g., #1234)"
              value={accounttag}
              onChange={(e) => setAccounttag(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Riot ID (ログイン用)</label>
            <input
              type="text"
              className="form-input"
              placeholder="Enter Riot ID"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Password (ログイン用)</label>
            <input
              type="password"
              className="form-input"
              placeholder="Enter password"
              value={accountPassword}
              onChange={(e) => setAccountPassword(e.target.value)}
              disabled={isLoading}
            />
          </div>
          <button type="submit" className="submit-button" disabled={isLoading}>
            {isLoading ? 'Adding...' : 'Add Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default AddAccount;
