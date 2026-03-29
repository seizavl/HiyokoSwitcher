import React, { useState, useRef } from 'react';
import './Search.css';

type Tab = 'general' | 'mmr' | 'history';

interface AccountData {
  account_level: number;
  card: { id: string; large: string; small: string; wide: string };
  last_update: string;
  name: string;
  puuid: string;
  region: string;
  tag: string;
}

interface StoredMatch {
  meta: {
    id: string;
    map: { id: string; name: string };
    mode: string;
    region: string;
    season: { id: string; short: string };
    started_at: string;
  };
  stats: {
    assists: number;
    character: { id: string; name: string };
    damage: { made: number; received: number };
    deaths: number;
    kills: number;
    level: number;
    name: string;
    puuid: string;
    score: number;
    shots: { body: number; head: number; leg: number };
    tag: string;
    team: string;
    tier: number;
    rr_change?: number;
  };
  teams: { blue: number; red: number };
}

type ApiField = string | number | { rank?: string; name?: string; updated_at?: string; id?: number } | null | undefined;

function safeStr(val: ApiField): string {
  if (val === null || val === undefined) return '';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return String(val);
  return val.name ?? val.rank ?? '';
}

function safeNum(val: ApiField): number {
  if (typeof val === 'number') return val;
  return 0;
}

function safeTierId(tier: any): number | undefined {
  if (!tier) return undefined;
  return typeof tier.id === 'number' ? tier.id : undefined;
}

interface MmrCurrent {
  elo: number;
  games_needed_for_rating: number;
  last_change: ApiField;
  leaderboard_placement: ApiField;
  rank_protection_shields: number;
  rr: ApiField;
  tier: any;
}

interface MmrSeason {
  act_wins: any[];
  end_rr: ApiField;
  end_tier: any;
  games: ApiField;
  leaderboard_placement: number | null;
  ranking_schema: string;
  season: { id: string; short: ApiField };
  wins: ApiField;
}

type SeasonShort = string | { rank: string; updated_at: string };
function seasonLabel(short: ApiField, id?: string): string {
  if (!short) return id ?? '';
  if (typeof short === 'string') return short;
  if (typeof short === 'number') return String(short);
  return short.rank ?? short.name ?? id ?? '';
}

interface MmrData {
  current: MmrCurrent;
  peak: { tier: { id: number; name: string }; season: { id: string; short: SeasonShort } } | null;
  seasonal: MmrSeason[];
}

interface MatchDetailPlayer {
  name: string;
  tag: string;
  puuid: string;
  team: string;
  character: string;
  currenttier: number;
  currenttier_patched: string;
  level: number;
  damage_made: number;
  damage_received: number;
  ability_casts: { c_cast: number; e_cast: number; q_cast: number; x_cast: number };
  economy: { loadout_value: { average: number; overall: number }; spent: { average: number; overall: number } };
  stats: {
    kills: number;
    deaths: number;
    assists: number;
    score: number;
    headshots: number;
    bodyshots: number;
    legshots: number;
  };
  assets: {
    agent: { small: string; full: string; killfeed: string };
    card: { small: string };
  };
}

interface MatchKill {
  round: number;
  kill_time_in_round: number;
  killer_puuid: string;
  victim_puuid: string;
}

interface MatchDetail {
  metadata: {
    map: string;
    mode: string;
    game_start_patched: string;
    rounds_played: number;
    matchid: string;
    game_length: number;
    queue: string;
  };
  players: {
    all_players: MatchDetailPlayer[];
  };
  teams: {
    blue: { has_won: boolean; rounds_won: number; rounds_lost: number } | null;
    red: { has_won: boolean; rounds_won: number; rounds_lost: number } | null;
  };
  kills: MatchKill[];
}

interface FavoriteEntry {
  puuid: string;
  name: string;
  tag: string;
  region: string;
  cardSmall?: string;
  tierName?: string;
  tierId?: number;
  rr?: number;
  memo?: string;
}

const REGIONS = ['ap', 'na', 'eu', 'kr', 'latam', 'br'];
const FAVORITES_KEY = 'search_favorites_v2';

let tierIconCache: Record<number, string> = {};
let tierIconByNameCache: Record<string, string> = {};

async function loadTierIcons(): Promise<{ byId: Record<number, string>; byName: Record<string, string> }> {
  if (Object.keys(tierIconCache).length > 0) return { byId: tierIconCache, byName: tierIconByNameCache };
  const res = await fetch('https://valorant-api.com/v1/competitivetiers');
  const data = await res.json();
  const latest = data.data[data.data.length - 1];
  const byId: Record<number, string> = {};
  const byName: Record<string, string> = {};
  for (const tier of latest.tiers) {
    if (tier.smallIcon) {
      byId[tier.tier] = tier.smallIcon;
      const name = (tier.tierName || tier.displayName || '').toLowerCase();
      if (name) byName[name] = tier.smallIcon;
    }
  }
  tierIconCache = byId;
  tierIconByNameCache = byName;
  return { byId, byName };
}

