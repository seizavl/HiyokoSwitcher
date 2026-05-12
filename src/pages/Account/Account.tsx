import React, { useState, useEffect, useRef, useCallback, useLayoutEffect } from 'react';
import './Account.css';
import ConfirmModal from '../../components/ConfirmModal';
import { useAlert } from '../../components/AlertProvider';
import type { ShopStorefront, ShopItem, NightMarketItem } from '../../electron.d';
import type { PythonStatus } from '../../App';

interface AccountType {
  id: string;
  accountname: string;
  accounttag: string;
  valorant: {
    rank: string;
    rankicon: string;
    level: number;
    usericon: string;
  };
  createdAt: string;
  hasLoginData?: boolean;
  memo?: string;
}

interface AccountProps {
  onActiveChange?: () => void;
  pythonStatus?: PythonStatus;
}

const Account: React.FC<AccountProps> = ({ onActiveChange, pythonStatus }) => {
  const { addAlert } = useAlert();
  const [accounts, setAccounts] = useState<AccountType[]>([]);
  const [detailAccount, setDetailAccount] = useState<AccountType | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);
  const isSwitchingRef = useRef(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);
  const [show2faConfirm, setShow2faConfirm] = useState(false);
  const [refreshTargetId, setRefreshTargetId] = useState<string | null>(null);
  const [shopData, setShopData] = useState<ShopStorefront | null>(null);
  const [shopLoading, setShopLoading] = useState(false);
  const [shopError, setShopError] = useState<string | null>(null);
  const [shopCountdown, setShopCountdown] = useState(0);
  const [shopTab, setShopTab] = useState<'daily' | 'night'>('daily');
  const [rankUpdatingIds, setRankUpdatingIds] = useState<Set<string>>(new Set());
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editForm, setEditForm] = useState({ accountname: '', accounttag: '', riotId: '', riotPassword: '' });
  const [isEditing, setIsEditing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ accountname: '', accounttag: '', riotId: '', riotPassword: '' });
  const [isAdding, setIsAdding] = useState(false);
  const [addPendingId, setAddPendingId] = useState<string | null>(null);
  const [showAddLoginConfirm, setShowAddLoginConfirm] = useState(false);
  const [showAdd2faConfirm, setShowAdd2faConfirm] = useState(false);
  const [reorderMode, setReorderMode] = useState(false);
  const [skipAnim, setSkipAnim] = useState(false);
  const [dragState, setDragState] = useState<{
    active: boolean;
    fromIdx: number;
    currentIdx: number;
    startY: number;
    offsetY: number;
    itemHeight: number;
    startScrollTop: number;
  } | null>(null);
  const countdownRef = useRef<NodeJS.Timeout | null>(null);
  const sliderRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const scrollRAF = useRef<number | null>(null);
  const itemRectsRef = useRef<Map<string, DOMRect>>(new Map());
  const [flipTrigger, setFlipTrigger] = useState(0);

  // FLIP: ソート前に各アイテムの位置を記録
  const capturePositions = () => {
    if (!listRef.current) return;
    const map = new Map<string, DOMRect>();
    listRef.current.querySelectorAll<HTMLElement>('[data-account-id]').forEach((el) => {
      const id = el.dataset.accountId!;
      map.set(id, el.getBoundingClientRect());
    });
    itemRectsRef.current = map;
  };

  // FLIP: ソート後に旧位置→新位置をアニメーション
  useLayoutEffect(() => {
    if (flipTrigger === 0 || !listRef.current) return;
    const oldRects = itemRectsRef.current;
    if (oldRects.size === 0) return;

    listRef.current.querySelectorAll<HTMLElement>('[data-account-id]').forEach((el) => {
      const id = el.dataset.accountId!;
      const oldRect = oldRects.get(id);
      if (!oldRect) return;
      const newRect = el.getBoundingClientRect();
      const deltaY = oldRect.top - newRect.top;
      if (Math.abs(deltaY) < 1) return;

      el.style.transform = `translateY(${deltaY}px)`;
      el.style.transition = 'none';
      requestAnimationFrame(() => {
        el.style.transition = 'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)';
        el.style.transform = '';
      });
    });
    itemRectsRef.current = new Map();
  }, [flipTrigger]);

  // ランク順序マッピング（高い方が大きい数値）
  const RANK_ORDER: Record<string, number> = {
    'Unranked': 0, 'Unrated': 0,
    'Iron 1': 1, 'Iron 2': 2, 'Iron 3': 3,
    'Bronze 1': 4, 'Bronze 2': 5, 'Bronze 3': 6,
    'Silver 1': 7, 'Silver 2': 8, 'Silver 3': 9,
    'Gold 1': 10, 'Gold 2': 11, 'Gold 3': 12,
    'Platinum 1': 13, 'Platinum 2': 14, 'Platinum 3': 15,
    'Diamond 1': 16, 'Diamond 2': 17, 'Diamond 3': 18,
    'Ascendant 1': 19, 'Ascendant 2': 20, 'Ascendant 3': 21,
    'Immortal 1': 22, 'Immortal 2': 23, 'Immortal 3': 24,
    'Radiant': 25,
  };

  const getRankValue = (account: AccountType) => {
    return RANK_ORDER[account.valorant?.rank || 'Unranked'] ?? 0;
  };

  const sortByRank = (direction: 'asc' | 'desc') => {
    if (accounts.length === 0) return;
    setSkipAnim(true);
    capturePositions();
    setAccounts((prev) => {
      const sorted = [...prev].sort((a, b) => {
        const diff = getRankValue(a) - getRankValue(b);
        return direction === 'asc' ? diff : -diff;
      });
      window.electron.accounts.reorder(sorted.map((a) => a.id));
      return sorted;
    });
    setFlipTrigger((v) => v + 1);
  };

  // ドラッグ＆ドロップ（pointer events ベース）
  const handlePointerDown = (e: React.PointerEvent, idx: number) => {
    if (!reorderMode) return;
    e.preventDefault();
    const item = (e.currentTarget as HTMLElement);
    const rect = item.getBoundingClientRect();
    const gap = 10; // gap + margin
    item.setPointerCapture(e.pointerId);
    setDragState({
      active: true,
      fromIdx: idx,
      currentIdx: idx,
      startY: e.clientY,
      offsetY: 0,
      itemHeight: rect.height + gap,
      startScrollTop: listRef.current?.scrollTop ?? 0,
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState?.active) return;
    const list = listRef.current;
    const scrollDelta = list ? list.scrollTop - dragState.startScrollTop : 0;
    const rawOffsetY = e.clientY - dragState.startY + scrollDelta;
    const maxUp = -dragState.fromIdx * dragState.itemHeight;
    const maxDown = (accounts.length - 1 - dragState.fromIdx) * dragState.itemHeight;
    const offsetY = Math.max(maxUp, Math.min(maxDown, rawOffsetY));
    const indexShift = Math.round(offsetY / dragState.itemHeight);
    const newIdx = Math.max(0, Math.min(accounts.length - 1, dragState.fromIdx + indexShift));
    setDragState((prev) => prev ? { ...prev, offsetY, currentIdx: newIdx } : prev);

    // オートスクロール
    if (!list) return;
    const listRect = list.getBoundingClientRect();
    const edgeZone = 40;
    const maxSpeed = 2;

    if (scrollRAF.current) cancelAnimationFrame(scrollRAF.current);

    const autoScroll = () => {
      if (!list) return;
      const distFromBottom = listRect.bottom - e.clientY;
      const distFromTop = e.clientY - listRect.top;
      let scrolled = false;

      if (distFromBottom < edgeZone && list.scrollTop < list.scrollHeight - list.clientHeight) {
        const speed = maxSpeed * (1 - distFromBottom / edgeZone);
        list.scrollTop += speed;
        scrolled = true;
      } else if (distFromTop < edgeZone && list.scrollTop > 0) {
        const speed = maxSpeed * (1 - distFromTop / edgeZone);
        list.scrollTop -= speed;
        scrolled = true;
      }

      if (scrolled) {
        // スクロール分をドラッグアイテムに反映（クランプ付き）
        const newScrollDelta = list.scrollTop - dragState.startScrollTop;
        const rawNewOffsetY = e.clientY - dragState.startY + newScrollDelta;
        const maxUp = -dragState.fromIdx * dragState.itemHeight;
        const maxDown = (accounts.length - 1 - dragState.fromIdx) * dragState.itemHeight;
        const newOffsetY = Math.max(maxUp, Math.min(maxDown, rawNewOffsetY));
        const newShift = Math.round(newOffsetY / dragState.itemHeight);
        const newCurrentIdx = Math.max(0, Math.min(accounts.length - 1, dragState.fromIdx + newShift));
        setDragState((prev) => prev ? { ...prev, offsetY: newOffsetY, currentIdx: newCurrentIdx } : prev);
        scrollRAF.current = requestAnimationFrame(autoScroll);
      } else {
        scrollRAF.current = null;
      }
    };
    autoScroll();
  };

  const handlePointerUp = () => {
    if (scrollRAF.current) { cancelAnimationFrame(scrollRAF.current); scrollRAF.current = null; }
    if (!dragState?.active) return;
    const { fromIdx, currentIdx } = dragState;
    if (fromIdx !== currentIdx) {
      setSkipAnim(true);
      setAccounts((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIdx, 1);
        next.splice(currentIdx, 0, moved);
        window.electron.accounts.reorder(next.map((a) => a.id));
        return next;
      });
    }
    setDragState(null);
  };

  const getDragStyle = (idx: number): React.CSSProperties => {
    if (!dragState?.active) return {};
    if (idx === dragState.fromIdx) {
      return {
        transform: `translateY(${dragState.offsetY}px) scale(1.02)`,
        zIndex: 10,
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        transition: 'box-shadow 0.2s, scale 0.2s',
      };
    }
    // 他のアイテムをずらす
    const { fromIdx, currentIdx, itemHeight } = dragState;
    if (fromIdx < currentIdx && idx > fromIdx && idx <= currentIdx) {
      return { transform: `translateY(${-itemHeight}px)`, transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1)' };
    }
    if (fromIdx > currentIdx && idx < fromIdx && idx >= currentIdx) {
      return { transform: `translateY(${itemHeight}px)`, transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1)' };
    }
    return { transition: 'transform 0.25s cubic-bezier(0.22,1,0.36,1)' };
  };

  // アカウント追加
  const handleAddAccount = async () => {
    if (!addForm.accountname || !addForm.accounttag) {
      addAlert('error', 'エラー', 'アカウント名とタグを入力してください');
      return;
    }
    setIsAdding(true);
    try {
      const cleanTag = addForm.accounttag.replace(/^#/, '');
      const newAccount = await (window.electron.accounts.add as any)({
        accountname: addForm.accountname,
        accounttag: cleanTag,
        valorant: { rank: '', rankicon: '', level: 0, usericon: '' },
        riotId: addForm.riotId || undefined,
        riotPassword: addForm.riotPassword || undefined,
      });

      if (addForm.riotId && addForm.riotPassword) {
        // ログイン確認フロー
        const killed = await window.electron.riot.killClient();
        if (killed) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        await window.electron.riot.deleteYaml();
        await new Promise(resolve => setTimeout(resolve, 1000));

        addAlert('info', '自動ログイン開始', 'Riot Clientを起動して自動ログインします...');
        await window.electron.accounts.login(newAccount.id);

        window.electron.window.focus();
        setAddPendingId(newAccount.id);
        setShowAddModal(false);
        setShowAddLoginConfirm(true);
      } else {
        addAlert('success', '追加完了', 'アカウントを追加しました。');
        setShowAddModal(false);
        loadAccounts();
      }

      setAddForm({ accountname: '', accounttag: '', riotId: '', riotPassword: '' });
    } catch (error: any) {
      addAlert('error', 'エラー', error.message || 'アカウントの追加に失敗しました');
    } finally {
      setIsAdding(false);
    }
  };

  // 追加時ログイン確認ハンドラ
  const saveAddLoginData = async (accountId: string) => {
    try {
      const killed = await window.electron.riot.killClient();
      if (killed) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      await window.electron.riot.saveYaml(accountId);
      const settings = await window.electron.settings.get();
      await window.electron.settings.save({ ...settings, activeAccountId: accountId });
      setActiveAccountId(accountId);
      onActiveChange?.();
      addAlert('success', '保存完了', 'アカウントを追加してログインデータを保存しました。');
    } catch (error: any) {
      addAlert('error', 'エラー', 'ログインデータの保存に失敗しました。');
    }
  };

  const handleAddLoginConfirm = async (value: string) => {
    setShowAddLoginConfirm(false);
    switch (value) {
      case 'success':
        if (addPendingId) {
          await saveAddLoginData(addPendingId);
        }
        break;
      case 'failed':
        if (addPendingId) {
          await window.electron.accounts.delete(addPendingId);
        }
        addAlert('error', 'ログイン失敗', 'ログインに失敗しました。ID/パスワードを確認してください。');
        break;
      case '2fa':
        setShowAdd2faConfirm(true);
        return;
    }
    setAddPendingId(null);
    loadAccounts();
  };

  const handleAdd2faConfirm = async (value: string) => {
    setShowAdd2faConfirm(false);
    if (value === 'done') {
      if (addPendingId) {
        await saveAddLoginData(addPendingId);
      }
    } else {
      if (addPendingId) {
        await window.electron.accounts.delete(addPendingId);
      }
      addAlert('error', 'ログイン失敗', '二段階認証に失敗しました。');
    }
    setAddPendingId(null);
    loadAccounts();
  };

  useEffect(() => {
    loadAccounts();
    loadActiveAccount();
  }, []);

  const loadAccounts = async () => {
    try {
      const data = await window.electron.accounts.getAll();
      setAccounts(data);
    } catch (error) {
      console.error('Failed to load accounts:', error);
    }
  };

  const loadActiveAccount = async () => {
    try {
      const settings = await window.electron.settings.get();
      if (settings.activeAccountId) {
        setActiveAccountId(settings.activeAccountId);
      }
    } catch (error) {
      console.error('Failed to load active account:', error);
    }
  };

  const saveActiveAccount = async (id: string) => {
    if (id === activeAccountId || isSwitchingRef.current) return;
    isSwitchingRef.current = true;
    setIsSwitching(true);
    setActiveAccountId(id);
    try {
      // RiotClientServicesが動いていれば終了して1秒待つ
      const killed = await window.electron.riot.killClient();
      if (killed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      // 現在のyamlを削除
      await window.electron.riot.deleteYaml();
      // 新しいアカウントのyamlを復元
      await window.electron.riot.restoreYaml(id);
      const settings = await window.electron.settings.get();
      await window.electron.settings.save({ ...settings, activeAccountId: id });
      // Riot Clientを起動
      await window.electron.riot.launchClient();
      onActiveChange?.();
    } catch (error) {
      console.error('Failed to save active account:', error);
    } finally {
      isSwitchingRef.current = false;
      setIsSwitching(false);
    }
  };

  // ランク情報更新（ページを離れても継続）
  const updateRank = useCallback(async (account: AccountType) => {
    const id = account.id;
    setRankUpdatingIds((prev) => new Set(prev).add(id));
    try {
      const updated = await window.electron.accounts.updateRank(id);
      // アカウントリストとdetailAccountを更新
      setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, valorant: updated.valorant } : a)));
      setDetailAccount((prev) => (prev?.id === id ? { ...prev, valorant: updated.valorant } : prev));
      addAlert('success', '更新完了', 'ランク情報を更新しました。');
    } catch (error: any) {
      addAlert('error', 'エラー', error.message || 'ランク情報の更新に失敗しました。');
    } finally {
      setRankUpdatingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, [addAlert]);

  // IDコピー
  const copyAccountId = useCallback((account: AccountType) => {
    const text = `${account.accountname}#${account.accounttag}`;
    window.electron.clipboard.copy(text);
    addAlert('success', 'コピー', 'IDをコピーしました。');
  }, [addAlert]);

  // TRNを開く
  const openTRN = useCallback((account: AccountType) => {
    const url = `https://tracker.gg/valorant/profile/riot/${encodeURIComponent(account.accountname)}%23${encodeURIComponent(account.accounttag)}/overview`;
    window.electron.shell.openExternal(url);
  }, []);

  // 編集モーダルを開く
  const openEditModal = useCallback((account: AccountType) => {
    setEditForm({
      accountname: account.accountname,
      accounttag: account.accounttag,
      riotId: '',
      riotPassword: '',
    });
    setShowEditModal(true);
  }, []);

  // 編集を保存
  const handleEditSave = useCallback(async () => {
    if (!detailAccount) return;
    setIsEditing(true);
    try {
      const updated = await window.electron.accounts.update(detailAccount.id, {
        accountname: editForm.accountname || undefined,
        accounttag: editForm.accounttag || undefined,
        riotId: editForm.riotId || undefined,
        riotPassword: editForm.riotPassword || undefined,
      });
      setAccounts((prev) => prev.map((a) => (a.id === updated.id ? { ...a, ...updated } : a)));
      setDetailAccount((prev) => (prev?.id === updated.id ? { ...prev, ...updated } : prev));
      setShowEditModal(false);
      addAlert('success', '更新完了', 'アカウント情報を更新しました。');
    } catch (error: any) {
      addAlert('error', 'エラー', error.message || '更新に失敗しました。');
    } finally {
      setIsEditing(false);
    }
  }, [detailAccount, editForm, addAlert]);

  // ショップデータ取得
  const fetchShop = useCallback(async (accountId: string) => {
    setShopLoading(true);
    setShopError(null);
    setShopData(null);
    try {
      const data = await window.electron.shop.getStorefront(accountId);
      setShopData(data);
      setShopCountdown(data.dailyRemainingSeconds);
    } catch (error: any) {
      setShopError(error.message || 'ショップの取得に失敗しました');
    } finally {
      setShopLoading(false);
    }
  }, []);

  // カウントダウンタイマー
  useEffect(() => {
    if (shopCountdown <= 0) return;
    countdownRef.current = setInterval(() => {
      setShopCountdown((prev) => {
        if (prev <= 1) {
          if (countdownRef.current) clearInterval(countdownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [shopCountdown > 0]);

  const formatCountdown = (secs: number): string => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const openDetail = (account: AccountType) => {
    setSkipAnim(false);
    setDetailAccount(account);
    setShopData(null);
    setShopError(null);
    fetchShop(account.id);
    requestAnimationFrame(() => setIsDetailOpen(true));
  };

  const closeDetail = () => {
    setSkipAnim(false);
    setIsDetailOpen(false);
    const el = sliderRef.current;
    if (el) {
      const onEnd = () => {
        setDetailAccount(null);
        el.removeEventListener('transitionend', onEnd);
      };
      el.addEventListener('transitionend', onEnd);
    } else {
      setDetailAccount(null);
    }
  };

  const handleDelete = (id: string) => {
    setDeleteTargetId(id);
  };

  const handleDeleteConfirm = async (value: string) => {
    setDeleteTargetId(null);
    if (value === 'yes' && deleteTargetId) {
      try {
        await window.electron.accounts.delete(deleteTargetId);
        if (activeAccountId === deleteTargetId) {
          const settings = await window.electron.settings.get();
          await window.electron.settings.save({ ...settings, activeAccountId: undefined });
          setActiveAccountId(null);
          onActiveChange?.();
        }
        setDetailAccount(null);
        setIsDetailOpen(false);
        loadAccounts();
      } catch (error) {
        console.error('Failed to delete account:', error);
      }
    }
  };

  const handleMacroLogin = async (id: string) => {
    setIsRefreshing(true);
    setRefreshTargetId(id);
    try {
      // 1. Riot Client を終了
      const killed = await window.electron.riot.killClient();
      if (killed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      // 2. トグル（activeAccountId）を解除
      setActiveAccountId(null);
      const settings = await window.electron.settings.get();
      await window.electron.settings.save({ ...settings, activeAccountId: undefined });
      // 3. YAML を削除
      await window.electron.riot.deleteYaml();
      await new Promise(resolve => setTimeout(resolve, 1000));
      // 4. マクロログイン（stayボタンスキップ）
      addAlert('info', 'マクロログイン開始', 'Riot Clientを起動してマクロログインします...');
      await window.electron.accounts.macroLogin(id);
      window.electron.window.focus();
      addAlert('info', 'マクロログイン完了', 'マクロログインが完了しました。');
    } catch (error: any) {
      console.error('Failed to macro login:', error);
      addAlert('error', 'エラー', error.message || 'マクロログインに失敗しました。');
    } finally {
      setIsRefreshing(false);
      setRefreshTargetId(null);
    }
  };

  const handleRefresh = async (id: string) => {
    setIsRefreshing(true);
    setRefreshTargetId(id);
    try {
      // AddAccountと同じフロー
      const killed = await window.electron.riot.killClient();
      if (killed) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      await window.electron.riot.deleteYaml();
      await new Promise(resolve => setTimeout(resolve, 1000));
      addAlert('info', '自動ログイン開始', 'Riot Clientを起動して自動ログインします...');
      await window.electron.accounts.login(id);
      window.electron.window.focus();
      setShowRefreshConfirm(true);
    } catch (error: any) {
      console.error('Failed to refresh yaml:', error);
      addAlert('error', 'エラー', error.message || 'ログインデータの更新に失敗しました。');
      setIsRefreshing(false);
      setRefreshTargetId(null);
    }
  };

  const handleRefreshConfirm = async (value: string) => {
    setShowRefreshConfirm(false);
    switch (value) {
      case 'success':
        if (refreshTargetId) {
          try {
            await window.electron.riot.saveYaml(refreshTargetId);
            const settings = await window.electron.settings.get();
            await window.electron.settings.save({ ...settings, activeAccountId: refreshTargetId });
            setActiveAccountId(refreshTargetId);
            onActiveChange?.();
            addAlert('success', '更新完了', 'ログインデータを更新しました。');
          } catch (error: any) {
            addAlert('error', 'エラー', 'ログインデータの保存に失敗しました。');
          }
        }
        break;
      case 'failed':
        // 元のyamlに戻す（フォルダは既に削除済みなので何もしない）
        addAlert('error', '更新失敗', 'ログインデータの更新に失敗しました。再度お試しください。');
        break;
      case '2fa':
        setShow2faConfirm(true);
        return; // returnでrefreshTargetIdをクリアしない
    }
    setIsRefreshing(false);
    setRefreshTargetId(null);
  };

  const handleRefresh2faConfirm = async (value: string) => {
    setShow2faConfirm(false);
    if (value === 'done') {
      if (refreshTargetId) {
        try {
          const killed = await window.electron.riot.killClient();
          if (killed) {
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
          await window.electron.riot.saveYaml(refreshTargetId);
          const settings = await window.electron.settings.get();
          await window.electron.settings.save({ ...settings, activeAccountId: refreshTargetId });
          setActiveAccountId(refreshTargetId);
          onActiveChange?.();
          addAlert('success', '更新完了', 'ログインデータを更新しました。');
        } catch (error: any) {
          addAlert('error', 'エラー', 'ログインデータの保存に失敗しました。');
        }
      }
    } else {
      addAlert('error', '更新失敗', 'ログインデータの更新に失敗しました。再度お試しください。');
    }
    setIsRefreshing(false);
    setRefreshTargetId(null);
  };

  return (
    <div className="page-container">
      {showAdd2faConfirm && (
        <ConfirmModal
          title="二段階認証は完了しましたか？"
          message="Riot Clientで二段階認証コードを入力してから選択してください。"
          options={[
            { label: 'できました', value: 'done', style: 'primary' },
            { label: 'できませんでした', value: 'failed', style: 'secondary' },
          ]}
          onSelect={handleAdd2faConfirm}
          closable={false}
        />
      )}
      {showAddLoginConfirm && (
        <ConfirmModal
          title="Riotアカウントにログインできましたか？"
          message="Riot Clientの状態を確認して選択してください。"
          options={[
            { label: 'できました', value: 'success', style: 'primary' },
            { label: 'できませんでした', value: 'failed', style: 'secondary' },
            { label: '二段階認証があります', value: '2fa', style: 'warning' },
          ]}
          onSelect={handleAddLoginConfirm}
          closable={false}
        />
      )}
      {showEditModal && detailAccount && (
        <div className="confirm-modal-overlay" onClick={() => !isEditing && setShowEditModal(false)}>
          <div className="confirm-modal edit-modal" onClick={(e) => e.stopPropagation()}>
            <button className="confirm-modal-close" onClick={() => !isEditing && setShowEditModal(false)}>&times;</button>
            <div className="confirm-modal-title">アカウント編集</div>
            <div className="edit-modal-form">
              <div className="edit-form-group">
                <label className="edit-form-label">Account Name</label>
                <input
                  type="text"
                  className="edit-form-input"
                  value={editForm.accountname}
                  onChange={(e) => setEditForm((f) => ({ ...f, accountname: e.target.value }))}
                  disabled={isEditing}
                />
              </div>
              <div className="edit-form-group">
                <label className="edit-form-label">Account Tag</label>
                <input
                  type="text"
                  className="edit-form-input"
                  value={editForm.accounttag}
                  onChange={(e) => setEditForm((f) => ({ ...f, accounttag: e.target.value }))}
                  disabled={isEditing}
                />
              </div>
              <div className="edit-form-group">
                <label className="edit-form-label">Riot ID (ログイン用)</label>
                <input
                  type="text"
                  className="edit-form-input"
                  placeholder="変更しない場合は空欄"
                  value={editForm.riotId}
                  onChange={(e) => setEditForm((f) => ({ ...f, riotId: e.target.value }))}
                  disabled={isEditing}
                />
              </div>
              <div className="edit-form-group">
                <label className="edit-form-label">Password (ログイン用)</label>
                <input
                  type="password"
                  className="edit-form-input"
                  placeholder="変更しない場合は空欄"
                  value={editForm.riotPassword}
                  onChange={(e) => setEditForm((f) => ({ ...f, riotPassword: e.target.value }))}
                  disabled={isEditing}
                />
              </div>
              <button className="edit-form-submit" onClick={handleEditSave} disabled={isEditing}>
                {isEditing ? <span className="btn-spinner" /> : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
      {showLoginModal && detailAccount && (
        <ConfirmModal
          title="ログイン方法を選択"
          message="どの方法でログインしますか？"
          options={[
            { label: 'クイックログイン', value: 'quick', style: 'primary' },
            { label: 'マクロログイン', value: 'macro', style: 'secondary' },
          ]}
          onSelect={async (value) => {
            setShowLoginModal(false);
            if (value === 'quick') {
              await saveActiveAccount(detailAccount.id);
            } else if (value === 'macro') {
              await handleMacroLogin(detailAccount.id);
            }
          }}
          onClose={() => setShowLoginModal(false)}
        />
      )}
      {show2faConfirm && (
        <ConfirmModal
          title="二段階認証は完了しましたか？"
          message="Riot Clientで二段階認証コードを入力してから選択してください。"
          options={[
            { label: 'できました', value: 'done', style: 'primary' },
            { label: 'できませんでした', value: 'failed', style: 'secondary' },
          ]}
          onSelect={handleRefresh2faConfirm}
          closable={false}
        />
      )}
      {showRefreshConfirm && (
        <ConfirmModal
          title="Riotアカウントにログインできましたか？"
          message="Riot Clientの状態を確認して選択してください。"
          options={[
            { label: 'できました', value: 'success', style: 'primary' },
            { label: 'できませんでした', value: 'failed', style: 'secondary' },
            { label: '二段階認証があります', value: '2fa', style: 'warning' },
          ]}
          onSelect={handleRefreshConfirm}
          closable={false}
        />
      )}
      {deleteTargetId && (
        <ConfirmModal
          title="このアカウントを削除しますか？"
          message="アカウントと保存されたログインデータが完全に削除されます。"
          options={[
            { label: '削除する', value: 'yes', style: 'primary' },
            { label: 'キャンセル', value: 'no', style: 'secondary' },
          ]}
          onSelect={handleDeleteConfirm}
          closable={false}
        />
      )}
      {showAddModal && (
        <div className="confirm-modal-overlay" onClick={() => !isAdding && setShowAddModal(false)}>
          <div className="confirm-modal edit-modal" onClick={(e) => e.stopPropagation()}>
            <button className="confirm-modal-close" onClick={() => !isAdding && setShowAddModal(false)}>&times;</button>
            <div className="confirm-modal-title">アカウント追加</div>
            <div className="edit-modal-form">
              <div className="edit-form-group">
                <label className="edit-form-label">Account Name</label>
                <input
                  type="text"
                  className="edit-form-input"
                  placeholder="Enter account name"
                  value={addForm.accountname}
                  onChange={(e) => setAddForm((f) => ({ ...f, accountname: e.target.value }))}
                  disabled={isAdding}
                />
              </div>
              <div className="edit-form-group">
                <label className="edit-form-label">Account Tag</label>
                <input
                  type="text"
                  className="edit-form-input"
                  placeholder="Enter tag"
                  value={addForm.accounttag}
                  onChange={(e) => setAddForm((f) => ({ ...f, accounttag: e.target.value }))}
                  disabled={isAdding}
                />
              </div>
              <div className="edit-form-group">
                <label className="edit-form-label">Riot ID (ログイン用)</label>
                <input
                  type="text"
                  className="edit-form-input"
                  placeholder="任意"
                  value={addForm.riotId}
                  onChange={(e) => setAddForm((f) => ({ ...f, riotId: e.target.value }))}
                  disabled={isAdding}
                />
              </div>
              <div className="edit-form-group">
                <label className="edit-form-label">Password (ログイン用)</label>
                <input
                  type="password"
                  className="edit-form-input"
                  placeholder="任意"
                  value={addForm.riotPassword}
                  onChange={(e) => setAddForm((f) => ({ ...f, riotPassword: e.target.value }))}
                  disabled={isAdding}
                />
              </div>
              <button className="edit-form-submit" onClick={handleAddAccount} disabled={isAdding}>
                {isAdding ? <span className="btn-spinner" /> : '追加'}
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="glass-card">
        <div className="page-title-row">
          <h2 className="page-title">Accounts</h2>
          <div className={`account-toolbar ${isDetailOpen ? 'toolbar-hidden' : ''}`}>
            <button
              className="toolbar-btn toolbar-item"
              onClick={() => sortByRank('desc')}
              title="ランク順（高い順）"
              style={{ transitionDelay: isDetailOpen ? '0ms' : '120ms' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
              </svg>
            </button>
            <button
              className="toolbar-btn toolbar-item"
              onClick={() => sortByRank('asc')}
              title="ランク順（低い順）"
              style={{ transitionDelay: isDetailOpen ? '40ms' : '80ms' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
              </svg>
            </button>
            <button
              className="toolbar-btn toolbar-item"
              onClick={() => setShowAddModal(true)}
              title="アカウント追加"
              style={{ transitionDelay: isDetailOpen ? '80ms' : '40ms' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
            </button>
            <button
              className={`toolbar-btn toolbar-item ${reorderMode ? 'toolbar-btn-active' : ''}`}
              onClick={() => setReorderMode((v) => !v)}
              title="並び替えモード"
              style={{ transitionDelay: isDetailOpen ? '120ms' : '0ms' }}
            >
              <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M3 15h18v-2H3v2zm0 4h18v-2H3v2zm0-8h18V9H3v2zm0-6v2h18V5H3z"/>
              </svg>
            </button>
          </div>
        </div>
        <div className="account-slider-wrapper">
          <div
            ref={sliderRef}
            className={`account-slider ${isDetailOpen ? 'show-detail' : ''}`}
          >
            {/* リスト画面 */}
            <div className="account-slide account-list-slide">
              <div className="account-list" ref={listRef}>
                {accounts.length === 0 ? (
                  <div style={{ textAlign: 'center', color: '#71767b', padding: '20px' }}>
                    アカウントがありません。右上の＋ボタンから追加してください。
                  </div>
                ) : (
                  accounts.map((account, idx) => (
                    <div
                      key={account.id}
                      data-account-id={account.id}
                      className={`account-item ${isSwitching ? 'disabled' : ''} ${reorderMode ? 'reorder-mode' : ''} ${dragState?.active && dragState.fromIdx === idx ? 'dragging' : ''} ${dragState?.active || skipAnim ? '' : isDetailOpen ? 'item-exit' : 'item-enter'}`}
                      style={{ ...getDragStyle(idx), ...(dragState?.active || skipAnim ? {} : { animationDelay: `${isDetailOpen ? (accounts.length - 1 - idx) * 25 : 150 + idx * 30}ms` }) }}
                      onClick={() => !reorderMode && saveActiveAccount(account.id)}
                      onPointerDown={(e) => handlePointerDown(e, idx)}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                    >
                      <div className="item-left-icon">
                        <div className={`drag-handle ${reorderMode ? 'icon-visible' : 'icon-hidden'}`}>
                          <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                            <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </div>
                        <div className={`radio-switch ${activeAccountId === account.id ? 'active' : ''} ${reorderMode ? 'icon-hidden' : 'icon-visible'}`}>
                          <span className="radio-dot" />
                        </div>
                      </div>
                      <div className="account-avatar">
                        {account.valorant?.usericon ? (
                          <img src={account.valorant.usericon} alt={account.accountname} />
                        ) : (
                          account.accountname.charAt(0).toUpperCase()
                        )}
                      </div>
                      <div className="account-info">
                        <div className="account-name">
                          {account.accountname}#{account.accounttag}
                        </div>
                        <div className="account-status">
                          {account.valorant?.rankicon && (
                            <img src={account.valorant.rankicon} alt="rank" className="rank-icon" />
                          )}
                          <span>{account.valorant?.rank || 'Unranked'} - Level {account.valorant?.level || 0}</span>
                        </div>
                      </div>
                      <button
                        className="more-button"
                        onClick={(e) => { e.stopPropagation(); openDetail(account); }}
                      >
                        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M9 18l6-6-6-6"/>
                        </svg>
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* 詳細画面 */}
            <div className="account-slide account-detail-slide">
              {detailAccount && (
                <div className={`account-detail ${isDetailOpen ? 'fade-in' : 'fade-out'}`}>
                  <button className="back-button" onClick={closeDetail}>
                    <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                      <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                    戻る
                  </button>
                  <div className="detail-header-card">
                    <div className="detail-avatar">
                      {detailAccount.valorant?.usericon ? (
                        <img src={detailAccount.valorant.usericon} alt={detailAccount.accountname} />
                      ) : (
                        detailAccount.accountname.charAt(0).toUpperCase()
                      )}
                    </div>
                    {detailAccount.valorant?.rankicon && (
                      <img src={detailAccount.valorant.rankicon} alt="rank" className="detail-rankicon" />
                    )}
                    <div className="detail-header-info">
                      <div className="detail-name">
                        {detailAccount.accountname}<span className="detail-tag">#{detailAccount.accounttag}</span>
                      </div>
                    </div>
                    <div className="detail-header-actions">
                      {[
                        { icon: <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>, onClick: () => openEditModal(detailAccount), title: 'アカウントを編集', cls: '' },
                        { icon: <path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/>, onClick: () => copyAccountId(detailAccount), title: 'IDをコピー', cls: '' },
                        { icon: rankUpdatingIds.has(detailAccount.id) ? null : <path d="M17.65 6.35A7.958 7.958 0 0012 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0112 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>, onClick: () => updateRank(detailAccount), title: 'ランク情報を更新', cls: '', disabled: rankUpdatingIds.has(detailAccount.id), spinner: rankUpdatingIds.has(detailAccount.id) },
                        { icon: <path d="M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z"/>, onClick: () => openTRN(detailAccount), title: 'TRNで開く', cls: '' },
                        { icon: <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>, onClick: () => handleDelete(detailAccount.id), title: 'アカウントを削除', cls: 'header-action-delete' },
                      ].map((btn, i) => (
                        <button
                          key={i}
                          className={`header-action-btn header-action-item ${btn.cls}`}
                          onClick={btn.onClick}
                          title={btn.title}
                          disabled={btn.disabled}
                          style={{ animationDelay: `${isDetailOpen ? 200 + i * 40 : (4 - i) * 40}ms` }}
                        >
                          {btn.spinner ? (
                            <span className="btn-spinner header-spinner" />
                          ) : (
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">{btn.icon}</svg>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* ショップセクション */}
                  <div className="shop-section">
                    <div className="shop-header">
                      <div className="shop-tabs">
                        <button
                          className={`shop-tab${shopTab === 'daily' ? ' active' : ''}`}
                          onClick={() => setShopTab('daily')}
                        >
                          デイリーショップ
                        </button>
                        {shopData?.nightMarket && (
                          <button
                            className={`shop-tab${shopTab === 'night' ? ' active' : ''}`}
                            onClick={() => setShopTab('night')}
                          >
                            ナイトマーケット
                          </button>
                        )}
                      </div>
                      <div className="shop-header-right">
                        {shopTab === 'daily' && shopCountdown > 0 && (
                          <span className="shop-countdown">{formatCountdown(shopCountdown)}</span>
                        )}
                        {shopTab === 'night' && shopData?.nightMarketRemainingSeconds && shopData.nightMarketRemainingSeconds > 0 && (
                          <span className="shop-countdown">{formatCountdown(shopData.nightMarketRemainingSeconds)}</span>
                        )}
                        <button
                          className="shop-refresh-btn"
                          onClick={() => fetchShop(detailAccount.id)}
                          disabled={shopLoading}
                          title="ショップを再取得"
                        >
                          <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor">
                            <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zM1 2v2h2l3.6 7.59-1.35 2.45c-.16.28-.25.61-.25.96 0 1.1.9 2 2 2h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63h7.45c.75 0 1.41-.41 1.75-1.03l3.58-6.49A1.003 1.003 0 0020 4H5.21l-.94-2H1zm16 16c-1.1 0-1.99.9-1.99 2s.89 2 1.99 2 2-.9 2-2-.9-2-2-2z"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                    {shopLoading && (
                      <div className="shop-loading">
                        <span className="btn-spinner" />
                        <span>ショップを取得中...</span>
                      </div>
                    )}
                    {shopError && (
                      <div className="shop-error">
                        <span>{shopError}</span>
                        <button className="shop-retry-btn" onClick={() => fetchShop(detailAccount.id)}>
                          再試行
                        </button>
                      </div>
                    )}
                    {shopData && (
                      <>
                        {shopTab === 'daily' && (
                          <div className="shop-grid">
                            {shopData.dailyOffers.map((item) => (
                              <div
                                key={item.skinUuid}
                                className="shop-card"
                                style={{ borderColor: item.tierColor }}
                              >
                                <div className="shop-card-img-wrapper">
                                  <img
                                    src={item.skinIcon}
                                    alt={item.skinName}
                                    className="shop-card-img"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = `https://media.valorant-api.com/weaponskinlevels/${item.skinUuid}/displayicon.png`;
                                    }}
                                  />
                                </div>
                                <div className="shop-card-info">
                                  <span className="shop-card-name">{item.skinName}</span>
                                  <span className="shop-card-cost">
                                    <img
                                      src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png"
                                      alt="VP"
                                      className="vp-icon"
                                    />
                                    {item.vpCost.toLocaleString()}
                                  </span>
                                </div>
                                {item.tierIcon && (
                                  <img src={item.tierIcon} alt="" className="shop-card-tier" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {shopTab === 'night' && shopData.nightMarket && (
                          <div className="shop-grid shop-grid--night">
                            {shopData.nightMarket.map((item: NightMarketItem) => (
                              <div
                                key={item.skinUuid}
                                className="shop-card night-market"
                                style={{ borderColor: item.tierColor }}
                              >
                                <div className="shop-card-img-wrapper">
                                  <img
                                    src={item.skinIcon}
                                    alt={item.skinName}
                                    className="shop-card-img"
                                    onError={(e) => {
                                      (e.target as HTMLImageElement).src = `https://media.valorant-api.com/weaponskinlevels/${item.skinUuid}/displayicon.png`;
                                    }}
                                  />
                                  <span className="shop-card-discount-badge">
                                    -{item.discountPercent}%
                                  </span>
                                </div>
                                <div className="shop-card-info">
                                  <span className="shop-card-name">{item.skinName}</span>
                                  <div className="shop-card-discount">
                                    <span className="shop-card-cost-original">
                                      {item.baseCost.toLocaleString()}
                                    </span>
                                    <span className="shop-card-cost">
                                      <img
                                        src="https://media.valorant-api.com/currencies/85ad13f7-3d1b-5128-9eb2-7cd8ee0b5741/displayicon.png"
                                        alt="VP"
                                        className="vp-icon"
                                      />
                                      {item.discountCost.toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                                {item.tierIcon && (
                                  <img src={item.tierIcon} alt="" className="shop-card-tier" />
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  <div className="detail-actions">
                    <button
                      className="detail-login-button"
                      onClick={() => setShowLoginModal(true)}
                      disabled={isSwitching || pythonStatus === 'starting'}
                      title={pythonStatus === 'starting' ? 'バックエンド起動中...' : pythonStatus === 'error' ? 'バックエンドに接続できません' : undefined}
                    >
                      {isSwitching ? (
                        <span className="btn-spinner" />
                      ) : pythonStatus === 'starting' ? (
                        <>
                          <span className="btn-spinner" />
                          起動中...
                        </>
                      ) : (
                        <>
                          <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                            <path d="M8 5v14l11-7z"/>
                          </svg>
                          {pythonStatus === 'error' ? 'ログイン (バックエンド未接続)' : 'ログイン'}
                        </>
                      )}
                    </button>
                    {detailAccount.hasLoginData && (
                      <button
                        className="detail-refresh-button"
                        onClick={() => handleRefresh(detailAccount.id)}
                        disabled={isRefreshing}
                        title="保存されたログインデータを再取得します"
                      >
                        {isRefreshing ? (
                          <span className="btn-spinner" />
                        ) : (
                          <>
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                            </svg>
                            セッション更新
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Account;
