import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  BookOpenText,
  ChartLineUp,
  CheckCircle,
  Database,
  Funnel,
  GlobeHemisphereEast,
  LockKey,
  MagnifyingGlass,
  Plug,
  ShieldCheck,
  TrendUp,
  WarningCircle
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import "./styles.css";

const FALLBACK_API_URL = "http://127.0.0.1:8787";
const LEGACY_API_BASE_KEY = "apiUrl";
const API_BASE_KEY = "hot-products-monitor-api-base";
const API_BASE_MANUAL_KEY = "hot-products-monitor-api-base-manual";
const SESSION_TOKEN_KEY = "hot-products-monitor-session-token";
const SESSION_USER_KEY = "hot-products-monitor-session-user";
const DEFAULT_SESSION_TOKEN = sessionStorage.getItem(SESSION_TOKEN_KEY) || sessionStorage.getItem("sessionToken") || "";
const DEFAULT_SESSION_USER = sessionStorage.getItem(SESSION_USER_KEY) || sessionStorage.getItem("sessionUser") || "";

function normalizeApiUrl(value) {
  return (value || "").trim().replace(/\/+$/, "");
}

function clearManualApiBase() {
  localStorage.removeItem(API_BASE_KEY);
  localStorage.removeItem(API_BASE_MANUAL_KEY);
}

function readConfiguredApiBase(defaultApiBase) {
  if (localStorage.getItem(API_BASE_MANUAL_KEY) === "1") {
    return normalizeApiUrl(localStorage.getItem(API_BASE_KEY)) || defaultApiBase;
  }
  return defaultApiBase;
}

function rememberApiBase(candidate, defaultApiBase) {
  const normalized = normalizeApiUrl(candidate);
  const normalizedDefault = normalizeApiUrl(defaultApiBase) || FALLBACK_API_URL;

  if (normalized && normalized !== normalizedDefault) {
    localStorage.setItem(API_BASE_KEY, normalized);
    localStorage.setItem(API_BASE_MANUAL_KEY, "1");
    return normalized;
  }

  clearManualApiBase();
  return normalizedDefault;
}

function formatConnectionError(error) {
  if (error instanceof TypeError || error.message === "Failed to fetch") {
    return new Error("无法连接后端，请确认 API 地址或 tunnel 服务正在运行");
  }
  return error;
}

async function loadRuntimeConfig() {
  const inlineApiBase = normalizeApiUrl(window.MONITOR_CONFIG?.defaultApiBase);
  if (inlineApiBase) return inlineApiBase;

  try {
    const configUrl = new URL("config.json", window.location.href);
    configUrl.searchParams.set("t", Date.now().toString());
    const response = await fetch(configUrl, { cache: "no-store" });
    if (!response.ok) return FALLBACK_API_URL;
    const config = await response.json();
    return normalizeApiUrl(config.defaultApiBase) || FALLBACK_API_URL;
  } catch {
    return FALLBACK_API_URL;
  }
}

