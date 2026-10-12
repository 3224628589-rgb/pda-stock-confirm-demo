import { newState, pendingLines, decide } from "./model.js";

const app = document.querySelector("#app");
const params = new URLSearchParams(location.search);
let state = newState();
let page = "mine";
let query = "";
let modal = null;
let result = null;
let busy = false;
let error = "";
let toast = "";
let failOnce = params.get("failOnce") === "1";
let toastTimer;
let previousFocus = null;

const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const asset = (file, alt = "", className = "") =>
  `<img src="assets/${file}" alt="${esc(alt)}"${className ? ` class="${className}"` : ""}>`;
const statusBar = () =>
  '<div class="status-bar" aria-hidden="true"><span>17:19</span><span class="status-icons"><i></i><i></i><i></i> 100%</span></div>';
const homeIndicator = () =>
  '<div class="home-indicator" aria-hidden="true"></div>';

const menuItems = [
  ["盘点", "m_inventory_count.webp"],
  ["破损", "m_damiage_count.webp"],
  ["店内调拨", "m_store_inside_trans.webp"],
  ["主商品库", "m_main_inventory_goods.webp"],
  ["版本管理", "m_version_update_check.webp"],
  ["入库核准", "m_entry_approval.webp"],
  ["签收", "m_entry_sign.webp"],
  ["工单协作", "m_entry_collaboration.webp"],
  ["采退待办", "m_entry_mine_order_caitui.webp"],
  ["天气预报", "m_weather_entrance.webp"],
  ["货位调整", "home-icon-11.png"],
  ["库存确认", "m_entry_reshelving.webp"],
];

function minePage() {
  return `<section class="phone" data-page="mine">${statusBar()}
    <div class="home-content">
      <div class="mine-top"><div class="mine-profile">${asset("m_mine_userpic.webp")}<div><h2>演示店员</h2><p>叁悦演示门店（自营） | 138****0000</p></div></div>
        <div class="mine-stats">${["今日订单", "今日条目", "本月订单", "本月条目"].map((label) => `<div><b>0</b><span>${label}</span></div>`).join("")}</div></div>
      <section class="mine-functions"><h3>常用功能</h3><div class="mine-grid">
        ${menuItems.map(([label, icon]) => `<button type="button" class="mine-entry ${label === "库存确认" ? "inventory-entry" : ""}" data-action="${label === "库存确认" ? "open-inventory" : "out-of-scope"}" aria-label="${label}">${asset(icon)}<span>${label}</span></button>`).join("")}
      </div></section>
      <div class="mine-bottom"><button type="button" class="change-shop" data-action="out-of-scope">切换门店</button><button type="button" class="logout" data-action="out-of-scope">退出登录</button></div>
    </div>
    <nav class="mine-tabs" aria-label="底部导航"><button type="button" data-action="out-of-scope">${asset("m_main_unselect.webp")}<span>首页</span></button><button type="button" class="active" aria-current="page">${asset("m_mine_select.webp")}<span>我的</span></button></nav>
    ${homeIndicator()}
  </section>`;
}

function card(line) {
  return `<article class="stock-card" data-line-id="${line.id}">
    <div class="card-order"><div class="order-meta"><span class="platform">${esc(line.platform)}</span><span class="order-number">订单号 ${esc(line.orderNo)}</span></div><span class="serial">流水号 ${esc(line.serialNo)}</span></div>
    <div class="card-product"><h2>${esc(line.name)}<span>× ${line.quantity}</span></h2><p class="spec">${esc(line.spec)}</p></div>
    <div class="card-details"><div class="meta-line slot"><label>分拣货位</label><b>${esc(line.slot)}</b></div><div class="meta-line"><label>商品数量</label><b>${line.quantity}</b></div><div class="meta-line barcode"><label>商品条码</label><b>${esc(line.barcode)}</b></div></div>
    <div class="card-actions"><button type="button" class="found" data-action="choose" data-id="${line.id}" data-decision="found">找到了，已经<br>放回架上</button><button type="button" class="lost" data-action="choose" data-id="${line.id}" data-decision="lost">没找到，也没<br>在货架上</button></div>
  </article>`;
}

function listPage() {
  const rows = pendingLines(state, query);
  const pendingCount = pendingLines(state).length;
  const empty = !rows.length;
  return `<section class="phone" data-page="inventory">${statusBar()}
    <header class="page-head"><button type="button" class="nav-back" data-action="back" aria-label="返回我的">${asset("m_arrow_left_black_activity.webp")}</button><h1>库存确认</h1></header>
    <div class="list-tools"><div class="search-field">${asset("m_search_pink.webp", "搜索", "search-icon")}<input id="search" type="search" inputmode="search" enterkeyhint="search" autocomplete="off" aria-label="搜索订单号后四位、流水号、商品名称或货位" placeholder="订单号后四位/流水号/商品名称/货位" value="${esc(query)}">${query ? `<button class="search-clear" type="button" data-action="clear-search" aria-label="清空搜索">${asset("m_icon_clear.webp")}</button>` : ""}</div></div>
    <div class="list-summary" aria-live="polite"><span>${query ? `搜索结果 ${rows.length} 条` : "待确认商品"}</span><strong>待确认 ${pendingCount} 条</strong></div>
    <div class="task-list">${empty ? `<div class="empty-state"><div class="empty-symbol">${pendingCount ? "⌕" : "✓"}</div><h2>${pendingCount ? "没有找到待确认商品" : "库存已全部确认"}</h2><p>${pendingCount ? "请核对订单号、流水号、商品名称或货位" : "当前没有需要处理的商品"}</p>${query ? '<button type="button" data-action="clear-search">清空搜索</button>' : ""}</div>` : rows.map(card).join("")}</div>
    ${homeIndicator()}
  </section>`;
}

