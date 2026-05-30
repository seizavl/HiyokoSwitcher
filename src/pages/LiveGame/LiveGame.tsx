import React, { useState, useEffect, useRef } from 'react';
import './LiveGame.css';
import { LiveGamePlayer, LiveGameResult } from '../../electron.d';

const TEAM_LABEL: Record<string, string> = {
  Blue: '青チーム',
  Red: '赤チーム',
  Defending: '守備側',
  Attacking: '攻撃側',
};

const TEAM_ORDER = ['Blue', 'Defending', 'Red', 'Attacking'];

const isRedSide = (t: string) => t === 'Red' || t === 'Attacking';

const PlayerRow: React.FC<{ player: LiveGamePlayer; onClick: () => void }> = ({ player, onClick }) => (
  <div
    className={`lg-row${player.isSelf ? ' lg-row--me' : ''}`}
    onClick={onClick}
    style={{ cursor: 'pointer' }}
  >
    <div className="lg-row-agent">
      {player.agentIcon
        ? <img src={player.agentIcon} alt={player.agentName} />
        : <span className="lg-row-agent-placeholder">?</span>
      }
    </div>
    <div className="lg-row-name">
      {/^[0-9a-f]{8}$/i.test(player.name)
        ? <span className="lg-row-name-searching">名前検索中...</span>
        : <>
            <span className="lg-row-name-text">{player.name}</span>
            {player.tag && <span className="lg-row-tag">#{player.tag}</span>}
          </>
      }
    </div>
    <div className="lg-row-rank">
      {player.rankIcon
        ? <img src={player.rankIcon} alt={player.rankName} className="s-tier-icon s-tier-icon--sm" />
        : <span className="lg-row-rank-placeholder" />
      }
      <span className="lg-row-rank-name">{player.rankName}</span>
    </div>
    <div className="lg-row-level">Lv.{player.accountLevel}</div>
  </div>
);

const TeamSection: React.FC<{ teamId: string; players: LiveGamePlayer[]; onPlayerClick: (name: string, tag: string) => void }> = ({ teamId, players, onPlayerClick }) => (
  <div className="lg-team">
    <div className={`lg-team-header${isRedSide(teamId) ? ' lg-team-header--red' : ' lg-team-header--blue'}`}>
      <span className="lg-team-dot" />
      <span className="lg-team-label">{TEAM_LABEL[teamId] ?? teamId}</span>
      <span className="lg-team-count">{players.length}人</span>
    </div>
    <div className="lg-team-rows">
      <div className="lg-row-header">
        <span />
        <span>Name</span>
        <span>Rank</span>
        <span>Lv</span>
      </div>
      {players.map(p => (
        <PlayerRow key={p.puuid} player={p} onClick={() => onPlayerClick(p.name, p.tag)} />
      ))}
    </div>
  </div>
);

const STATE_LABEL: Record<string, string> = {
  pregame: 'エージェント選択中',
  ingame: 'インゲーム',
};

interface LiveGameProps {
  onPlayerClick?: (name: string, tag: string) => void;
}

const LiveGame: React.FC<LiveGameProps> = ({ onPlayerClick }) => {
  const [data, setData] = useState<LiveGameResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const fetchingRef = useRef(false);

  const fetchData = async (force = false) => {
    if (fetchingRef.current) return;
    fetchingRef.current = true;
    setFetching(true);
    try {
      const result = await window.electron.livegame.getMatchData(force);
      setData(result);
    } catch {
      setData({ state: 'error', error: 'データの取得に失敗しました' });
    } finally {
      fetchingRef.current = false;
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderContent = () => {
    if (!data && fetching) {
      return (
        <div className="lg-status">
          <span className="lg-search-spinner" />
          読み込み中...
        </div>
      );
    }
    if (!data) return null;

    switch (data.state) {
      case 'not_running':
        return (
          <div className="lg-status">
            <span className="lg-dot lg-dot-off" />
            Valorantクライアントが起動していません
          </div>
        );
      case 'menus':
        return (
          <div className="lg-status">
            <span className="lg-dot lg-dot-on" />
            クライアント起動中 — マッチ待機中
          </div>
        );
      case 'error':
        return (
          <div className="lg-status lg-status-error">
            エラー: {data.error ?? '不明なエラー'}
          </div>
        );
      case 'pregame':
      case 'ingame': {
        const players = data.players ?? [];
        if (players.length === 0) {
          return (
            <div className="lg-status">
              <span className="lg-search-spinner" />
              プレイヤーデータ取得中...
            </div>
          );
        }
        const teamMap = new Map<string, LiveGamePlayer[]>();
        for (const p of players) {
          if (!teamMap.has(p.team)) teamMap.set(p.team, []);
          teamMap.get(p.team)!.push(p);
        }
        const sorted = [...teamMap.entries()].sort(
          ([a], [b]) => (TEAM_ORDER.indexOf(a) ?? 99) - (TEAM_ORDER.indexOf(b) ?? 99)
        );
        return (
          <div className="lg-match">
            {sorted.map(([teamId, teamPlayers]) => (
              <TeamSection key={teamId} teamId={teamId} players={teamPlayers} onPlayerClick={onPlayerClick ?? (() => {})} />
            ))}
          </div>
        );
      }
      default:
        return null;
    }
  };

  const stateLabel = data ? STATE_LABEL[data.state] : undefined;

  return (
    <div className="page-container">
      <div className="glass-card">
        <div className="page-title-row">
          <h2 className="page-title">
            Live Game
            {stateLabel && <span className="lg-state-badge">{stateLabel}</span>}
          </h2>
          <button
            className="lg-refresh-btn"
            onClick={() => fetchData(true)}
            disabled={fetching}
            title="更新"
          >
            <span className={fetching ? 'lg-spin' : ''}>↻</span>
          </button>
        </div>
        <div className="lg-content">
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default LiveGame;
