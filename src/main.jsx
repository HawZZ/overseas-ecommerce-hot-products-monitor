import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowClockwise,
  BellRinging,
  ChartLineUp,
  CheckCircle,
  Database,
  Funnel,
  GlobeHemisphereEast,
  ListChecks,
  LockKey,
  MagnifyingGlass,
  MapTrifold,
  Package,
  Path,
  Plug,
  ShieldCheck,
  ShoppingCart,
  Sparkle,
  Tag,
  WarningCircle
} from "@phosphor-icons/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
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

  const buildApiBase = normalizeApiUrl(import.meta.env?.VITE_DEFAULT_API_BASE);
  if (buildApiBase) return buildApiBase;

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
  return new Intl.NumberFormat("zh-CN").format(Math.round(Number(value) || 0));
}

function formatPercent(value, digits = 1) {
  return `${((Number(value) || 0) * 100).toFixed(digits)}%`;
}

function formatTrend(value, suffix = "%") {
  const numeric = Number(value) || 0;
  const sign = numeric > 0 ? "+" : "";
  return `${sign}${numeric.toFixed(1)}${suffix}`;
}

function formatUsdM(value) {
  return `$${formatNumber(Number(value) || 0)}M`;
}

function stageLabel(stage) {
  const labels = {
    scale: "放量",
    test: "测试",
    "fix-margin": "修毛利",
    watch: "观察"
  };
  return labels[stage] || stage || "观察";
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
  const [categoryId, setCategoryId] = useState("all");
  const [tierId, setTierId] = useState("all");
  const [stage, setStage] = useState("all");
  const [selectedProductId, setSelectedProductId] = useState(null);
  const [query, setQuery] = useState("");

  const products = useMemo(() => {
    if (!snapshot) return [];
    const shortlist = snapshot.skuShortlist || snapshot.tierRanks?.flatMap((tier) => tier.products) || [];
    return shortlist
      .filter((product) => regionId === "all" || product.regionId === regionId)
      .filter((product) => categoryId === "all" || product.categoryId === categoryId)
      .filter((product) => tierId === "all" || product.priceTierId === tierId)
      .filter((product) => stage === "all" || product.stage === stage)
      .filter((product) => {
        if (!query.trim()) return true;
        const text = `${product.title} ${product.categoryName} ${product.platformName} ${product.regionName} ${product.priceTierLabel}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
      })
      .sort((a, b) => b.opportunityScore - a.opportunityScore)
      .slice(0, 30)
      .map((product, index) => ({ ...product, rank: index + 1 }));
  }, [snapshot, regionId, categoryId, tierId, stage, query]);

  const selectedProduct = useMemo(() => {
    if (!snapshot) return null;
    const allProducts = snapshot.skuShortlist || snapshot.tierRanks?.flatMap((tier) => tier.products) || [];
    return allProducts.find((product) => product.id === selectedProductId) || products[0] || null;
  }, [snapshot, selectedProductId, products]);

  useEffect(() => {
    if (products[0] && !products.some((product) => product.id === selectedProductId)) {
      setSelectedProductId(products[0].id);
    }
  }, [products, selectedProductId]);

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

  const categories = snapshot.wikiSignals || [];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <div className="brand-line">
            <GlobeHemisphereEast size={22} weight="duotone" />
            <span>海外电商平台爆品监控</span>
          </div>
          <p>用PM组合工作流把区域机会、SKU筛选、趋势口碑和4P动作连成一个工作台。</p>
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
              <button className="primary-button" onClick={refresh} type="button">
                <ArrowClockwise size={16} weight="bold" />
                刷新
              </button>
              <button className="secondary-button" onClick={logout} type="button">
                <LockKey size={16} weight="bold" />
                退出
              </button>
            </div>
          </div>

          <div className="filter-card">
            <div className="section-title">
              <Funnel size={18} weight="duotone" />
              <span>工作台筛选</span>
            </div>
            <div className="filter-grid">
              <label>
                区域
                <select value={regionId} onChange={(event) => setRegionId(event.target.value)}>
                  <option value="all">全部区域</option>
                  {snapshot.regions.map((region) => (
                    <option key={region.id} value={region.id}>{region.name}</option>
                  ))}
                </select>
              </label>
              <label>
                品类
                <select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>
                  <option value="all">全部品类</option>
                  {categories.map((category) => (
                    <option key={category.categoryId} value={category.categoryId}>{category.categoryName}</option>
                  ))}
                </select>
              </label>
              <label>
                价格带
                <select value={tierId} onChange={(event) => setTierId(event.target.value)}>
                  <option value="all">全部价格带</option>
                  {snapshot.priceTiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>{tier.label}</option>
                  ))}
                </select>
              </label>
              <label>
                阶段
                <select value={stage} onChange={(event) => setStage(event.target.value)}>
                  <option value="all">全部阶段</option>
                  <option value="scale">放量</option>
                  <option value="test">测试</option>
                  <option value="watch">观察</option>
                  <option value="fix-margin">修毛利</option>
                </select>
              </label>
              <label className="wide-filter">
                搜索
                <span className="search-box">
                  <MagnifyingGlass size={15} weight="bold" />
                  <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="SKU、品类、平台、区域" />
                </span>
              </label>
            </div>
          </div>
        </section>

        <MetricsCommandCenter snapshot={snapshot} />
        <DataQualityBanner snapshot={snapshot} />
        <WorkflowRail steps={snapshot.workflowSteps || []} />

        <section className="dashboard-grid">
          <OpportunityPools snapshot={snapshot} />
          <SkuScreening products={products} selectedProductId={selectedProduct?.id} onSelect={setSelectedProductId} />
        </section>

        <RankGroupsPanel snapshot={snapshot} />

        <section className="detail-grid">
          <ProductDetail product={selectedProduct} />
          <FourPWorkbench product={selectedProduct} strategyCanvas={snapshot.strategyCanvas} gtmPlaybook={snapshot.gtmPlaybook} />
        </section>

        <section className="dashboard-grid">
          <MarketSegments snapshot={snapshot} />
          <PlatformCoverage snapshot={snapshot} />
        </section>

        <section className="detail-grid">
          <WikiPanel snapshot={snapshot} />
          <GtmPanel gtmPlaybook={snapshot.gtmPlaybook} />
        </section>

        <section className="source-section">
          <SourcePanel snapshot={snapshot} />
          <SecurityPanel snapshot={snapshot} />
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
          <p>请先使用监控面板账号密码登录，后端认证通过后才会返回工作台数据。</p>
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
        <span>{source === "local-api" ? `后端 API / ${sessionUser}` : "静态快照"} / {new Date(generatedAt).toLocaleString("zh-CN")}</span>
      </div>
    </div>
  );
}

function MetricsCommandCenter({ snapshot }) {
  const metrics = snapshot.metricsFramework;
  const alerts = snapshot.alerts || [];
  const topNumbers = [
    { label: metrics.northStar.name, value: metrics.northStar.value, sub: metrics.northStar.target, icon: Sparkle },
    { label: "高优先级机会池", value: metrics.inputMetrics.find((item) => item.name === "高优先级机会池")?.value ?? 0, sub: "区域/品类机会", icon: MapTrifold },
    { label: "SKU验证通过率", value: formatPercent(metrics.inputMetrics.find((item) => item.name === "SKU验证通过率")?.value ?? 0), sub: "test与scale阶段", icon: Funnel },
    { label: "毛利安全垫", value: formatPercent(metrics.inputMetrics.find((item) => item.name === "平均毛利安全垫")?.value ?? 0), sub: "全成本后毛利", icon: Tag },
    { label: "口碑均分", value: metrics.inputMetrics.find((item) => item.name === "平均口碑分")?.value ?? 0, sub: "-1到+1", icon: BellRinging }
  ];

  return (
    <section className="command-center" aria-label="指标和告警">
      <div className="metric-strip">
        {topNumbers.map((metric) => {
          const Icon = metric.icon;
          return (
            <div className="metric-cell" key={metric.label}>
              <Icon size={19} weight="duotone" />
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.sub}</small>
            </div>
          );
        })}
      </div>
      <div className="panel alert-panel">
        <div className="panel-heading">
          <div>
            <h2>告警队列</h2>
            <p>只展示会改变动作的阈值，按毛利、口碑、搜索承接和数据质量触发。</p>
          </div>
          <span className="cadence-badge">每{snapshot.refreshCadenceHours}小时刷新</span>
        </div>
        {alerts.length === 0 ? (
          <div className="empty-state">当前没有高优先级告警。</div>
        ) : (
          <div className="alert-list">
            {alerts.slice(0, 5).map((alert) => (
              <article className={`alert-row ${alert.severity}`} key={alert.id}>
                <WarningCircle size={18} weight="duotone" />
                <div>
                  <strong>{alert.title}</strong>
                  <span>{alert.subject} / {alert.owner} / {alert.responseTimeHours}小时内处理</span>
                </div>
                <p>{alert.action}</p>
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function DataQualityBanner({ snapshot }) {
  const quality = snapshot.dataQuality || {};
  const modeLabel = snapshot.dataMode === "mixed-local-import" ? "本机导入 + 规则补全" : "监控种子演示";
  const connectors = quality.connectorStatus || [];
  const activeConnectors = connectors.filter((connector) => connector.enabled);

  return (
    <section className={`data-quality ${snapshot.dataMode === "mixed-local-import" ? "mixed" : "synthetic"}`} aria-label="数据可信度">
      <div>
        <strong>{modeLabel}</strong>
        <p>{snapshot.dataModeNote}</p>
      </div>
      <div className="quality-facts">
        <span>导入行 {quality.rowCounts?.vendorRows ?? 0}</span>
        <span>导入文件 {quality.rowCounts?.vendorFiles ?? 0}</span>
        <span>启用连接器 {activeConnectors.length}</span>
        <span>默认 {snapshot.refreshCadenceHours}小时</span>
      </div>
    </section>
  );
}

function WorkflowRail({ steps }) {
  return (
    <section className="workflow-rail" aria-label="PM组合工作流">
      {steps.map((step) => (
        <article key={step.skill}>
          <span className="workflow-icon"><Path size={18} weight="duotone" /></span>
          <strong>{step.title}</strong>
          <small>{step.skill}</small>
          <p>{step.purpose}</p>
          <em>{step.output}</em>
        </article>
      ))}
    </section>
  );
}

function OpportunityPools({ snapshot }) {
  const pools = snapshot.opportunityPools || [];
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>区域/品类机会池</h2>
          <p>market-segments和market-sizing输出，包含JTBD、TAM/SAM/SOM、增长率和优先级。</p>
        </div>
      </div>
      <div className="opportunity-list">
        {pools.slice(0, 8).map((pool) => (
          <article className="opportunity-card" key={pool.id}>
            <div className="opportunity-top">
              <div>
                <strong>{pool.regionName} / {pool.categoryName}</strong>
                <span>{pool.segmentName}</span>
              </div>
              <span className={`priority-badge ${pool.priority === "高优先级" ? "high" : pool.priority === "验证池" ? "medium" : "low"}`}>{pool.priority}</span>
            </div>
            <p>{pool.jtbd}</p>
            <div className="sizing-grid">
              <SummaryCell label="TAM" value={formatUsdM(pool.tamUsdM)} />
              <SummaryCell label="SAM" value={formatUsdM(pool.samUsdM)} />
              <SummaryCell label="SOM" value={formatUsdM(pool.somUsdM)} />
            </div>
            <div className="mini-facts">
              <span>增长 {formatTrend(pool.growthRate)}</span>
              <span>毛利 {formatPercent(pool.averageMarginRate)}</span>
              <span>口碑 {pool.averageSentiment}</span>
              <span>竞品 {formatPercent(pool.competitiveIntensity)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function SkuScreening({ products, selectedProductId, onSelect }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>SKU筛选清单</h2>
          <p>competitor-analysis和pricing-strategy结合90天趋势，给出watch、test、scale或修毛利阶段。</p>
        </div>
      </div>
      {products.length === 0 ? (
        <div className="empty-state">没有符合筛选条件的SKU。</div>
      ) : (
        <div className="product-table" role="table" aria-label="SKU筛选">
          <div className="product-table-head" role="row">
            <span>排名</span>
            <span>SKU</span>
            <span>阶段</span>
            <span>机会分</span>
            <span>毛利</span>
            <span>口碑</span>
            <span>搜索</span>
          </div>
          {products.slice(0, 16).map((product) => (
            <button
              className={`product-row ${selectedProductId === product.id ? "active" : ""}`}
              key={product.id}
              onClick={() => onSelect(product.id)}
              type="button"
            >
              <span className="rank-mark">{product.rank}</span>
              <span>
                <strong>{product.title}</strong>
                <small>{product.regionName} / {product.platformName} / {product.categoryName} / {product.priceTierLabel}</small>
              </span>
              <span className={`stage-pill ${product.stage}`}>{stageLabel(product.stage)}</span>
              <span className="score-value">{product.opportunityScore}</span>
              <span>{formatPercent(product.pricing.grossMarginRate)}</span>
              <span>{product.sentiment.score}</span>
              <span className={product.summary.searchChange >= 0 ? "trend-up" : "trend-down"}>{formatTrend(product.summary.searchChange)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function RankGroupsPanel({ snapshot }) {
  const [groupType, setGroupType] = useState("region-platform-price-tier");
  const groups = useMemo(() => {
    const rankGroups = snapshot.rankGroups || [];
    return rankGroups.filter((group) => group.type === groupType && group.products?.length);
  }, [snapshot.rankGroups, groupType]);
  const selectedGroups = groups.slice(0, groupType === "region-platform-price-tier" ? 6 : 8);

  return (
    <section className="panel rank-groups-panel">
      <div className="panel-heading">
        <div>
          <h2>分组Top10榜单</h2>
          <p>按价格带、区域、平台和品类持久化Top10，每个榜单商品都保留90天销量、搜索、成单率和客单价趋势。</p>
        </div>
        <div className="metric-tabs compact-tabs">
          <button className={groupType === "region-platform-price-tier" ? "active" : ""} onClick={() => setGroupType("region-platform-price-tier")} type="button">区域/平台/价格带</button>
          <button className={groupType === "price-tier" ? "active" : ""} onClick={() => setGroupType("price-tier")} type="button">价格带</button>
          <button className={groupType === "region" ? "active" : ""} onClick={() => setGroupType("region")} type="button">区域</button>
          <button className={groupType === "category" ? "active" : ""} onClick={() => setGroupType("category")} type="button">品类</button>
        </div>
      </div>
      <div className="rank-group-grid">
        {selectedGroups.map((group) => (
          <article className="rank-group-card" key={group.id}>
            <div className="rank-group-head">
              <ListChecks size={18} weight="duotone" />
              <strong>{group.label}</strong>
            </div>
            <div className="rank-mini-list">
              {group.products.slice(0, 10).map((product) => (
                <div key={product.id}>
                  <span className="rank-mark">{product.rank}</span>
                  <span>
                    <strong>{product.title}</strong>
                    <small>{product.categoryName} / {stageLabel(product.stage)} / {product.sourceType === "local-import" ? "导入" : "种子"}</small>
                  </span>
                  <em>{product.opportunityScore}</em>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
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
        <div className="empty-state">选择一个SKU查看90天趋势。</div>
      </section>
    );
  }

  const metricOptions = [
    { id: "salesUnits", label: "销量", color: "#0f766e" },
    { id: "searchVolume", label: "搜索", color: "#2563eb" },
    { id: "conversionRate", label: "成单率", color: "#b45309" },
    { id: "averageOrderValue", label: "客单价", color: "#be185d" }
  ];
  const activeMetric = metricOptions.find((option) => option.id === metric);
  const chartRows = product.trend.map((point) => ({
    ...point,
    conversionRate: point.conversionRate * 100
  }));
  const cohortRows = product.summary.cohorts.map((cohort) => ({
    ...cohort,
    conversionRate: roundForChart(cohort.conversionRate * 100)
  }));

  return (
    <section className="panel large-panel">
      <div className="panel-heading">
        <div>
          <h2>{product.title}</h2>
          <p>{product.regionName} / {product.platformName} / {product.categoryName} / {product.priceTierLabel}</p>
        </div>
        <strong className="detail-score">{product.opportunityScore}</strong>
      </div>

      <div className="lineage-strip">
        <span>{product.sourceType === "local-import" ? "本机导入数据" : "监控种子数据"}</span>
        <span>导入行 {product.dataLineage?.importedRows ?? 0}</span>
        <span>置信度 {formatPercent(product.confidence, 0)}</span>
        <span>{product.dataLineage?.caveat}</span>
      </div>

      <div className="summary-grid">
        <SummaryCell label="90天销量" value={formatNumber(product.summary.sales90d)} trend={formatTrend(product.summary.salesChange)} />
        <SummaryCell label="90天搜索" value={formatNumber(product.summary.search90d)} trend={formatTrend(product.summary.searchChange)} />
        <SummaryCell label="当前成单率" value={formatPercent(product.summary.conversionRate)} trend={`${product.summary.conversionChange > 0 ? "+" : ""}${product.summary.conversionChange.toFixed(2)}pp`} />
        <SummaryCell label="客单价" value={`$${product.summary.averageOrderValue.toFixed(2)}`} trend={formatTrend(product.summary.aovChange)} />
      </div>

      <div className="metric-tabs" role="tablist" aria-label="趋势指标">
        {metricOptions.map((option) => (
          <button className={metric === option.id ? "active" : ""} key={option.id} onClick={() => setMetric(option.id)} type="button">
            {option.label}
          </button>
        ))}
      </div>

      <div className="chart-frame">
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={chartRows} margin={{ top: 8, right: 18, left: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="metricFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={activeMetric.color} stopOpacity={0.24} />
                <stop offset="95%" stopColor={activeMetric.color} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(43, 54, 58, 0.11)" />
            <XAxis dataKey="date" minTickGap={28} tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={46} />
            <Tooltip content={<TrendTooltip metric={metric} />} />
            <Area type="monotone" dataKey={metric} stroke={activeMetric.color} strokeWidth={2} fill="url(#metricFill)" dot={false} activeDot={{ r: 4 }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="cohort-grid">
        <div>
          <h3>cohort趋势验证</h3>
          <p>{product.cohort.anomaly}。{product.cohort.validationAction}</p>
          <div className="mini-facts">
            <span>销量提升 {formatTrend(product.cohort.salesLift)}</span>
            <span>搜索提升 {formatTrend(product.cohort.searchLift)}</span>
            <span>留存代理 {formatPercent(product.cohort.retentionProxy)}</span>
          </div>
        </div>
        <div className="mini-chart">
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={cohortRows}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(43, 54, 58, 0.1)" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={34} />
              <Tooltip />
              <Bar dataKey="conversionRate" radius={[5, 5, 0, 0]} fill="#0f766e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

function roundForChart(value) {
  return Math.round(value * 100) / 100;
}

function SummaryCell({ label, value, trend }) {
  const positive = trend ? trend.trim().startsWith("+") : true;
  return (
    <div className="summary-cell">
      <span>{label}</span>
      <strong>{value}</strong>
      {trend ? <small className={positive ? "trend-up" : "trend-down"}>{trend}</small> : null}
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

function FourPWorkbench({ product, strategyCanvas, gtmPlaybook }) {
  if (!product) {
    return (
      <section className="panel large-panel">
        <div className="empty-state">选择一个SKU查看4P动作。</div>
      </section>
    );
  }

  const cards = [
    { key: "product", title: "Product", icon: Package, items: product.product4p.product },
    { key: "price", title: "Price", icon: Tag, items: product.product4p.price },
    { key: "place", title: "Place", icon: ShoppingCart, items: product.product4p.place },
    { key: "promotion", title: "Promotion", icon: ChartLineUp, items: product.product4p.promotion }
  ];

  return (
    <section className="panel large-panel">
      <div className="panel-heading">
        <div>
          <h2>4P执行工作台</h2>
          <p>把产品、本土化合规、全成本定价、渠道履约和促销动作落到当前SKU。</p>
        </div>
      </div>
      <div className="fourp-grid">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.key}>
              <div>
                <Icon size={20} weight="duotone" />
                <strong>{card.title}</strong>
              </div>
              <ul>
                {card.items.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </article>
          );
        })}
      </div>
      <div className="split-notes">
        <article>
          <h3>策略画布</h3>
          <p>{strategyCanvas?.vision}</p>
          <div className="tag-row">
            {strategyCanvas?.sections?.slice(0, 5).map((section) => <span key={section.key}>{section.title}</span>)}
          </div>
        </article>
        <article>
          <h3>GTM定位</h3>
          <p>{gtmPlaybook?.positioning}</p>
          <div className="tag-row">
            {gtmPlaybook?.kpis?.slice(0, 4).map((kpi) => <span key={kpi}>{kpi}</span>)}
          </div>
        </article>
      </div>
    </section>
  );
}

function MarketSegments({ snapshot }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>市场细分</h2>
          <p>按JTBD、痛点、期望收益和产品适配度拆分，不用单一人口属性判断机会。</p>
        </div>
      </div>
      <div className="segment-list">
        {(snapshot.marketSegments || []).map((segment) => (
          <article key={segment.id}>
            <div>
              <strong>{segment.name}</strong>
              <span>{segment.shareEstimate}</span>
            </div>
            <p>{segment.jtbd}</p>
            <small>{segment.fit}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function PlatformCoverage({ snapshot }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>平台覆盖</h2>
          <p>每区保留5个平台作为监控覆盖优先级；只有来源给出可比份额时展示市占率，其他区域展示覆盖权重和置信度。</p>
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
                  <span className="platform-share">{platform.marketSharePercent ? `份额 ${platform.marketSharePercent}%` : `覆盖权重 ${platform.platformWeight}`}</span>
                  <span className={`confidence ${platform.confidence}`}>{platform.confidence}</span>
                  <small>{platform.shareBasis}</small>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WikiPanel({ snapshot }) {
  return (
    <section className="panel wiki-panel">
      <div className="panel-heading">
        <div>
          <h2>选品Wiki沉淀</h2>
          <p>product-strategy和gtm-strategy输出，按品类沉淀爆品逻辑和4P复用规则。</p>
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
            <small>价格带：{signal.winningPriceTiers.join("、")} / 平台：{signal.leadingPlatforms.join("、")}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function GtmPanel({ gtmPlaybook }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>90天GTM路线</h2>
          <p>渠道、信息、KPI和风险缓解直接服务SKU验证与放量。</p>
        </div>
      </div>
      <div className="gtm-roadmap">
        {gtmPlaybook?.roadmap90Days?.map((item) => (
          <article key={item.phase}>
            <strong>{item.phase}</strong>
            <p>{item.focus}</p>
            <span>{item.output}</span>
          </article>
        ))}
      </div>
      <div className="channel-grid">
        {gtmPlaybook?.channels?.slice(0, 5).map((channel, index) => (
          <article key={channel.name}>
            <span>{index + 1}</span>
            <strong>{channel.name}</strong>
            <p>{channel.fit}</p>
            <small>{channel.kpi}</small>
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

function SecurityPanel({ snapshot }) {
  const rows = [
    "后端绑定127.0.0.1，通过HTTPS tunnel转发。",
    "GitHub Pages只发布前端和config.json，不发布快照、密钥或账号密码。",
    "所有数据API请求必须带登录会话。",
    "默认刷新不调用模型，只在refresh:ai时读取后端OPENAI_API_KEY。",
    `当前数据模式：${snapshot.dataMode}。生产接入授权API、卖家后台导出或数据商。`
  ];

  return (
    <section className="panel security-panel">
      <div className="panel-heading">
        <div>
          <h2>安全部署</h2>
          <p>前端公开，后端本机运行，模型和平台密钥只留在后端环境变量。</p>
        </div>
      </div>
      <div className="security-list">
        {rows.map((row) => (
          <div key={row}>
            <ShieldCheck size={20} weight="duotone" />
            <span>{row}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
