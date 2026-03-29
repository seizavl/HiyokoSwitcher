import React, { useState } from 'react';
import './Test.css';

const API = 'http://127.0.0.1:8000';

const Test: React.FC = () => {
  const [helloResult, setHelloResult] = useState<string | null>(null);
  const [echoInput, setEchoInput] = useState('');
  const [echoResult, setEchoResult] = useState<string | null>(null);
  const [mouseStatus, setMouseStatus] = useState<string | null>(null);
  const [serverStatus, setServerStatus] = useState<'ok' | 'error' | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const callHello = async () => {
    setLoading('hello');
    setError(null);
    try {
      const res = await fetch(`${API}/api/test/hello`);
      const data = await res.json();
      setHelloResult(data.message);
    } catch (e: any) {
      setError('接続失敗: FastAPI が起動していますか？');
    } finally {
      setLoading(null);
    }
  };

  const checkServer = async () => {
    setLoading('server');
    setError(null);
    try {
      const res = await fetch(`${API}/api/health`);
      const data = await res.json();
      setServerStatus(data.status === 'ok' ? 'ok' : 'error');
    } catch {
      setServerStatus('error');
      setError('FastAPI に接続できません。python backend/main.py を実行してください。');
    } finally {
      setLoading(null);
    }
  };

  const callMoveMouse = async () => {
    setLoading('mouse');
    setMouseStatus(null);
    setError(null);
    try {
      const res = await fetch(`${API}/api/test/move-mouse`, { method: 'POST' });
      const data = await res.json();
      setMouseStatus(data.status === 'started' ? 'マウス移動を開始しました' : 'エラー');
    } catch (e: any) {
      setError('接続失敗: FastAPI が起動していますか？');
    } finally {
      setLoading(null);
    }
  };

  const callEcho = async () => {
    if (!echoInput.trim()) return;
    setLoading('echo');
    setError(null);
    try {
      const res = await fetch(`${API}/api/test/echo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: echoInput }),
      });
      const data = await res.json();
      setEchoResult(data.result);
    } catch (e: any) {
      setError('接続失敗: FastAPI が起動していますか？');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="page-container">
      <div className="glass-card">
        <h2 className="page-title">Test</h2>

        {error && <div className="error-banner">{error}</div>}

        {/* サーバー状態確認 */}
        <div className="test-block">
          <div className="test-block-label">FastAPI サーバー状態</div>
          <div className="test-block-row">
            <button
              className="test-button"
              onClick={checkServer}
              disabled={loading === 'server'}
            >
              {loading === 'server' ? <span className="btn-spinner" /> : null}
              接続確認
            </button>
            {serverStatus === 'ok' && <span className="result-text ok">● 起動中</span>}
            {serverStatus === 'error' && <span className="result-text err">● 停止中</span>}
          </div>
        </div>

        {/* マウス移動テスト */}
        <div className="test-block">
          <div className="test-block-label">POST /api/test/move-mouse</div>
          <div className="test-block-row">
            <button
              className="test-button"
              onClick={callMoveMouse}
              disabled={loading === 'mouse'}
            >
              {loading === 'mouse' ? <span className="btn-spinner" /> : null}
              マウスを動かす
            </button>
            {mouseStatus && <span className="result-text ok">{mouseStatus}</span>}
          </div>
        </div>

        {/* Hello テスト */}
        <div className="test-block">
          <div className="test-block-label">GET /api/test/hello</div>
          <div className="test-block-row">
            <button
              className="test-button"
              onClick={callHello}
              disabled={loading === 'hello'}
            >
              {loading === 'hello' ? <span className="btn-spinner" /> : null}
              実行
            </button>
            {helloResult !== null && (
              <span className="result-text ok">{helloResult}</span>
            )}
          </div>
        </div>

        {/* Echo テスト */}
        <div className="test-block">
          <div className="test-block-label">POST /api/test/echo</div>
          <div className="test-block-row">
            <input
              className="test-input"
              type="text"
              placeholder="テキストを入力..."
              value={echoInput}
              onChange={(e) => setEchoInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && callEcho()}
            />
            <button
              className="test-button"
              onClick={callEcho}
              disabled={loading === 'echo' || !echoInput.trim()}
            >
              {loading === 'echo' ? <span className="btn-spinner" /> : null}
              送信
            </button>
          </div>
          {echoResult !== null && (
            <div className="result-text ok">→ {echoResult}</div>
          )}
        </div>

      </div>
    </div>
  );
};

export default Test;
