(() => {
  'use strict';

  const CONFIG_PATH = './config.local.json';
  const CONNECTION_MODE = 'connection-check-only';
  const MANUAL_BACKUP_MODE = 'manual-backup';
  const BACKUP_TABLE = 'hidaka_manual_backups';
  const SESSION_KEY = 'hidaka-order-supabase-session-v1';
  const SESSION_REFRESH_MARGIN_SECONDS = 60;
  let activeConfig = null;
  let initializationPromise = null;
  let status = {
    state: 'idle',
    label: '未確認（保存は端末）',
    configured: false,
    reachable: false,
    authenticated: false,
    userEmail: '',
    storageMode: 'local-only'
  };

  function updateStatus(next) {
    status = { ...status, ...next, storageMode: 'local-only', manualBackupEnabled: activeConfig?.mode === MANUAL_BACKUP_MODE };
    window.dispatchEvent(new CustomEvent('hidaka:supabase-status', { detail: { ...status } }));
    return { ...status };
  }

  function validSupabaseUrl(value) {
    try {
      const url = new URL(String(value || ''));
      return url.protocol === 'https:' && /\.supabase\.co$/i.test(url.hostname);
    } catch {
      return false;
    }
  }

  function validateConfig(raw) {
    if (!raw || raw.enabled !== true) return { enabled: false };
    if (![CONNECTION_MODE, MANUAL_BACKUP_MODE].includes(raw.mode)) throw new Error('未対応のクラウド接続モードです。');
    if (!validSupabaseUrl(raw.supabaseUrl)) throw new Error('Supabase URLが不正です。');
    if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(String(raw.publishableKey || ''))) {
      throw new Error('公開用接続キーが不正です。');
    }
    if (String(raw.appKey || '') !== 'hidaka-order') throw new Error('アプリ識別子が一致しません。');
    if (String(raw.legacyStoreId || '') !== 'hidaka-001') throw new Error('旧店舗IDが一致しません。');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(raw.supabaseStoreId || ''))) {
      throw new Error('Supabase店舗IDが不正です。');
    }
    return {
      enabled: true,
      mode: raw.mode,
      supabaseUrl: String(raw.supabaseUrl).replace(/\/$/, ''),
      publishableKey: String(raw.publishableKey),
      appKey: String(raw.appKey),
      legacyStoreId: String(raw.legacyStoreId),
      supabaseStoreId: String(raw.supabaseStoreId)
    };
  }

  async function loadConfig() {
    const response = await fetch(`${CONFIG_PATH}?v=2`, { cache: 'no-store' });
    if (response.status === 404) return { enabled: false };
    if (!response.ok) throw new Error(`設定ファイルを読み込めません（HTTP ${response.status}）。`);
    return validateConfig(await response.json());
  }

  function normalizeSession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const accessToken = String(raw.access_token || '');
    const refreshToken = String(raw.refresh_token || '');
    const expiresAt = Number(raw.expires_at || (Date.now() / 1000 + Number(raw.expires_in || 0)));
    if (!accessToken || !refreshToken || !Number.isFinite(expiresAt)) return null;
    return { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt };
  }

  function authRedirectUrl() {
    const url = new URL(window.location.href);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error('メールリンクを受け取れるURLではありません。');
    url.search = '';
    url.hash = '';
    return url.href;
  }

  function clearAuthRedirect() {
    if (!window.history?.replaceState) return;
    window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);
  }

  function consumeAuthRedirect() {
    const params = new URLSearchParams(String(window.location.hash || '').replace(/^#/, ''));
    const authError = params.get('error_description') || params.get('error');
    if (authError) {
      clearAuthRedirect();
      throw new Error(authError);
    }
    if (!params.get('access_token') || !params.get('refresh_token')) return null;
    const session = saveSession({
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in: params.get('expires_in'),
      expires_at: params.get('expires_at')
    });
    clearAuthRedirect();
    return session;
  }

  function loadSession() {
    try {
      return normalizeSession(JSON.parse(localStorage.getItem(SESSION_KEY)));
    } catch {
      return null;
    }
  }

  function saveSession(session) {
    const normalized = normalizeSession(session);
    if (!normalized) throw new Error('ログイン情報を確認できませんでした。');
    localStorage.setItem(SESSION_KEY, JSON.stringify(normalized));
    return normalized;
  }

  function clearSession() {
    localStorage.removeItem(SESSION_KEY);
  }

  async function responseError(response, fallback) {
    try {
      const body = await response.json();
      return new Error(String(body.error_description || body.msg || body.message || body.error || fallback));
    } catch {
      return new Error(fallback);
    }
  }

  function requireConfig() {
    if (!activeConfig?.enabled) throw new Error('クラウド接続がまだ設定されていません。');
    return activeConfig;
  }

  async function refreshSession(session) {
    const config = requireConfig();
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    if (!response.ok) throw await responseError(response, 'ログインの有効期限を更新できませんでした。');
    return saveSession(await response.json());
  }

  async function getFreshSession() {
    const session = loadSession();
    if (!session) return null;
    if (session.expires_at > Date.now() / 1000 + SESSION_REFRESH_MARGIN_SECONDS) return session;
    return refreshSession(session);
  }

  function countFromResponse(response) {
    const contentRange = response.headers.get('content-range') || '';
    const total = Number(contentRange.split('/').pop());
    if (!Number.isFinite(total)) throw new Error('クラウドの件数を確認できませんでした。');
    return total;
  }

  async function authenticatedFetch(path, session, options = {}) {
    const config = requireConfig();
    const response = await fetch(`${config.supabaseUrl}${path}`, {
      ...options,
      cache: 'no-store',
      headers: {
        apikey: config.publishableKey,
        Authorization: `Bearer ${session.access_token}`,
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw await responseError(response, `クラウドデータを読み取れません（HTTP ${response.status}）。`);
    return response;
  }

  async function countRows(table, filters, session) {
    const query = new URLSearchParams({ select: 'id', ...filters });
    const response = await authenticatedFetch(`/rest/v1/${table}?${query}`, session, {
      method: 'GET',
      headers: { Prefer: 'count=exact', Range: '0-0', 'Range-Unit': 'items' }
    });
    return countFromResponse(response);
  }

  async function readAuthenticatedUser(session) {
    const response = await authenticatedFetch('/auth/v1/user', session, { method: 'GET' });
    const user = await response.json();
    return { id: String(user?.id || ''), email: String(user?.email || '') };
  }

  async function verifyStoreLink(session) {
    const config = requireConfig();
    const query = new URLSearchParams({
      select: 'store_id',
      app_key: `eq.${config.appKey}`,
      legacy_store_id: `eq.${config.legacyStoreId}`,
      store_id: `eq.${config.supabaseStoreId}`,
      limit: '1'
    });
    const response = await authenticatedFetch(`/rest/v1/app_store_links?${query}`, session, { method: 'GET' });
    const rows = await response.json();
    return Array.isArray(rows) && rows.length === 1;
  }

  async function readCloudCounts(session) {
    const config = requireConfig();
    if (!await verifyStoreLink(session)) throw new Error('このログインでは、やきとり日高のデータを確認できません。');
    const storeFilter = { store_id: `eq.${config.supabaseStoreId}` };
    const [menuItems, visits, storeSettings] = await Promise.all([
      countRows('menu_items', { ...storeFilter, deleted_at: 'is.null' }, session),
      countRows('visits', { ...storeFilter, deleted_at: 'is.null' }, session),
      countRows('store_settings', storeFilter, session)
    ]);
    return { menuItems, visits, storeSettings };
  }

  function assertActiveSession(session) {
    if (loadSession()?.access_token !== session.access_token) throw new Error('ログイン状態が変わりました。もう一度操作してください。');
  }

  async function backupContext() {
    const config = requireConfig();
    const session = await getFreshSession();
    if (!session) throw new Error('先にクラウドへログインしてください。');
    const user = await readAuthenticatedUser(session);
    if (!user.id || !await verifyStoreLink(session)) throw new Error('このログインでは、やきとり日高のデータを確認できません。');
    assertActiveSession(session);
    return { config, session, user };
  }

  async function backupFetch(path, session, options) {
    try {
      return await authenticatedFetch(path, session, options);
    } catch (error) {
      if (/PGRST205|42P01|could not find the table.*hidaka_manual_backups|relation .*hidaka_manual_backups.*does not exist/i.test(error.message)) {
        throw new Error('クラウドのバックアップ保存先が未設定です。専用テーブルの設定後にご利用ください。端末データは変更していません。');
      }
      throw error;
    }
  }

  function validateBackupRow(row, { config, user }, includePayload) {
    if (!row || row.user_id !== user.id || row.app_key !== config.appKey || row.store_id !== config.supabaseStoreId
      || !/^[0-9a-f-]{36}$/i.test(row.backup_id || '') || !Number.isFinite(Date.parse(row.updated_at))) {
      throw new Error('クラウドバックアップの所有者または日時を確認できません。');
    }
    for (const key of ['menu_count', 'initial_menu_count', 'history_count', 'store_count', 'stock_count']) {
      if (!Number.isInteger(row[key]) || row[key] < 0) throw new Error('クラウドバックアップの件数が不正です。');
    }
    if (includePayload) {
      const data = row.payload?.data;
      if (row.payload?.format !== 'hidaka-order-full-backup' || row.payload.schemaVersion !== 6 || !data
        || !Array.isArray(data.menu) || !Array.isArray(data.initialMenu) || !Array.isArray(data.history)
        || !Array.isArray(data.stores) || !Array.isArray(data.outOfStock?.ids)
        || data.menu.length !== row.menu_count || data.initialMenu.length !== row.initial_menu_count
        || data.history.length !== row.history_count || data.stores.length !== row.store_count
        || data.outOfStock.ids.length !== row.stock_count) throw new Error('クラウドバックアップの内容と件数が一致しません。');
    }
    return row;
  }

  const BACKUP_METADATA = 'user_id,app_key,store_id,backup_id,updated_at,menu_count,initial_menu_count,history_count,store_count,stock_count';
  async function readManualBackup(includePayload = false) {
    const context = await backupContext();
    const { config, session, user } = context;
    const query = new URLSearchParams({ select: BACKUP_METADATA + (includePayload ? ',payload' : ''), user_id: `eq.${user.id}`, app_key: `eq.${config.appKey}`, store_id: `eq.${config.supabaseStoreId}`, limit: '1' });
    const response = await backupFetch(`/rest/v1/${BACKUP_TABLE}?${query}`, session, { method: 'GET' });
    const rows = await response.json();
    assertActiveSession(session);
    if (!Array.isArray(rows) || rows.length > 1) throw new Error('バックアップの応答が不正です。');
    return rows.length ? validateBackupRow(rows[0], context, includePayload) : null;
  }

  // 呼び出し元は「クラウドへバックアップ」クリック時のみ。再送キューは持たない。
  async function saveManualBackup(payload) {
    if (requireConfig().mode !== MANUAL_BACKUP_MODE) throw new Error('手動バックアップの接続設定がまだ有効になっていません。');
    const frozenPayload = JSON.parse(JSON.stringify(payload));
    if (frozenPayload?.format !== 'hidaka-order-full-backup' || frozenPayload.schemaVersion !== 6
      || !Array.isArray(frozenPayload.data?.menu) || !Array.isArray(frozenPayload.data?.history)) throw new Error('完全バックアップの形式を確認できません。');
    if (new TextEncoder().encode(JSON.stringify(frozenPayload)).length > 8 * 1024 * 1024) throw new Error('バックアップが大きすぎます（上限8MB）。端末JSONバックアップをご利用ください。');
    const context = await backupContext();
    const { config, session, user } = context;
    const backupId = crypto.randomUUID();
    const query = new URLSearchParams({ on_conflict: 'user_id,app_key,store_id', select: BACKUP_METADATA });
    const response = await backupFetch(`/rest/v1/${BACKUP_TABLE}?${query}`, session, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
      body: JSON.stringify({ user_id: user.id, app_key: config.appKey, store_id: config.supabaseStoreId, backup_id: backupId, payload: frozenPayload })
    });
    const rows = await response.json();
    assertActiveSession(session);
    if (!Array.isArray(rows) || rows.length !== 1 || rows[0].backup_id !== backupId) throw new Error('保存結果を確認できません。件数確認で最新バックアップを確認してください。');
    return validateBackupRow(rows[0], context, false);
  }

  async function confirmBackupOwner(userId) {
    const { user } = await backupContext();
    if (user.id !== userId) throw new Error('確認画面を開いた時と利用者が異なります。もう一度復元を選んでください。');
  }

  async function verifyRead() {
    const session = await getFreshSession();
    if (!session) throw new Error('先にクラウドへログインしてください。');
    updateStatus({ state: 'checking', label: 'クラウド読取確認中（保存は端末）', authenticated: true });
    let userEmail = '';
    try {
      const user = await readAuthenticatedUser(session);
      userEmail = user.email;
      const cloudCounts = await readCloudCounts(session);
      return updateStatus({
        state: 'signed-in',
        label: 'ログイン・読取確認済み（保存は端末）',
        configured: true,
        reachable: true,
        authenticated: true,
        userEmail,
        cloudCounts,
        error: ''
      });
    } catch (error) {
      const nextError = Object.assign(error instanceof Error ? error : new Error(String(error)), { signedIn: true });
      updateStatus({
        state: 'read-error',
        label: 'ログイン済み・読取未確認（保存は端末）',
        authenticated: true,
        userEmail,
        error: nextError.message
      });
      throw nextError;
    }
  }

  async function sendMagicLink(email) {
    const config = requireConfig();
    const normalizedEmail = String(email || '').trim();
    if (!normalizedEmail) throw new Error('メールアドレスを入力してください。');
    updateStatus({ state: 'checking', label: 'ログイン用メール送信中（保存は端末）', authenticated: false, error: '' });
    const redirectTo = authRedirectUrl();
    const response = await fetch(`${config.supabaseUrl}/auth/v1/otp?redirect_to=${encodeURIComponent(redirectTo)}`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email: normalizedEmail, create_user: false })
    });
    if (!response.ok) {
      const error = await responseError(response, 'ログイン用メールを送信できませんでした。');
      updateStatus({ state: 'auth-error', label: '未ログイン（保存は端末）', authenticated: false, userEmail: '', error: error.message });
      throw error;
    }
    return updateStatus({
      state: 'link-sent',
      label: 'ログイン用メール送信済み（保存は端末）',
      configured: true,
      reachable: true,
      authenticated: false,
      userEmail: '',
      loginEmailSent: true,
      error: ''
    });
  }

  function parseMagicLink(value) {
    const config = requireConfig();
    let url;
    try {
      url = new URL(String(value || '').trim());
    } catch {
      throw new Error('メールに届いたログインリンクを貼り付けてください。');
    }
    if (url.origin !== config.supabaseUrl || url.pathname !== '/auth/v1/verify') {
      throw new Error('この日高オーダー用のログインリンクではありません。');
    }
    const tokenHash = String(url.searchParams.get('token') || '');
    const type = String(url.searchParams.get('type') || '');
    if (!tokenHash || type !== 'magiclink') throw new Error('ログインリンクの内容を確認できません。');
    return { tokenHash, type };
  }

  async function verifyMagicLink(value) {
    const config = requireConfig();
    const { tokenHash, type } = parseMagicLink(value);
    updateStatus({ state: 'checking', label: 'ログイン確認中（保存は端末）', authenticated: false, error: '' });
    const response = await fetch(`${config.supabaseUrl}/auth/v1/verify`, {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: config.publishableKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ token_hash: tokenHash, type })
    });
    if (!response.ok) {
      clearSession();
      const error = await responseError(response, 'ログインリンクを確認できませんでした。');
      updateStatus({ state: 'auth-error', label: '未ログイン（保存は端末）', authenticated: false, userEmail: '', error: error.message });
      throw error;
    }
    saveSession(await response.json());
    try {
      return await verifyRead();
    } catch (error) {
      clearSession();
      updateStatus({ state: 'auth-error', label: '対象データ未確認（保存は端末）', authenticated: false, userEmail: '', cloudCounts: null, error: error.message });
      throw error;
    }
  }

  async function signOut() {
    const config = requireConfig();
    const session = loadSession();
    try {
      if (session) {
        await fetch(`${config.supabaseUrl}/auth/v1/logout?scope=local`, {
          method: 'POST',
          cache: 'no-store',
          headers: {
            apikey: config.publishableKey,
            Authorization: `Bearer ${session.access_token}`
          }
        });
      }
    } finally {
      clearSession();
    }
    return updateStatus({
      state: 'ready',
      label: '接続確認済み・未ログイン（保存は端末）',
      authenticated: false,
      userEmail: '',
      cloudCounts: null,
      error: ''
    });
  }

  async function initializeOnce() {
    updateStatus({ state: 'checking', label: '確認中（保存は端末）' });
    try {
      const config = await loadConfig();
      activeConfig = config.enabled ? config : null;
      if (!config.enabled) {
        return updateStatus({
          state: 'not-configured',
          label: '未設定（保存は端末）',
          configured: false,
          reachable: false,
          authenticated: false,
          userEmail: ''
        });
      }

      const response = await fetch(`${config.supabaseUrl}/auth/v1/health`, {
        method: 'GET',
        cache: 'no-store',
        headers: { apikey: config.publishableKey }
      });
      if (!response.ok) throw new Error(`接続確認に失敗しました（HTTP ${response.status}）。`);

      const readyStatus = {
        state: 'ready',
        label: '接続確認済み・未ログイン（保存は端末）',
        configured: true,
        reachable: true,
        authenticated: false,
        userEmail: '',
        projectHost: new URL(config.supabaseUrl).hostname,
        appKey: config.appKey,
        legacyStoreId: config.legacyStoreId,
        supabaseStoreId: config.supabaseStoreId,
        cloudCounts: null,
        error: ''
      };
      updateStatus(readyStatus);
      let session;
      try {
        session = consumeAuthRedirect() || loadSession();
      } catch (error) {
        clearSession();
        return updateStatus({ ...readyStatus, state: 'auth-error', label: 'ログインリンクを確認できません（保存は端末）', error: error.message });
      }
      if (!session) return { ...status };

      try {
        return await verifyRead();
      } catch (error) {
        console.warn('前回のクラウドログインを復元できませんでした。', error);
        clearSession();
        return updateStatus({ ...readyStatus, label: '再ログインが必要（保存は端末）' });
      }
    } catch (error) {
      console.warn('Supabase接続はまだ有効化されていません。端末内保存を継続します。', error);
      activeConfig = null;
      return updateStatus({
        state: 'error',
        label: '接続未確認（保存は端末）',
        configured: true,
        reachable: false,
        authenticated: false,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  function initialize() {
    if (!initializationPromise) initializationPromise = initializeOnce();
    return initializationPromise;
  }

  window.HidakaSupabase = {
    initialize,
    sendMagicLink,
    verifyMagicLink,
    signOut,
    verifyRead,
    readBackupInfo: () => readManualBackup(false),
    readBackup: () => readManualBackup(true),
    saveManualBackup,
    confirmBackupOwner,
    getStatus: () => ({ ...status })
  };
})();