function loadFavorites(): FavoriteEntry[] {
  try { return JSON.parse(localStorage.getItem(FAVORITES_KEY) ?? '[]'); } catch { return []; }
}

function saveFavorites(list: FavoriteEntry[]) {
  localStorage.setItem(FAVORITES_KEY, JSON.stringify(list));
}

const Search: React.FC = () => {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('ap');
  const tierIconsRef = useRef<Record<number, string>>({});
  const [searched, setSearched] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [history, setHistory] = useState<StoredMatch[]>([]);
  const [mmr, setMmr] = useState<MmrData | null>(null);
  const [tierIcons, setTierIcons] = useState<Record<number, string>>({});
  const [tierIconsByName, setTierIconsByName] = useState<Record<string, string>>({});
  const [favorites, setFavorites] = useState<FavoriteEntry[]>(loadFavorites);
  const [showFavPanel, setShowFavPanel] = useState(false);
  const [pendingEntry, setPendingEntry] = useState<FavoriteEntry | null>(null);
  const [memoInput, setMemoInput] = useState('');
  const [editingPuuid, setEditingPuuid] = useState<string | null>(null);
  const [editMemoInput, setEditMemoInput] = useState('');
  const [historyModeFilter, setHistoryModeFilter] = useState<string>('all');
  const [historyPage, setHistoryPage] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const historySearchRef = useRef<{ name: string; tag: string; region: string } | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<StoredMatch | null>(null);
  const [matchDetail, setMatchDetail] = useState<MatchDetail | null>(null);
  const [matchDetailLoading, setMatchDetailLoading] = useState(false);
  const [matchDetailError, setMatchDetailError] = useState<string | null>(null);

  const isFav = accountData ? favorites.some(f => f.puuid === accountData.puuid) : false;

  const handleClickStar = () => {
    if (!accountData) return;
    if (isFav) {
      const next = favorites.filter(f => f.puuid !== accountData.puuid);
      setFavorites(next);
      saveFavorites(next);
    } else {
      setPendingEntry({
        puuid: accountData.puuid,
        name: accountData.name,
        tag: accountData.tag,
        region: accountData.region,
        cardSmall: accountData.card?.small,
        tierName: safeStr(mmr?.current.tier?.name),
        tierId: safeTierId(mmr?.current.tier),
        rr: safeNum(mmr?.current.rr),
      });
      setMemoInput('');
    }
  };

  const confirmAddFavorite = () => {
    if (!pendingEntry) return;
    const next = [...favorites, { ...pendingEntry, memo: memoInput.trim() || undefined }];
    setFavorites(next);
    saveFavorites(next);
    setPendingEntry(null);
    setMemoInput('');
  };

  const removeFavorite = (puuid: string) => {
    const next = favorites.filter(f => f.puuid !== puuid);
    setFavorites(next);
    saveFavorites(next);
  };

  const openMemoEdit = (fav: FavoriteEntry) => {
    setEditingPuuid(fav.puuid);
    setEditMemoInput(fav.memo ?? '');
  };

  const saveMemoEdit = () => {
    if (!editingPuuid) return;
    const next = favorites.map(f => f.puuid === editingPuuid ? { ...f, memo: editMemoInput.trim() || undefined } : f);
    setFavorites(next);
    saveFavorites(next);
    setEditingPuuid(null);
  };

  const openFavPanel = async () => {
    setShowFavPanel(true);
    if (favorites.length === 0) return;
    try {
      const settings = await window.electron.settings.get();
      const apiKey: string = settings.apiKey ?? '';
      const headers: Record<string, string> = apiKey ? { Authorization: apiKey } : {};
      const { byId: icons, byName: iconsByName } = await loadTierIcons();
      setTierIconsByName(iconsByName);

      const updated = await Promise.all(favorites.map(async fav => {
        try {
          const [accRes, mmrRes] = await Promise.all([
            fetch(`https://api.henrikdev.xyz/valorant/v1/by-puuid/account/${fav.puuid}`, { headers }),
            fetch(`https://api.henrikdev.xyz/valorant/v3/by-puuid/mmr/${fav.region}/pc/${fav.puuid}`, { headers }),
          ]);
          const accData = accRes.ok ? (await accRes.json()).data : null;
          const mmrData = mmrRes.ok ? (await mmrRes.json()).data : null;
          return {
            ...fav,
            name: accData?.name ?? fav.name,
            tag: accData?.tag ?? fav.tag,
            cardSmall: accData?.card?.small ?? fav.cardSmall,
            tierName: mmrData?.current?.tier?.name ?? fav.tierName,
            tierId: mmrData?.current?.tier?.id ?? fav.tierId,
            rr: mmrData?.current?.rr ?? fav.rr,
          } as FavoriteEntry;
        } catch { return fav; }
      }));

      setTierIcons(icons);
      setFavorites(updated);
      saveFavorites(updated);
    } catch {}
  };

  const searchByFavorite = (fav: FavoriteEntry) => {
    setQuery(`${fav.name}#${fav.tag}`);
    setRegion(fav.region);
    setSearched(true);
    setLoading(true);
    setError(null);
    setAccountData(null);
    setHistory([]);
    setMmr(null);
    setActiveTab('general');
    setShowFavPanel(false);

    (async () => {
      try {
        const settings = await window.electron.settings.get();
        const apiKey: string = settings.apiKey ?? '';
        const headers: Record<string, string> = apiKey ? { Authorization: apiKey } : {};

        const accountRes = await fetch(
          `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(fav.name)}/${encodeURIComponent(fav.tag)}`,
          { headers }
        );
        if (!accountRes.ok) throw new Error(`アカウント取得失敗 (${accountRes.status})`);
        const accountJson = await accountRes.json();
        const puuid: string = accountJson.data?.puuid;
        if (!puuid) throw new Error('PUUIDが取得できませんでした');
        setAccountData(accountJson.data ?? null);

        const { byId: icons, byName: iconsByName } = await loadTierIcons();
        setTierIcons(icons);
        setTierIconsByName(iconsByName);
        tierIconsRef.current = icons;

        historySearchRef.current = { name: fav.name, tag: fav.tag, region: fav.region };
        setHistoryPage(0);
        const [histRes, mmrRes] = await Promise.all([
          fetch(`https://api.henrikdev.xyz/valorant/v1/stored-matches/${fav.region}/${encodeURIComponent(fav.name)}/${encodeURIComponent(fav.tag)}`, { headers }),
          fetch(`https://api.henrikdev.xyz/valorant/v3/by-puuid/mmr/${fav.region}/pc/${puuid}`, { headers }),
        ]);
        const [histData, mmrData] = await Promise.all([histRes.json(), mmrRes.json()]);
        const histList: StoredMatch[] = histData.data ?? [];
        setHistory(histList);
        setHistoryHasMore(histList.length >= 10);
        setMmr(mmrData.data ?? null);
      } catch (e: any) {
        setError(e?.message ?? '取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  };

  const loadMoreHistory = async () => {
    if (!historySearchRef.current || loadingMore) return;
    const { name, tag, region: r } = historySearchRef.current;
    const nextPage = historyPage + 1;
    setLoadingMore(true);
    try {
      const settings = await window.electron.settings.get();
      const apiKey: string = settings.apiKey ?? '';
      const headers: Record<string, string> = apiKey ? { Authorization: apiKey } : {};
      const res = await fetch(
        `https://api.henrikdev.xyz/valorant/v1/stored-matches/${r}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?page=${nextPage}`,
        { headers }
      );
      const json = await res.json();
      const more: StoredMatch[] = json.data ?? [];
      setHistory(prev => [...prev, ...more]);
      setHistoryPage(nextPage);
      setHistoryHasMore(more.length >= 10);
    } catch {} finally {
      setLoadingMore(false);
    }
  };

  const openMatchDetail = async (entry: StoredMatch) => {
    setSelectedMatch(entry);
    setMatchDetail(null);
    setMatchDetailError(null);
    setMatchDetailLoading(true);
    try {
      const settings = await window.electron.settings.get();
      const apiKey: string = settings.apiKey ?? '';
      const headers: Record<string, string> = apiKey ? { Authorization: apiKey } : {};
      const res = await fetch(`https://api.henrikdev.xyz/valorant/v2/match/${entry.meta.id}`, { headers });
      if (!res.ok) throw new Error(`取得失敗 (${res.status})`);
      const json = await res.json();
      setMatchDetail(json.data ?? null);
    } catch (e: any) {
      setMatchDetailError(e?.message ?? '取得に失敗しました');
    } finally {
      setMatchDetailLoading(false);
    }
  };

  const closeMatchDetail = () => {
    setSelectedMatch(null);
    setMatchDetail(null);
    setMatchDetailError(null);
  };

  const searchByPlayer = (name: string, tag: string) => {
    closeMatchDetail();
    setQuery(`${name}#${tag}`);
    setSearched(true);
    setLoading(true);
    setError(null);
    setAccountData(null);
    setHistory([]);
    setMmr(null);
    setActiveTab('general');

    (async () => {
      try {
        const settings = await window.electron.settings.get();
        const apiKey: string = settings.apiKey ?? '';
        const headers: Record<string, string> = apiKey ? { Authorization: apiKey } : {};

        const accountRes = await fetch(
          `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
          { headers }
        );
        if (!accountRes.ok) throw new Error(`アカウント取得失敗 (${accountRes.status})`);
        const accountJson = await accountRes.json();
        const puuid: string = accountJson.data?.puuid;
        if (!puuid) throw new Error('PUUIDが取得できませんでした');
        setAccountData(accountJson.data ?? null);

        const { byId: icons, byName: iconsByName } = await loadTierIcons();
        setTierIcons(icons);
        setTierIconsByName(iconsByName);
        tierIconsRef.current = icons;

        historySearchRef.current = { name, tag, region };
        setHistoryPage(0);
        const [histRes, mmrRes] = await Promise.all([
          fetch(`https://api.henrikdev.xyz/valorant/v1/stored-matches/${region}/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`, { headers }),
          fetch(`https://api.henrikdev.xyz/valorant/v3/by-puuid/mmr/${region}/pc/${puuid}`, { headers }),
        ]);
        const [histData, mmrData] = await Promise.all([histRes.json(), mmrRes.json()]);
        const histList: StoredMatch[] = histData.data ?? [];
        setHistory(histList);
        setHistoryHasMore(histList.length >= 10);
        setMmr(mmrData.data ?? null);
      } catch (e: any) {
        setError(e?.message ?? '取得に失敗しました');
      } finally {
        setLoading(false);
      }
    })();
  };

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    const [name, tag] = trimmed.split('#');
    if (!name || !tag) { setError('名前#タグ の形式で入力してください'); setSearched(true); return; }

    setSearched(true);
    setLoading(true);
    setError(null);
    setAccountData(null);
    setHistory([]);
    setMmr(null);

    try {
      const settings = await window.electron.settings.get();
      const apiKey: string = settings.apiKey ?? '';
      const headers: Record<string, string> = apiKey ? { Authorization: apiKey } : {};

      const accountRes = await fetch(
        `https://api.henrikdev.xyz/valorant/v1/account/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`,
        { headers }
      );
      if (!accountRes.ok) throw new Error(`アカウント取得失敗 (${accountRes.status})`);
      const accountJson = await accountRes.json();
      const puuid: string = accountJson.data?.puuid;
      if (!puuid) throw new Error('PUUIDが取得できませんでした');
      setAccountData(accountJson.data ?? null);

      const { byId: icons, byName: iconsByName } = await loadTierIcons();
      setTierIcons(icons);
      setTierIconsByName(iconsByName);
      tierIconsRef.current = icons;

      historySearchRef.current = { name: name.trim(), tag: tag.trim(), region };
      setHistoryPage(0);
      const [histRes, mmrRes] = await Promise.all([
        fetch(`https://api.henrikdev.xyz/valorant/v1/stored-matches/${region}/${encodeURIComponent(name.trim())}/${encodeURIComponent(tag.trim())}`, { headers }),
        fetch(`https://api.henrikdev.xyz/valorant/v3/by-puuid/mmr/${region}/pc/${puuid}`, { headers }),
      ]);
      const [histData, mmrData] = await Promise.all([histRes.json(), mmrRes.json()]);
      const histList: StoredMatch[] = histData.data ?? [];
      setHistory(histList);
      setHistoryHasMore(histList.length >= 10);
      setMmr(mmrData.data ?? null);
    } catch (e: any) {
      setError(e?.message ?? '取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="search-container">
      <div className="search-inner">

        {/* スライダー */}
        <div className="s-slider-wrapper">
          <div className={`s-slider ${showFavPanel ? 's-slider--fav' : ''}`}>

            {/* 左スライド: 検索 */}
            <div className="s-slide">
              <div className="search-title-row">
                <h2 className="search-title">Search</h2>
                <button className="fav-panel-btn" onClick={openFavPanel}>
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  お気に入り
                  {favorites.length > 0 && <span className="fav-panel-count">{favorites.length}</span>}
                </button>
              </div>
              <div className="search-top">
                <div className="search-bar-wrapper">
                  <svg className="search-bar-icon" viewBox="0 0 24 24" fill="none">
                    <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2"/>
                    <path d="M16.5 16.5L21 21" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <input
                    className="search-bar-input"
                    type="text"
                    placeholder="プレイヤー名#タグを入力..."
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                    autoFocus
                  />
                  {query && (
                    <button className="search-bar-clear" onClick={() => { setQuery(''); setSearched(false); setAccountData(null); setHistory([]); setMmr(null); setError(null); }}>
                      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14">
                        <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                      </svg>
                    </button>
                  )}
                </div>
                <select className="search-region" value={region} onChange={e => setRegion(e.target.value)}>
                  {REGIONS.map(r => <option key={r} value={r}>{r.toUpperCase()}</option>)}
                </select>
                <button className="search-btn" onClick={handleSearch} disabled={!query.trim() || loading}>
                  {loading ? <span className="search-spinner" /> : '検索'}
                </button>
              </div>

              {searched ? (
                <div className="search-results">
                  <div className="search-tabs">
                    {(['general', 'mmr', 'history'] as Tab[]).map(tab => (
                      <button key={tab} className={`search-tab ${activeTab === tab ? 'active' : ''}`} onClick={() => setActiveTab(tab)}>
                        {tab === 'general' ? 'General' : tab === 'mmr' ? 'MMR' : 'History'}
                      </button>
                    ))}
                  </div>
                  {activeTab === 'history' && history.length > 0 && (
                    <div className="hist-mode-filter">
                      {['all', ...Array.from(new Set(history.map(e => e.meta.mode)))].map(mode => (
                        <button
                          key={mode}
                          className={`hist-mode-chip ${historyModeFilter === mode ? 'hist-mode-chip--active' : ''}`}
                          onClick={() => setHistoryModeFilter(mode)}
                        >
                          {mode === 'all' ? 'すべて' : mode}
                        </button>
                      ))}
                    </div>
                  )}
                  <div className="search-tab-content">
                    {loading && <div className="search-loading"><span className="search-spinner" /><span>取得中...</span></div>}
                    {error && <div className="search-error">{error}</div>}

                    {!loading && !error && activeTab === 'general' && (
                      accountData ? (
                        <div className="gen-profile">
                          <div className="gen-banner" style={accountData.card?.wide ? { backgroundImage: `url(${accountData.card.wide})` } : {}}>
                            <div className="gen-banner-overlay" />
                            <div className="gen-banner-meta">
                              <span className="gen-level-badge">Lv. {accountData.account_level}</span>
                              <span className="gen-region-badge">{accountData.region?.toUpperCase()}</span>
                              <button className={`gen-fav-btn ${isFav ? 'gen-fav-btn--active' : ''}`} onClick={handleClickStar}>
                                <svg viewBox="0 0 24 24" width="14" height="14" fill={isFav ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                                </svg>
                              </button>
                            </div>
                          </div>
                          <div className="gen-identity">
                            {accountData.card?.small && <img className="gen-avatar" src={accountData.card.small} alt="avatar" />}
                            <div className="gen-name-block">
                              <div className="gen-name">{accountData.name}<span className="gen-tag">#{accountData.tag}</span></div>
                              <div className="gen-last-update">{accountData.last_update}</div>
                            </div>
                          </div>
                          {mmr && (
                            <div className="gen-ranks">
                              <div className="gen-rank-card gen-rank-card--current">
                                <div className="gen-rank-header">現在のランク</div>
                                <div className="gen-rank-body">
                                  {tierIcons[safeTierId(mmr.current.tier)!] && <img className="s-tier-icon gen-rank-icon" src={tierIcons[safeTierId(mmr.current.tier)!]} alt={safeStr(mmr.current.tier?.name)} />}
                                  <div className="gen-rank-info">
                                    <div className="gen-rank-name">{safeStr(mmr.current.tier?.name)}</div>
                                    <div className="gen-rank-rr">{safeNum(mmr.current.rr)} <span className="gen-rr-unit">RR</span></div>
                                  </div>
                                </div>
                              </div>
                              {mmr.peak && (
                                <div className="gen-rank-card gen-rank-card--peak">
                                  <div className="gen-rank-header">ピーク</div>
                                  <div className="gen-rank-body">
                                    {tierIcons[safeTierId(mmr.peak.tier)!] && <img className="s-tier-icon gen-rank-icon" src={tierIcons[safeTierId(mmr.peak.tier)!]} alt={safeStr(mmr.peak.tier?.name)} />}
                                    <div className="gen-rank-info">
                                      <div className="gen-rank-name">{safeStr(mmr.peak.tier?.name)}</div>
                                      {mmr.peak.season && <div className="gen-rank-season">{seasonLabel(mmr.peak.season.short, mmr.peak.season.id)}</div>}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                          <div className="gen-puuid-row">
                            <span className="gen-puuid-label">PUUID</span>
                            <span className="gen-puuid-val">{accountData.puuid}</span>
                          </div>
                        </div>
                      ) : <div className="search-no-result">データが見つかりませんでした</div>
                    )}

                    {!loading && !error && activeTab === 'mmr' && (
                      mmr ? (
                        <>
                          <div className="mmr-current-card">
                            {(() => {
                              const gamesNeeded = safeNum(mmr.current.games_needed_for_rating);
                              const confirmed = gamesNeeded === 0;
                              return (
                                <div className={`mmr-current-left${confirmed ? ' mmr-current-left--confirmed' : ''}`}>
                                  {tierIcons[safeTierId(mmr.current.tier)!] && <img className={`s-tier-icon ${confirmed ? 's-tier-icon--xl' : 's-tier-icon--lg'}`} src={tierIcons[safeTierId(mmr.current.tier)!]} alt={safeStr(mmr.current.tier?.name)} />}
                                  <div className="mmr-current-tier">{safeStr(mmr.current.tier?.name)}</div>
                                  {!confirmed && <div className="mmr-placement">あと {gamesNeeded} 試合でレート確定</div>}
                                </div>
                              );
                            })()}
                            <div className="mmr-current-right">
                              {typeof mmr.current.last_change === 'number' && (
                                <div className="mmr-stat">
                                  <span className="mmr-stat-label">前回変動</span>
                                  <span className={`mmr-stat-value ${mmr.current.last_change > 0 ? 'pos' : mmr.current.last_change < 0 ? 'neg' : 'neu'}`}>
                                    {mmr.current.last_change > 0 ? '+' : ''}{mmr.current.last_change}
                                  </span>
                                </div>
                              )}
                              {typeof mmr.current.leaderboard_placement === 'number' && mmr.current.leaderboard_placement > 0 && (
                                <div className="mmr-stat">
                                  <span className="mmr-stat-label">リーダーボード</span>
                                  <span className="mmr-stat-value">#{mmr.current.leaderboard_placement}</span>
                                </div>
                              )}
                              {mmr.peak && (
                                <div className="mmr-stat">
                                  <span className="mmr-stat-label">ピーク</span>
                                  <span className="mmr-stat-value mmr-peak-val">
                                    {tierIcons[safeTierId(mmr.peak.tier)!] && <img className="s-tier-icon s-tier-icon--sm" src={tierIcons[safeTierId(mmr.peak.tier)!]} alt={safeStr(mmr.peak.tier?.name)} />}
                                    {safeStr(mmr.peak.tier?.name)}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          {mmr.seasonal.length > 0 && (
                            <div className="mmr-seasonal">
                              {[...mmr.seasonal].reverse().map(s => (
                                <div key={s.season.id} className="mmr-season-item">
                                  <div className="mmr-season-name">{seasonLabel(s.season.short, s.season.id)}</div>
                                  <div className="mmr-season-tier">
                                    {(() => { const n = safeStr(s.end_tier?.name); const src = tierIconsByName[n.toLowerCase()] || tierIcons[safeTierId(s.end_tier)!]; return src ? <img className="s-tier-icon s-tier-icon--sm" src={src} alt={n} /> : null; })()}
                                    {safeStr(s.end_tier?.name)}
                                  </div>
                                  <div className="mmr-season-stats">{safeNum(s.games)}試合 {safeNum(s.wins)}勝</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      ) : <div className="search-no-result">データが見つかりませんでした</div>
                    )}

                    {!loading && !error && activeTab === 'history' && (() => {
                      const filtered = historyModeFilter === 'all' ? history : history.filter(e => e.meta.mode === historyModeFilter);
                      if (history.length === 0) return <div className="search-no-result">履歴が見つかりませんでした</div>;
                      return (
                        <>
                          {filtered.length === 0 && <div className="search-no-result">該当するマッチがありません</div>}
                          {filtered.map((entry, i) => {
                            const team = entry.stats.team.toLowerCase();
                            const blueScore = entry.teams.blue;
                            const redScore = entry.teams.red;
                            const myScore = team === 'blue' ? blueScore : redScore;
                            const oppScore = team === 'blue' ? redScore : blueScore;
                            const result = myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
                            return (
                              <div key={entry.meta.id || i} className="hist-item" onClick={() => openMatchDetail(entry)} style={{ cursor: 'pointer' }}>
                                <div className={`hist-result hist-result--${result.toLowerCase()}`}>{result}</div>
                                <div className="hist-rank">
                                  {tierIcons[entry.stats.tier] && <img className="s-tier-icon s-tier-icon--sm" src={tierIcons[entry.stats.tier]} alt="" />}
                                  {entry.stats.rr_change != null && (
                                    <span className={`hist-rr-change ${entry.stats.rr_change > 0 ? 'pos' : entry.stats.rr_change < 0 ? 'neg' : 'neu'}`}>
                                      {entry.stats.rr_change > 0 ? '+' : ''}{entry.stats.rr_change}
                                    </span>
                                  )}
                                </div>
                                <img
                                  className="hist-agent-icon"
                                  src={`https://media.valorant-api.com/agents/${entry.stats.character.id}/displayicon.png`}
                                  alt={entry.stats.character.name}
                                  title={entry.stats.character.name}
                                />
                                <div className="hist-kda">
                                  <span className="hist-k">{entry.stats.kills}</span>
                                  <span className="hist-sep">/</span>
                                  <span className="hist-d">{entry.stats.deaths}</span>
                                  <span className="hist-sep">/</span>
                                  <span className="hist-a">{entry.stats.assists}</span>
                                </div>
                                <div className="hist-score">{entry.stats.score} ACS</div>
                                <div className="hist-map">{entry.meta.map.name}</div>
                                <div className="hist-mode">{entry.meta.mode}</div>
                                <div className="hist-date">{new Date(entry.meta.started_at).toLocaleDateString('ja-JP')}</div>
                              </div>
                            );
                          })}
                          {historyHasMore && historyModeFilter === 'all' && (
                            <button className="hist-load-more" onClick={loadMoreHistory} disabled={loadingMore}>
                              {loadingMore ? <span className="search-spinner" /> : 'もっと見る'}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              ) : (
                <div className="search-empty">
                  <svg viewBox="0 0 24 24" fill="none" width="48" height="48">
                    <circle cx="11" cy="11" r="7" stroke="#3f4448" strokeWidth="1.5"/>
                    <path d="M16.5 16.5L21 21" stroke="#3f4448" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  <p className="search-empty-text">プレイヤーを検索</p>
                  <p className="search-empty-sub">名前#タグ で検索できます</p>
                </div>
              )}
            </div>

            {/* 右スライド: お気に入り */}
            <div className="s-slide">
              <div className="search-title-row">
                <div className="search-title-left">
                  <button className="fav-back-btn" onClick={() => setShowFavPanel(false)}>
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                  </button>
                  <h2 className="search-title">お気に入り</h2>
                </div>
              </div>
              {favorites.length === 0 ? (
                <div className="search-empty">
                  <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#3f4448" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
                  </svg>
                  <p className="search-empty-text">お気に入りはまだありません</p>
                  <p className="search-empty-sub">検索結果の ★ から登録できます</p>
                </div>
              ) : (
                <div className="fav-list-slide">
                  {favorites.map(fav => (
                    <div key={fav.puuid} className="fav-slide-item">
                      <button className="fav-slide-main" onClick={() => searchByFavorite(fav)}>
                        {fav.cardSmall
                          ? <img className="fav-slide-avatar" src={fav.cardSmall} alt="" />
                          : <div className="fav-slide-avatar fav-slide-avatar--empty" />
                        }
                        <div className="fav-slide-info">
                          <div className="fav-slide-name">
                            {fav.name}<span className="fav-slide-tag">#{fav.tag}</span>
                            <span className="fav-slide-region">{fav.region.toUpperCase()}</span>
                          </div>
                          <div className="fav-slide-rank">
                            {tierIcons[fav.tierId ?? -1] && <img className="s-tier-icon s-tier-icon--sm" src={tierIcons[fav.tierId!]} alt="" />}
                            <span>{fav.tierName ?? '—'}</span>
                            {fav.rr != null && <span className="fav-slide-rr">{fav.rr} RR</span>}
                            {fav.memo && <span className="fav-slide-memo">{fav.memo}</span>}
                          </div>
                        </div>
                      </button>
                      <div className="fav-slide-actions">
                        <button className="fav-slide-edit" onClick={() => openMemoEdit(fav)} title="メモを編集">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                        </button>
                        <button className="fav-slide-remove" onClick={() => removeFavorite(fav.puuid)} title="削除">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        </div>

        {/* マッチ詳細パネル */}
        <div className={`match-detail-panel${selectedMatch ? ' match-detail-panel--open' : ''}`}>
          <div className="match-detail-header">
            <button className="match-detail-back" onClick={closeMatchDetail}>
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
            </button>
            <div className="match-detail-title">
              {selectedMatch && <><span>{selectedMatch.meta.map.name}</span><span className="match-detail-mode">{selectedMatch.meta.mode}</span></>}
            </div>
          </div>
          <div className="match-detail-body">
            {matchDetailLoading && <div className="search-loading"><span className="search-spinner" /><span>取得中...</span></div>}
            {matchDetailError && <div className="search-error">{matchDetailError}</div>}
            {matchDetail && !matchDetailLoading && (() => {
              const blue = matchDetail.players.all_players.filter(p => p.team === 'Blue');
              const red = matchDetail.players.all_players.filter(p => p.team === 'Red');
              const blueTeam = matchDetail.teams.blue;
              const redTeam = matchDetail.teams.red;
              const myPuuid = accountData?.puuid;

              // FK/FD calculation: first kill per round = lowest kill_time_in_round
              const fkMap: Record<string, number> = {};
              const fdMap: Record<string, number> = {};
              if (matchDetail.kills?.length) {
                const roundMap: Record<number, MatchKill[]> = {};
                for (const k of matchDetail.kills) {
                  if (!roundMap[k.round]) roundMap[k.round] = [];
                  roundMap[k.round].push(k);
                }
                for (const kills of Object.values(roundMap)) {
                  const first = kills.reduce((a, b) => a.kill_time_in_round <= b.kill_time_in_round ? a : b);
                  fkMap[first.killer_puuid] = (fkMap[first.killer_puuid] ?? 0) + 1;
                  fdMap[first.victim_puuid] = (fdMap[first.victim_puuid] ?? 0) + 1;
                }
              }

              const gameLenMin = matchDetail.metadata.game_length > 0
                ? `${Math.floor(matchDetail.metadata.game_length / 60000)}:${String(Math.floor((matchDetail.metadata.game_length % 60000) / 1000)).padStart(2, '0')}`
                : null;

              const renderTeam = (players: MatchDetailPlayer[], teamName: string, teamData: typeof blueTeam) => (
                <div className="md-team">
                  <div className="md-team-header">
                    <span className={`md-team-label md-team-label--${teamName.toLowerCase()}`}>{teamName === 'Blue' ? 'ブルー' : 'レッド'}</span>
                    {teamData && <span className="md-team-score">{teamData.rounds_won}R</span>}
                  </div>
                  <div className="md-team-rows">
                    <div className="md-row-header">
                      <span className="md-col-rank"></span>
                      <span className="md-col-agent"></span>
                      <span className="md-col-name">Name</span>
                      <span className="md-col-kda">KDA</span>
                      <span className="md-col-acs">ACS</span>
                      <span className="md-col-dmg">DMG</span>
                      <span className="md-col-hs">HS%</span>
                      <span className="md-col-fk">FK</span>
                      <span className="md-col-fd">FD</span>
                    </div>
                    {players.sort((a, b) => b.stats.score - a.stats.score).map(p => {
                      const shots = p.stats.headshots + p.stats.bodyshots + p.stats.legshots;
                      const hs = shots > 0 ? Math.round(p.stats.headshots / shots * 100) : 0;
                      const acs = matchDetail.metadata.rounds_played > 0
                        ? Math.round(p.stats.score / matchDetail.metadata.rounds_played)
                        : 0;
                      const isMe = p.puuid === myPuuid;
                      const fk = fkMap[p.puuid] ?? 0;
                      const fd = fdMap[p.puuid] ?? 0;
                      return (
                        <div key={p.puuid} className={`md-player-row${isMe ? ' md-player-row--me' : ''}`} onClick={() => searchByPlayer(p.name, p.tag)} style={{ cursor: 'pointer' }}>
                          <span className="md-col-rank">
                            {tierIcons[p.currenttier] && <img className="s-tier-icon s-tier-icon--sm" src={tierIcons[p.currenttier]} alt={p.currenttier_patched} title={p.currenttier_patched} />}
                          </span>
                          <img className="md-col-agent" src={p.assets.agent.small} alt={p.character} title={p.character} />
                          <span className="md-col-name">
                            {p.name}<span className="md-tag">#{p.tag}</span>
                          </span>
                          <span className="md-col-kda">{p.stats.kills}/{p.stats.deaths}/{p.stats.assists}</span>
                          <span className="md-col-acs">{acs}</span>
                          <span className="md-col-dmg">{p.damage_made ?? 0}</span>
                          <span className="md-col-hs">{hs}%</span>
                          <span className={`md-col-fk${fk > 0 ? ' md-fk--pos' : ''}`}>{fk}</span>
                          <span className={`md-col-fd${fd > 0 ? ' md-fd--pos' : ''}`}>{fd}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );

              return (
                <>
                  <div className="md-meta-bar">
                    <span className="md-meta-item">{matchDetail.metadata.game_start_patched}</span>
                    {gameLenMin && <span className="md-meta-item">{gameLenMin}</span>}
                    {matchDetail.metadata.queue && <span className="md-meta-item md-meta-queue">{matchDetail.metadata.queue}</span>}
                    <span className="md-meta-item">{blueTeam?.rounds_won ?? 0} - {redTeam?.rounds_won ?? 0}</span>
                  </div>
                  <div className="md-teams">
                    {renderTeam(blue, 'Blue', blueTeam)}
                    {renderTeam(red, 'Red', redTeam)}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* お気に入り追加モーダル */}
        {pendingEntry && (
          <div className="memo-dialog-overlay" onClick={() => setPendingEntry(null)}>
            <div className="memo-dialog" onClick={e => e.stopPropagation()}>
              <div className="memo-dialog-title">お気に入りに追加</div>
              <div className="memo-dialog-player">
                {pendingEntry.cardSmall && <img className="memo-dialog-avatar" src={pendingEntry.cardSmall} alt="" />}
                <div>
                  <div className="memo-dialog-player-name">{pendingEntry.name}<span className="memo-dialog-player-tag">#{pendingEntry.tag}</span></div>
                  {pendingEntry.tierName && <div className="memo-dialog-player-rank">{pendingEntry.tierName}{pendingEntry.rr != null ? ` · ${pendingEntry.rr} RR` : ''}</div>}
                </div>
              </div>
              <div className="memo-dialog-label">メモ（任意）</div>
              <textarea
                className="memo-dialog-textarea"
                placeholder="フレンド、敵、あの時ボコされたスマーフなど..."
                value={memoInput}
                onChange={e => setMemoInput(e.target.value)}
                autoFocus
                rows={4}
              />
              <div className="memo-dialog-actions">
                <button className="memo-dialog-cancel" onClick={() => setPendingEntry(null)}>キャンセル</button>
                <button className="memo-dialog-confirm" onClick={confirmAddFavorite}>登録</button>
              </div>
            </div>
          </div>
        )}

        {/* メモ編集モーダル */}
        {editingPuuid && (() => {
          const fav = favorites.find(f => f.puuid === editingPuuid);
          if (!fav) return null;
          return (
            <div className="memo-dialog-overlay" onClick={() => setEditingPuuid(null)}>
              <div className="memo-dialog" onClick={e => e.stopPropagation()}>
                <div className="memo-dialog-title">メモを編集</div>
                <div className="memo-dialog-player">
                  {fav.cardSmall && <img className="memo-dialog-avatar" src={fav.cardSmall} alt="" />}
                  <div>
                    <div className="memo-dialog-player-name">{fav.name}<span className="memo-dialog-player-tag">#{fav.tag}</span></div>
                    {fav.tierName && <div className="memo-dialog-player-rank">{fav.tierName}{fav.rr != null ? ` · ${fav.rr} RR` : ''}</div>}
                  </div>
                </div>
                <div className="memo-dialog-label">メモ</div>
                <textarea
                  className="memo-dialog-textarea"
                  placeholder="フレンド、敵、あの時ボコされたスマーフなど..."
                  value={editMemoInput}
                  onChange={e => setEditMemoInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveMemoEdit(); }}
                  autoFocus
                  rows={4}
                />
                <div className="memo-dialog-actions">
                  <button className="memo-dialog-cancel" onClick={() => setEditingPuuid(null)}>キャンセル</button>
                  <button className="memo-dialog-confirm" onClick={saveMemoEdit}>保存</button>
                </div>
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
};

export default Search;
