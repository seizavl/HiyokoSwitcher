import './App.css';
import { lazy, Suspense } from 'react';
import { useAnimations } from './useAnimations';
import { Tilt } from './Tilt';
import {
  IconShield,
  IconZap,
  IconTrendingUp,
  IconRefresh,
  IconBag,
  IconSearch,
  IconDownload,
  IconGithub,
  IconArrowRight,
} from './Icons';

// three.js を含む 3D シーンは重いので遅延読み込みして初期表示を妨げない。
// モバイルではチャンク自体をダウンロードさせない（バッテリー・通信量対策）。
const HeroScene = lazy(() => import('./three/HeroScene'));
const show3D = window.matchMedia('(min-width: 769px)').matches;

const REPO = 'seizavl/HiyokoSwitcher';
const LATEST_RELEASE_URL = `https://github.com/${REPO}/releases/latest`;
const REPO_URL = `https://github.com/${REPO}`;
const BASE = '/HiyokoSwitcher';

const FEATURES = [
  { icon: IconShield, title: 'アカウント管理', desc: ['複数の Valorant アカウントを', 'AES-256 で暗号化して保存・管理'] },
  { icon: IconZap, title: '自動ログイン', desc: ['ID・パスワードの入力は', 'キーボードマクロが代行'] },
  { icon: IconTrendingUp, title: 'ランク確認', desc: ['アカウントごとのランク・レベルを', 'まとめて表示'] },
  { icon: IconRefresh, title: '一括更新', desc: ['セッションとランク情報を', '複数アカウントまとめて更新'] },
  { icon: IconBag, title: 'ショップ閲覧', desc: ['デイリーショップと', 'ナイトマーケットを起動せずに確認'] },
  { icon: IconSearch, title: 'プレイヤー検索', desc: ['任意のプレイヤーの戦績・MMR を', 'その場で検索'] },
];

const SHOWCASE = [
  {
    tag: 'アカウント一覧',
    title: '登録したアカウントがひと目でわかる',
    desc: [
      '保存したアカウントは',
      'ランク・レベル・アイコン付きで一覧表示。',
      '切り替えたいアカウントを選ぶだけで、',
      'あとはアプリがやってくれます。',
    ],
    img: 'https://github.com/user-attachments/assets/71ba7aac-b635-46d7-a78c-12b3aa136834',
  },
  {
    tag: '自動ログイン',
    title: 'ログイン操作はマクロにおまかせ',
    desc: [
      'Riot Client のセッションを',
      'ジャンクション方式で管理し、',
      'ID とパスワードの入力は',
      'キーボードマクロが代行。',
      '切り替えのたびに手打ちする必要はありません。',
    ],
    img: 'https://github.com/user-attachments/assets/5f1f72a7-b4a1-4ba1-8483-fc4b9a013798',
  },
  {
    tag: 'ランク更新',
    title: 'ランクも戦績も自動で最新に',
    desc: [
      'Henrik Dev API と連携して、',
      'ランク・レベル・戦績を自動取得。',
      '複数アカウントの一括更新にも対応しています。',
    ],
    img: 'https://github.com/user-attachments/assets/a6211a56-bab3-4a26-8714-addaa6391113',
  },
];

const Phrases = ({ items }: { items: string[] }) => (
  <>
    {items.map((p) => (
      <span className="phrase" key={p}>
        {p}
      </span>
    ))}
  </>
);

