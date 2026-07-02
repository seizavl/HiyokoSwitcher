import './App.css';
import { lazy, Suspense } from 'react';
import { useReveal } from './useReveal';
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
  { icon: IconShield, title: 'アカウント管理', desc: '複数の Valorant アカウントを AES-256 で暗号化して安全に保存・管理' },
  { icon: IconZap, title: '自動ログイン', desc: 'Riot Client へのキーボードマクロでワンクリック自動ログイン・切り替え' },
  { icon: IconTrendingUp, title: 'ランク確認', desc: 'アカウントごとのランク・レベル・プレイヤーアイコンをまとめて表示' },
  { icon: IconRefresh, title: '一括更新', desc: 'セッション・ランク情報を複数アカウントまとめてバッチ更新' },
  { icon: IconBag, title: 'ショップ閲覧', desc: 'デイリーショップ・ナイトマーケットのラインナップを一目で確認' },
  { icon: IconSearch, title: 'プレイヤー検索', desc: '任意のプレイヤーの戦績・MMR をその場で検索' },
];

const SHOWCASE = [
  {
    tag: 'ACCOUNT',
    title: 'すべてのアカウントを、ひとつの画面に。',
    desc: '登録した Valorant アカウントをカード一覧で管理。ランク・レベル・アイコンが並び、切り替えたいアカウントをワンクリックで選ぶだけ。',
    img: 'https://github.com/user-attachments/assets/0b4a7674-5048-4b01-9648-1a47e42321e7',
  },
  {
    tag: 'DETAIL',
    title: '切り替えも、ログインも、自動で。',
    desc: 'Riot Client のセッションをジャンクション方式で管理し、キーボードマクロが自動でログイン操作を代行。待ち時間はほぼゼロに。',
    img: 'https://github.com/user-attachments/assets/104833ab-ca0e-4a68-8252-d78a6ca481ce',
  },
  {
    tag: 'RANK',
    title: 'データはいつも最新。',
    desc: 'Henrik Dev API と連携し、ランク・戦績・MMR を自動取得。複数アカウントをまとめてバッチ更新できます。',
    img: 'https://github.com/user-attachments/assets/a6211a56-bab3-4a26-8714-addaa6391113',
  },
];

function App() {
  useReveal();

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
        <div className="hero-badge reveal">
          <span className="dot" />
          Windows 10 / 11 対応 &middot; 無料
        </div>
        <h1 className="hero-title reveal">
          複数の Valorant アカウントを、
          <br />
          <span className="gradient-text">もっとスマートに。</span>
        </h1>
        <p className="hero-subtitle reveal">
          アカウントの管理・ログイン・切り替えを自動化する Windows デスクトップアプリ。
          <br />
          暗号化保存で安全に、ワンクリックでスムーズに。
        </p>
        <div className="hero-actions reveal">
          <a className="btn btn-primary btn-lg" href={LATEST_RELEASE_URL}>
            <IconDownload />
            無料でダウンロード
          </a>
          <a className="btn btn-secondary btn-lg" href={REPO_URL}>
            <IconGithub />
            GitHub で見る
          </a>
        </div>

        <div className="hero-mockup reveal">
          <div className="mockup-glow" aria-hidden="true" />
          <Tilt max={6}>
            <div className="window">
              <img
                className="window-img"
                src="https://github.com/user-attachments/assets/0b4a7674-5048-4b01-9648-1a47e42321e7"
                alt="HiyokoSwitcher アカウント管理画面"
              />
            </div>
          </Tilt>
        </div>
      </header>

      <main>
        <section className="section" id="features">
          <div className="section-head reveal">
            <span className="eyebrow">FEATURES</span>
            <h2 className="section-title">必要な機能を、ひとつのアプリに。</h2>
            <p className="section-desc">アカウント管理からショップ確認まで、Valorant を遊ぶ上で欲しい機能を揃えました。</p>
          </div>
          <div className="feature-grid">
            {FEATURES.map((f, i) => (
              <div className="feature-card reveal" key={f.title} style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
                <div className="feature-icon">
                  <f.icon />
                </div>
                <h3 className="feature-title">{f.title}</h3>
                <p className="feature-desc">{f.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="section showcase" id="showcase">
          <div className="section-head reveal">
            <span className="eyebrow">PREVIEW</span>
            <h2 className="section-title">実際の画面を見てみる</h2>
          </div>
          <div className="showcase-list">
            {SHOWCASE.map((s, i) => (
              <div className={`showcase-row reveal ${i % 2 === 1 ? 'reverse' : ''}`} key={s.tag}>
                <div className="showcase-text">
                  <span className="showcase-tag">{s.tag}</span>
                  <h3 className="showcase-title">{s.title}</h3>
                  <p className="showcase-desc">{s.desc}</p>
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

        <section className="section cta-section reveal">
          <div className="cta-panel">
            <div className="cta-glow" aria-hidden="true" />
            <h2 className="cta-title">今すぐ、快適なアカウント切り替えを。</h2>
            <p className="cta-desc">
              Windows 10 / 11 (x64) で今すぐ利用できます。Henrik Dev API キーの取得は
              <a href="https://docs.henrikdev.xyz/" target="_blank" rel="noreferrer"> こちら</a>。
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
