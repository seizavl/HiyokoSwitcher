import './App.css';

const REPO = 'seizavl/HiyokoSwitcher';
const LATEST_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;
const REPO_URL = `https://github.com/${REPO}`;

const FEATURES = [
  { title: 'アカウント管理', desc: '複数の Valorant アカウントを暗号化して保存・管理' },
  { title: '自動ログイン', desc: 'Riot Client へのキーボードマクロによる自動ログイン / アカウント切り替え' },
  { title: 'ランク確認', desc: 'アカウントごとのランク・レベル・プレイヤーアイコンをまとめて表示' },
  { title: '一括更新', desc: 'セッション・ランクを複数アカウントまとめてバッチ更新' },
  { title: 'ショップ閲覧', desc: 'デイリーショップ・ナイトマーケットの確認' },
  { title: 'プレイヤー検索', desc: '戦績・MMR の検索' },
];

const SCREENSHOTS = [
  { src: 'https://github.com/user-attachments/assets/0b4a7674-5048-4b01-9648-1a47e42321e7', alt: 'アカウント管理画面' },
  { src: 'https://github.com/user-attachments/assets/104833ab-ca0e-4a68-8252-d78a6ca481ce', alt: 'アカウント詳細画面' },
  { src: 'https://github.com/user-attachments/assets/a6211a56-bab3-4a26-8714-addaa6391113', alt: 'ランク・データ表示画面' },
];

function App() {
  return (
    <div className="page">
      <header className="hero">
        <img className="hero-logo" src="/HiyokoSwitcher/hiyokologo.png" alt="HiyokoSwitcher" />
        <h1 className="hero-title">HiyokoSwitcher</h1>
        <p className="hero-subtitle">
          複数の Valorant アカウントをワンクリックで安全に切り替える Windows デスクトップアプリ
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary" href={LATEST_RELEASE_URL}>
            ダウンロード
          </a>
          <a className="btn btn-secondary" href={REPO_URL}>
            GitHub
          </a>
        </div>
      </header>

      <main>
        <section className="section">
          <h2 className="section-title">機能</h2>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.title}>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section">
          <h2 className="section-title">スクリーンショット</h2>
          <div className="screenshot-grid">
            {SCREENSHOTS.map((s) => (
              <img className="screenshot" key={s.src} src={s.src} alt={s.alt} loading="lazy" />
            ))}
          </div>
        </section>

        <section className="section requirements">
          <h2 className="section-title">必要なもの</h2>
          <table className="req-table">
            <tbody>
              <tr>
                <th>OS</th>
                <td>Windows 10 / 11 (x64)</td>
              </tr>
              <tr>
                <th>Henrik Dev API キー</th>
                <td>
                  <a href="https://docs.henrikdev.xyz/" target="_blank" rel="noreferrer">
                    取得はこちら
                  </a>
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>

      <footer className="footer">
        <a href={REPO_URL}>{REPO}</a>
      </footer>
    </div>
  );
}

export default App;