function App() {
  useAnimations();

  return (
    <div className="page">
      <div className="bg-mesh" aria-hidden="true" />

      <nav className="nav">
        <a className="nav-brand" href="#top">
          <img src={`${BASE}/hiyokologo.png`} alt="" className="nav-logo" />
          <span>HiyokoSwitcher</span>
        </a>
        <ul className="nav-links">
          <li><a href="#features">機能</a></li>
          <li><a href="#showcase">プレビュー</a></li>
          <li><a href={REPO_URL}>GitHub</a></li>
        </ul>
        <a className="btn btn-primary btn-sm" href={LATEST_RELEASE_URL}>
          <IconDownload />
          ダウンロード
        </a>
      </nav>

      <header className="hero" id="top">
        {show3D && (
          <Suspense fallback={null}>
            <HeroScene />
          </Suspense>
        )}
        <h1 className="hero-title">
          <span className="line-mask">
            <span className="line">Valorant のアカウント切り替えを、</span>
          </span>
          <span className="line-mask">
            <span className="line accent-text">ワンクリックに。</span>
          </span>
        </h1>
        <p className="hero-subtitle">
          <Phrases
            items={[
              'ID・パスワードの打ち直しは、もう不要。',
              '暗号化して保存したアカウントに',
              'ボタンひとつでログインできる、',
              'Windows 向けのデスクトップアプリです。',
            ]}
          />
        </p>
        <div className="hero-actions">
          <a className="btn btn-primary btn-lg" href={LATEST_RELEASE_URL}>
            <IconDownload />
            無料でダウンロード
          </a>
          <a className="btn btn-secondary btn-lg" href={REPO_URL}>
            <IconGithub />
            GitHub で見る
          </a>
        </div>
        <p className="hero-meta">Windows 10 / 11 (x64)・無料・オープンソース</p>

        <div className="hero-mockup">
          <div className="mockup-glow" aria-hidden="true" />
          <Tilt max={6}>
            <div className="window">
              <img
                className="window-img"
                src="https://github.com/user-attachments/assets/71ba7aac-b635-46d7-a78c-12b3aa136834"
                alt="HiyokoSwitcher アカウント管理画面"
              />
            </div>
          </Tilt>
        </div>
      </header>

      <main>
        <section className="section" id="features">
          <div className="section-head">
            <div className="section-label">
              <span className="sec-num">01</span>機能
            </div>
            <h2 className="section-title">できること</h2>
            <p className="section-desc">
              <Phrases
                items={[
                  'アカウントの保存からショップの確認まで、',
                  '日常的に使う機能をまとめています。',
                ]}
              />
            </p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f) => (
              <div className="feature-card" key={f.title}>
                <div className="feature-head">
                  <f.icon className="feature-ic" />
                  <h3 className="feature-title">{f.title}</h3>
                </div>
                <p className="feature-desc">
                  <Phrases items={f.desc} />
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="section showcase" id="showcase">
          <div className="section-head">
            <div className="section-label">
              <span className="sec-num">02</span>プレビュー
            </div>
            <h2 className="section-title">画面はこんな感じ</h2>
          </div>
          <div className="showcase-list">
            {SHOWCASE.map((s, i) => (
              <div className={`showcase-row ${i % 2 === 1 ? 'reverse' : ''}`} key={s.tag}>
                <div className="showcase-text">
                  <span className="showcase-tag">{s.tag}</span>
                  <h3 className="showcase-title">{s.title}</h3>
                  <p className="showcase-desc">
                    <Phrases items={s.desc} />
                  </p>
                </div>
                <div className="showcase-media">
                  <Tilt max={9}>
                    <div className="window window-sm">
                      <img className="window-img" src={s.img} alt={s.title} loading="lazy" />
                    </div>
                  </Tilt>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="section cta-section">
          <div className="cta-panel">
            <div className="cta-glow" aria-hidden="true" />
            <h2 className="cta-title">手打ちログインは、今日でおしまい。</h2>
            <p className="cta-desc">
              <Phrases
                items={[
                  'Windows 10 / 11 (x64) 対応・無料・オープンソース。',
                  'ランク表示には Henrik Dev API キー（無料）を使います。',
                ]}
              />
              <a href="https://docs.henrikdev.xyz/" target="_blank" rel="noreferrer">
                取得はこちら
              </a>
            </p>
            <div className="cta-actions">
              <a className="btn btn-primary btn-lg" href={LATEST_RELEASE_URL}>
                <IconDownload />
                無料でダウンロード
              </a>
              <a className="link-arrow" href={REPO_URL}>
                ソースコードを見る <IconArrowRight />
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="footer-brand">
          <img src={`${BASE}/hiyokologo.png`} alt="" className="footer-logo" />
          <span>HiyokoSwitcher</span>
        </div>
        <a className="footer-repo" href={REPO_URL}>
          <IconGithub />
          {REPO}
        </a>
      </footer>
    </div>
  );
}

export default App;