function confirmationSheet() {
  if (!modal) return "";
  const line = state.lines.find((item) => item.id === modal.id);
  if (!line) return "";
  const found = modal.decision === "found";
  return `<div class="modal-backdrop" data-overlay="confirm"><section class="confirm-sheet ${found ? "" : "lost-sheet"}" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
    <div class="sheet-handle"></div><h2 id="sheet-title">${found ? "确认商品已放回架上？" : "确认商品没有找到？"}</h2>
    <p class="target-name">${esc(line.name)} <span>× ${line.quantity}</span></p>
    <p class="target-detail">订单尾号 ${line.orderNo.slice(-4)} · ${esc(line.slot)}</p>
    <div class="effect-box">${found ? `确认后将<span>释放</span>该商品的占用库存，共 <strong>${line.quantity} 件</strong>。` : `确认后将以<strong>系统临时盘点</strong>扣除 <strong>${line.quantity} 件</strong>库存，原因记录为“机器人分拣途中丢失”。`}</div>
    ${error ? `<p class="sheet-error" role="alert">${esc(error)}</p>` : ""}
    <div class="sheet-buttons"><button type="button" class="cancel" data-action="cancel" ${busy ? "disabled" : ""}>取消</button><button type="button" class="confirm ${found ? "" : "danger"}" data-action="confirm" ${busy ? "disabled" : ""}>${busy ? "处理中…" : found ? "确认放回" : "确认扣除"}</button></div>
  </section></div>`;
}

function successPanel() {
  if (!result) return "";
  const released = result.status === "released";
  return `<div class="success-panel" role="status"><div class="success-badge">✓</div><h2>${released ? "库存占用已释放" : "库存已扣除"}</h2><p>订单尾号 ${result.orderNo.slice(-4)} · ${result.quantity} 件<br>${released ? "该商品已从待确认列表移除" : "按“机器人分拣途中丢失”记录为系统临时盘点"}<br>剩余 ${pendingLines(state).length} 条待确认</p><button type="button" class="primary" data-action="continue">继续处理</button></div>`;
}

function render(options = {}) {
  const scroll = app.querySelector(".task-list")?.scrollTop ?? 0;
  app.innerHTML = `${page === "mine" ? minePage() : listPage()}${confirmationSheet()}${successPanel()}${toast ? `<div class="toast" role="status">${esc(toast)}</div>` : ""}`;
  app
    .querySelector(".phone")
    ?.toggleAttribute("inert", Boolean(modal || result));
  if (options.keepScroll) app.querySelector(".task-list")?.scrollTo(0, scroll);
  if (modal && !busy && options.focusModal)
    app
      .querySelector(".confirm-sheet .confirm")
      ?.focus({ preventScroll: true });
}

function notify(message) {
  toast = message;
  clearTimeout(toastTimer);
  render({ keepScroll: true });
  toastTimer = setTimeout(() => {
    toast = "";
    render({ keepScroll: true });
  }, 2200);
}

function closeModal() {
  if (busy) return;
  modal = null;
  error = "";
  render({ keepScroll: true });
  previousFocus?.focus({ preventScroll: true });
  previousFocus = null;
}

function submit() {
  if (!modal || busy) return;
  busy = true;
  error = "";
  render({ keepScroll: true });
  const selection = { ...modal };
  setTimeout(() => {
    if (failOnce) {
      failOnce = false;
      busy = false;
      error = "处理失败，库存未变更，请重试。";
      render({ keepScroll: true, focusModal: true });
      return;
    }
    try {
      state = decide(state, selection.id, selection.decision);
      result = state.events.at(-1);
      modal = null;
      busy = false;
      error = "";
      render();
      app.querySelector('[data-action="continue"]')?.focus();
    } catch (cause) {
      busy = false;
      error = cause.message;
      render({ keepScroll: true, focusModal: true });
    }
  }, 450);
}

app.addEventListener("click", (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || busy) return;
  const { action, id, decision } = button.dataset;
  if (action === "open-inventory") {
    page = "inventory";
    query = "";
    render();
  } else if (action === "back") {
    page = "mine";
    render();
  } else if (action === "clear-search") {
    query = "";
    render();
    app.querySelector("#search")?.focus();
  } else if (action === "choose") {
    previousFocus = button;
    modal = { id, decision };
    error = "";
    render({ keepScroll: true, focusModal: true });
  } else if (action === "cancel") closeModal();
  else if (action === "confirm") submit();
  else if (action === "continue") {
    result = null;
    render();
    app.querySelector("#search")?.focus();
  } else if (action === "out-of-scope") notify("本次 Demo 仅演示库存确认");
});

app.addEventListener("input", (event) => {
  if (event.target.id !== "search") return;
  query = event.target.value;
  const caret = event.target.selectionStart;
  render();
  const input = app.querySelector("#search");
  input?.focus();
  input?.setSelectionRange(caret, caret);
});

app.addEventListener("click", (event) => {
  if (event.target.matches('[data-overlay="confirm"]')) closeModal();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (busy) {
      event.preventDefault();
      return;
    }
    if (modal) {
      event.preventDefault();
      closeModal();
    } else if (result) {
      result = null;
      render();
    } else if (page === "inventory") {
      page = "mine";
      render();
    }
  }
  if (event.key === "Tab" && modal) {
    const controls = [
      ...app.querySelectorAll(".confirm-sheet button:not(:disabled)"),
    ];
    if (!controls.length) return;
    const first = controls[0],
      last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});

render();