async function requestApi(apiUrl, path, options = {}) {
  const base = normalizeApiUrl(apiUrl);
  if (!base) throw new Error("缺少后端 API 地址");

  const { token, headers, ...fetchOptions } = options;
  const requestHeaders = { ...(headers || {}) };
  if (token) requestHeaders.Authorization = `Bearer ${token}`;

  return fetch(`${base}${path}`, {
    ...fetchOptions,
    headers: requestHeaders
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(value));
}

function formatPercent(value, digits = 1) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatTrend(value, suffix = "%") {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}${suffix}`;
}

function compactNumber(value) {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

async function loadApiSnapshot(apiUrl, sessionToken) {
  const response = await requestApi(apiUrl, "/api/snapshot", { token: sessionToken });
  if (!response.ok) {
    throw new Error(response.status === 401 ? "登录已过期，请重新登录" : `后端 API 返回 ${response.status}`);
  }
  return response.json();
}

function useSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [source, setSource] = useState("local-api");
  const [status, setStatus] = useState({ state: "loading", message: "正在读取后端配置" });
  const [configLoaded, setConfigLoaded] = useState(false);
  const [defaultApiUrl, setDefaultApiUrl] = useState(FALLBACK_API_URL);
  const [apiUrl, setApiUrlState] = useState(readConfiguredApiBase(FALLBACK_API_URL));
  const [username, setUsername] = useState(DEFAULT_SESSION_USER);
  const [password, setPassword] = useState("");
  const [sessionToken, setSessionToken] = useState(DEFAULT_SESSION_TOKEN);
  const [sessionUser, setSessionUser] = useState(DEFAULT_SESSION_USER);

  useEffect(() => {
    let mounted = true;
    const hasInitialSession = Boolean(DEFAULT_SESSION_TOKEN);
    loadRuntimeConfig().then((configuredApiBase) => {
      if (!mounted) return;
      const normalizedDefault = normalizeApiUrl(configuredApiBase) || FALLBACK_API_URL;
      localStorage.removeItem(LEGACY_API_BASE_KEY);
      setDefaultApiUrl(normalizedDefault);
      setApiUrlState(readConfiguredApiBase(normalizedDefault));
      setConfigLoaded(true);
      setStatus({
        state: hasInitialSession ? "loading" : "idle",
        message: hasInitialSession ? "恢复登录会话" : "请登录后访问数据"
      });
    });
    return () => {
      mounted = false;
    };
  }, []);

  const requestWithFallback = useCallback(async (path, options = {}, retryDefault = true, baseOverride = "") => {
    const base = normalizeApiUrl(baseOverride) || normalizeApiUrl(apiUrl) || defaultApiUrl;
    try {
      return {
        response: await requestApi(base, path, options),
        baseUrl: base
      };
    } catch (error) {
      const storedBase = normalizeApiUrl(localStorage.getItem(API_BASE_KEY));
      const canRetryDefault = retryDefault
        && localStorage.getItem(API_BASE_MANUAL_KEY) === "1"
        && storedBase
        && defaultApiUrl
        && storedBase !== defaultApiUrl;

      if (!canRetryDefault) {
        throw formatConnectionError(error);
      }

      clearManualApiBase();
      setApiUrlState(defaultApiUrl);
      try {
        return {
          response: await requestApi(defaultApiUrl, path, options),
          baseUrl: defaultApiUrl
        };
      } catch (defaultError) {
        throw formatConnectionError(defaultError);
      }
    }
  }, [apiUrl, defaultApiUrl]);

  useEffect(() => {
    let mounted = true;
    if (!configLoaded || !sessionToken) return () => {
      mounted = false;
    };

    setStatus({ state: "loading", message: "恢复登录会话" });
    requestWithFallback("/api/snapshot", { token: sessionToken })
      .then(async ({ response, baseUrl }) => {
        if (!mounted) return;
        if (!response.ok) {
          throw new Error(response.status === 401 ? "登录已过期，请重新登录" : `后端 API 返回 ${response.status}`);
        }
        const data = await response.json();
        setSnapshot(data);
        setSource("local-api");
        setApiUrlState(baseUrl);
        setStatus({ state: "ready", message: "已连接后端 API" });
      })
      .catch((error) => {
        if (!mounted) return;
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
        sessionStorage.removeItem(SESSION_USER_KEY);
        sessionStorage.removeItem("sessionToken");
        sessionStorage.removeItem("sessionUser");
        setSessionToken("");
        setSessionUser("");
        setSnapshot(null);
        setStatus({ state: "idle", message: error.message || "登录已过期，请重新登录" });
      });
    return () => {
      mounted = false;
    };
  }, [configLoaded, requestWithFallback, sessionToken]);

  function setApiUrl(value) {
    setApiUrlState(value);
  }

  async function login() {
    if (!configLoaded) {
      setStatus({ state: "loading", message: "后端配置尚未加载，请稍后再试" });
      return;
    }

    const loginBaseUrl = rememberApiBase(apiUrl, defaultApiUrl);
    setApiUrlState(loginBaseUrl);
    setStatus({ state: "loading", message: "正在登录" });
    try {
      const { response: loginResponse, baseUrl } = await requestWithFallback("/api/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ username, password })
      }, true, loginBaseUrl);
      if (!loginResponse.ok) {
        throw new Error("账号或密码不正确");
      }
      const session = await loginResponse.json();
      sessionStorage.setItem(SESSION_TOKEN_KEY, session.token);
      sessionStorage.setItem(SESSION_USER_KEY, session.user.username);
      sessionStorage.removeItem("sessionToken");
      sessionStorage.removeItem("sessionUser");
      setSessionToken(session.token);
      setSessionUser(session.user.username);
      setPassword("");
      const data = await loadApiSnapshot(baseUrl, session.token);
      setSnapshot(data);
      setSource("local-api");
      setApiUrlState(baseUrl);
      setStatus({ state: "ready", message: "已连接后端 API" });
    } catch (error) {
      setStatus({ state: "error", message: error.message });
    }
  }

  function logout() {
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
    sessionStorage.removeItem(SESSION_USER_KEY);
    sessionStorage.removeItem("sessionToken");
    sessionStorage.removeItem("sessionUser");
    setSessionToken("");
    setSessionUser("");
    setSnapshot(null);
    setPassword("");
    setStatus({ state: "idle", message: "已退出登录" });
  }

  async function refresh() {
    if (!sessionToken) {
      setStatus({ state: "error", message: "请先登录后再刷新" });
      return;
    }
    setStatus({ state: "loading", message: "触发后端刷新" });
    try {
      const { response, baseUrl } = await requestWithFallback("/api/refresh", {
        method: "POST",
        token: sessionToken
      });
      if (!response.ok) {
        throw new Error(`刷新请求返回 ${response.status}`);
      }
      setApiUrlState(baseUrl);
      setStatus({ state: "ready", message: "刷新已提交，稍后重新连接" });
    } catch (error) {
      setStatus({ state: "error", message: error.message });
    }
  }

  return {
    snapshot,
    source,
    status,
    apiUrl,
    username,
    password,
    sessionToken,
    sessionUser,
    setApiUrl,
    setUsername,
    setPassword,
    login,
    logout,
    refresh
  };
}

function App() {
  const {
    snapshot,
    source,
    status,
    apiUrl,
    username,
    password,
    sessionToken,
    sessionUser,
    setApiUrl,
    setUsername,
    setPassword,
    login,
    logout,
    refresh
  } = useSnapshot();
  const [regionId, setRegionId] = useState("all");
  const [platformId, setPlatformId] = useState("all");
  const [tierId, setTierId] = useState("15-30");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [query, setQuery] = useState("");

  const filteredProducts = useMemo(() => {
    if (!snapshot) return [];
    const rows = snapshot.tierRanks.flatMap((tier) => tier.products);
    return rows
      .filter((product) => regionId === "all" || product.regionId === regionId)
      .filter((product) => platformId === "all" || product.platformId === platformId)
      .filter((product) => tierId === "all" || product.priceTierId === tierId)
      .filter((product) => {
        if (!query.trim()) return true;
        const text = `${product.title} ${product.categoryName} ${product.platformName} ${product.regionName}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
      .map((product, index) => ({ ...product, rank: index + 1 }));
  }, [snapshot, regionId, platformId, tierId, query]);

  const selectedProduct = useMemo(() => {
    if (!snapshot) return null;
    const rows = snapshot.tierRanks.flatMap((tier) => tier.products);
    return rows.find((product) => product.id === selectedProductId) || filteredProducts[0] || null;
  }, [snapshot, selectedProductId, filteredProducts]);

  useEffect(() => {
    if (filteredProducts[0] && !filteredProducts.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(filteredProducts[0].id);
    }
  }, [filteredProducts, selectedProductId]);

  if (!snapshot) {
    return (
      <LoginShell
        status={status}
        apiUrl={apiUrl}
        username={username}
        password={password}
        setApiUrl={setApiUrl}
        setUsername={setUsername}
        setPassword={setPassword}
        login={login}
      />
    );
  }

  const platforms = regionId === "all"
    ? snapshot.regions.flatMap((region) => region.platforms)
    : snapshot.regions.find((region) => region.id === regionId)?.platforms || [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-line">
            <GlobeHemisphereEast size={22} weight="duotone" />
            <span>海外电商平台爆品监控</span>
          </div>
          <p>按区域、平台和价格带追踪90天销量、搜索、成单率与客单价趋势。</p>
        </div>
        <StatusPill status={status} source={source} generatedAt={snapshot.generatedAt} sessionUser={sessionUser} />
      </header>

      <main>
        <section className="control-panel" aria-label="连接与筛选">
          <div className="api-card">
            <div className="section-title">
              <Plug size={18} weight="duotone" />
              <span>后端连接</span>
            </div>
            <div className="api-grid">
              <label>
                API 地址
                <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
              </label>
              <label>
                登录会话
                <input
                  type="password"
                  value={sessionToken ? "已登录，会话保存在当前标签页" : ""}
                  readOnly
                  placeholder="登录后自动生成"
                />
              </label>
              <button className="primary-button" onClick={logout} type="button">
                <LockKey size={16} weight="bold" />
                退出
              </button>
              <button className="secondary-button" onClick={refresh} type="button">
                <ArrowClockwise size={16} weight="bold" />
                刷新
              </button>
            </div>
          </div>

          <div className="filter-card">
            <div className="section-title">
              <Funnel size={18} weight="duotone" />
              <span>筛选维度</span>
            </div>
            <div className="filter-grid">
              <label>
                区域
                <select
                  value={regionId}
                  onChange={(event) => {
                    setRegionId(event.target.value);
                    setPlatformId("all");
                  }}
                >
                  <option value="all">全部区域</option>
                  {snapshot.regions.map((region) => (
                    <option key={region.id} value={region.id}>
                      {region.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                平台
                <select value={platformId} onChange={(event) => setPlatformId(event.target.value)}>
                  <option value="all">全部平台</option>
                  {platforms.map((platform) => (
                    <option key={platform.id} value={platform.id}>
                      {platform.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                价格带
                <select value={tierId} onChange={(event) => setTierId(event.target.value)}>
                  <option value="all">全部价格带</option>
                  {snapshot.priceTiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                搜索
                <span className="search-box">
                  <MagnifyingGlass size={15} weight="bold" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="品类、平台、商品" />
                </span>
              </label>
            </div>
          </div>
        </section>

        <MetricStrip snapshot={snapshot} />

        <section className="dashboard-grid">
          <PlatformCoverage snapshot={snapshot} />
          <TopProducts
            products={filteredProducts}
            selectedProductId={selectedProduct?.id}
            onSelect={setSelectedProductId}
          />
        </section>

        <section className="detail-grid">
          <ProductDetail product={selectedProduct} />
          <WikiPanel snapshot={snapshot} />
        </section>

        <section className="source-section">
          <SourcePanel snapshot={snapshot} />
          <SecurityPanel />
        </section>
      </main>
    </div>
  );
}

function LoginShell({ status, apiUrl, username, password, setApiUrl, setUsername, setPassword, login }) {
  function handleSubmit(event) {
    event.preventDefault();
    login();
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-line">
            <Database size={22} weight="duotone" />
            <span>海外电商平台爆品监控</span>
          </div>
          <p>请先使用监控面板账号密码登录，后端认证通过后才会返回数据。</p>
        </div>
        <div className={`status-pill ${status.state}`}>
          <LockKey size={18} weight="bold" />
          <div>
            <strong>{status.message}</strong>
            <span>会话只保存在当前浏览器标签页</span>
          </div>
        </div>
      </header>
      <main>
        <section className="login-panel" aria-label="登录">
          <form className="login-card" onSubmit={handleSubmit}>
            <div className="panel-heading">
              <div>
                <h1>登录监控面板</h1>
                <p>账号密码由本机后端环境变量管理，不会写入 GitHub Pages 或前端代码。</p>
              </div>
            </div>
            <label>
              API 地址
              <input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} />
            </label>
            <label>
              账号
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
            </label>
            <label>
              密码
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button className="primary-button" type="submit">
              <LockKey size={16} weight="bold" />
              登录
            </button>
          </form>
        </section>
      </main>
    </div>
  );
}

function StatusPill({ status, source, generatedAt, sessionUser }) {
  const Icon = status.state === "error" ? WarningCircle : status.state === "loading" ? ArrowClockwise : CheckCircle;
  return (
    <div className={`status-pill ${status.state}`}>
      <Icon size={18} weight="bold" />
      <div>
        <strong>{status.message}</strong>
        <span>
          {source === "local-api" ? `后端 API / ${sessionUser}` : "静态快照"} / {new Date(generatedAt).toLocaleString("zh-CN")}
        </span>
      </div>
    </div>
  );
}

function MetricStrip({ snapshot }) {
  const totals = useMemo(() => {
    const products = snapshot.tierRanks.flatMap((tier) => tier.products);
    return {
      products: products.length,
      platforms: snapshot.regions.reduce((sum, region) => sum + region.platforms.length, 0),
      sales: products.reduce((sum, product) => sum + product.summary.sales90d, 0),
      search: products.reduce((sum, product) => sum + product.summary.search90d, 0)
    };
  }, [snapshot]);

  const metrics = [
    { label: "监控区域", value: snapshot.regions.length, icon: GlobeHemisphereEast },
    { label: "数据平台", value: totals.platforms, icon: Database },
    { label: "价格带榜单", value: snapshot.priceTiers.length, icon: ChartLineUp },
    { label: "90天销量", value: compactNumber(totals.sales), icon: TrendUp },
    { label: "90天搜索", value: compactNumber(totals.search), icon: MagnifyingGlass }
  ];

  return (
    <section className="metric-strip" aria-label="核心指标">
      {metrics.map((metric) => {
        const Icon = metric.icon;
        return (
          <div className="metric-cell" key={metric.label}>
            <Icon size={19} weight="duotone" />
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </div>
        );
      })}
    </section>
  );
}

function PlatformCoverage({ snapshot }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>区域平台覆盖</h2>
          <p>Top5平台按公开资料和可接入性排序，份额口径在来源中标注。</p>
        </div>
      </div>
      <div className="region-list">
        {snapshot.regions.map((region) => (
          <article className="region-block" key={region.id}>
            <div className="region-heading">
              <strong>{region.name}</strong>
              <span>{region.basis}</span>
            </div>
            <div className="platform-list">
              {region.platforms.map((platform) => (
                <div className="platform-row" key={platform.id}>
                  <span className="rank-mark">{platform.rank}</span>
                  <span className="platform-name">{platform.name}</span>
                  <span className="platform-share">
                    {platform.marketSharePercent ? `${platform.marketSharePercent}%` : `权重 ${platform.platformWeight}`}
                  </span>
                  <span className={`confidence ${platform.confidence}`}>{platform.confidence}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function TopProducts({ products, selectedProductId, onSelect }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>爆品分组 Top10</h2>
          <p>按销量、搜索、成单率、客单价和趋势动量综合评分。</p>
        </div>
      </div>
      {products.length === 0 ? (
        <div className="empty-state">没有符合筛选条件的商品。</div>
      ) : (
        <div className="product-table" role="table" aria-label="爆品排名">
          <div className="product-table-head" role="row">
            <span>排名</span>
            <span>商品</span>
            <span>评分</span>
            <span>90天销量</span>
            <span>搜索增速</span>
          </div>
          {products.map((product) => (
            <button
              className={`product-row ${selectedProductId === product.id ? "active" : ""}`}
              key={product.id}
              onClick={() => onSelect(product.id)}
              type="button"
            >
              <span className="rank-mark">{product.rank}</span>
              <span>
                <strong>{product.title}</strong>
                <small>
                  {product.regionName} / {product.platformName} / {product.priceTierLabel}
                </small>
              </span>
              <span className="score-value">{product.score}</span>
              <span>{formatNumber(product.summary.sales90d)}</span>
              <span className={product.summary.searchChange >= 0 ? "trend-up" : "trend-down"}>
                {formatTrend(product.summary.searchChange)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function ProductDetail({ product }) {
  const [metric, setMetric] = useState("salesUnits");

  useEffect(() => {
    setMetric("salesUnits");
  }, [product?.id]);

  if (!product) {
    return (
      <section className="panel large-panel">
        <div className="empty-state">选择一个商品查看90天趋势。</div>
      </section>
    );
  }

  const metricOptions = [
    { id: "salesUnits", label: "销量", color: "#186b63" },
    { id: "searchVolume", label: "搜索", color: "#2f5f9f" },
    { id: "conversionRate", label: "成单率", color: "#8a5a18" },
    { id: "averageOrderValue", label: "客单价", color: "#7c4d63" }
  ];
  const activeMetric = metricOptions.find((option) => option.id === metric);

  const chartRows = product.trend.map((point) => ({
    ...point,
    conversionRate: point.conversionRate * 100
  }));

  return (
    <section className="panel large-panel">
      <div className="panel-heading">
        <div>
          <h2>{product.title}</h2>
          <p>
            {product.regionName} / {product.platformName} / {product.categoryName} / {product.priceTierLabel}
          </p>
        </div>
        <strong className="detail-score">{product.score}</strong>
      </div>

      <div className="summary-grid">
        <SummaryCell label="90天销量" value={formatNumber(product.summary.sales90d)} trend={formatTrend(product.summary.salesChange)} />
        <SummaryCell label="90天搜索" value={formatNumber(product.summary.search90d)} trend={formatTrend(product.summary.searchChange)} />
        <SummaryCell
          label="当前成单率"
          value={formatPercent(product.summary.conversionRate)}
          trend={`${product.summary.conversionChange > 0 ? "+" : ""}${product.summary.conversionChange.toFixed(2)}pp`}
        />
        <SummaryCell
          label="当前客单价"
          value={`$${product.summary.averageOrderValue.toFixed(2)}`}
          trend={formatTrend(product.summary.aovChange)}
        />
      </div>

      <div className="metric-tabs" role="tablist" aria-label="趋势指标">
        {metricOptions.map((option) => (
          <button
            className={metric === option.id ? "active" : ""}
            key={option.id}
            onClick={() => setMetric(option.id)}
            type="button"
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={chartRows} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={activeMetric.color} stopOpacity={0.22} />
                <stop offset="95%" stopColor={activeMetric.color} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(43, 54, 58, 0.11)" />
            <XAxis dataKey="date" minTickGap={28} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={46} />
            <Tooltip content={<TrendTooltip metric={metric} />} />
            <Area
              type="monotone"
              dataKey={metric}
              stroke={activeMetric.color}
              strokeWidth={2}
              fill="url(#metricFill)"
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="logic-note">
        <BookOpenText size={19} weight="duotone" />
        <span>{product.selectionLogic}</span>
      </div>
    </section>
  );
}

function SummaryCell({ label, value, trend }) {
  const positive = trend.trim().startsWith("+");
  return (
    <div className="summary-cell">
      <span>{label}</span>
      <strong>{value}</strong>
      <small className={positive ? "trend-up" : "trend-down"}>{trend}</small>
    </div>
  );
}

function TrendTooltip({ active, payload, label, metric }) {
  if (!active || !payload?.length) return null;
  const value = payload[0].value;
  const formatted = metric === "conversionRate" ? `${value.toFixed(2)}%` : metric === "averageOrderValue" ? `$${value.toFixed(2)}` : formatNumber(value);
  return (
    <div className="tooltip">
      <strong>{label}</strong>
      <span>{formatted}</span>
    </div>
  );
}

function WikiPanel({ snapshot }) {
  return (
    <section className="panel wiki-panel">
      <div className="panel-heading">
        <div>
          <h2>选品 Wiki</h2>
          <p>把爆品逻辑沉淀为可复用判断规则。</p>
        </div>
      </div>
      <div className="wiki-list">
        {snapshot.wikiSignals.map((signal) => (
          <article key={signal.categoryId}>
            <div>
              <strong>{signal.categoryName}</strong>
              <span>均分 {signal.averageScore}</span>
            </div>
            <p>{signal.observedPattern}</p>
            <small>
              价格带：{signal.winningPriceTiers.join("、")} / 平台：{signal.leadingPlatforms.join("、")}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}

function SourcePanel({ snapshot }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>来源与口径</h2>
          <p>公开资料只用于平台覆盖和初始权重，真实经营数据需接入授权数据源。</p>
        </div>
      </div>
      <div className="source-list">
        {snapshot.sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
            <strong>{source.title}</strong>
            <span>{source.observed}</span>
          </a>
        ))}
      </div>
    </section>
  );
}

function SecurityPanel() {
  return (
    <section className="panel security-panel">
      <div className="panel-heading">
        <div>
          <h2>安全部署</h2>
          <p>前端公开，后端绑定本机地址，模型和平台密钥只留在后端。</p>
        </div>
      </div>
      <div className="security-list">
        <div>
          <ShieldCheck size={20} weight="duotone" />
          <span>后端绑定 127.0.0.1，通过 HTTPS tunnel 转发。</span>
        </div>
        <div>
          <ShieldCheck size={20} weight="duotone" />
          <span>所有数据 API 请求必须带登录会话。</span>
        </div>
        <div>
          <ShieldCheck size={20} weight="duotone" />
          <span>CORS 只允许 GitHub Pages 和本地开发源。</span>
        </div>
        <div>
          <ShieldCheck size={20} weight="duotone" />
          <span>模型只在手动运行 refresh:ai 时调用。</span>
        </div>
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
