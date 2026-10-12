export const fixture = [
  {
    id: "line-01",
    platform: "美团",
    orderNo: "2026101200016384",
    serialNo: "18",
    name: "静泽欣 氨溴特罗口服溶液",
    spec: "100ml/瓶",
    barcode: "6942860180338",
    quantity: 1,
    slot: "R-05-01-06-06",
    status: "pending",
  },
  {
    id: "line-02",
    platform: "美团",
    orderNo: "2026101200019427",
    serialNo: "23",
    name: "维生素AD滴剂",
    spec: "30粒/盒",
    barcode: "6901234567205",
    quantity: 2,
    slot: "R-03-02-04-01",
    status: "pending",
  },
  {
    id: "line-03",
    platform: "饿了么",
    orderNo: "2026101200020551",
    serialNo: "31",
    name: "小儿氨酚黄那敏颗粒",
    spec: "10袋/盒",
    barcode: "6923456701182",
    quantity: 1,
    slot: "R-08-01-02-03",
    status: "pending",
  },
  {
    id: "line-04",
    platform: "美团",
    orderNo: "2026101200028416",
    serialNo: "46",
    name: "维生素C片",
    spec: "100片/瓶",
    barcode: "6932468011179",
    quantity: 1,
    slot: "R-03-02-04-01",
    status: "pending",
  },
];

export function newState() {
  return { lines: fixture.map((line) => ({ ...line })), events: [] };
}

export function matches(line, rawQuery) {
  const query = String(rawQuery ?? "")
    .trim()
    .toLocaleLowerCase();
  if (!query) return true;
  const order = line.orderNo.toLocaleLowerCase();
  return (
    query === order ||
    (query.length === 4 && query === order.slice(-4)) ||
    query === line.serialNo.toLocaleLowerCase() ||
    query === line.slot.toLocaleLowerCase() ||
    line.name.toLocaleLowerCase().includes(query)
  );
}

export function pendingLines(state, query = "") {
  return state.lines.filter(
    (line) => line.status === "pending" && matches(line, query),
  );
}

export function decide(state, id, decision, at = new Date().toISOString()) {
  if (!["found", "lost"].includes(decision)) throw new Error("未知处置方式");
  const line = state.lines.find((item) => item.id === id);
  if (!line || line.status !== "pending")
    throw new Error("该商品已经处理，请刷新列表");
  const status = decision === "found" ? "released" : "deducted";
  const event = {
    lineId: line.id,
    orderNo: line.orderNo,
    quantity: line.quantity,
    status,
    at,
    action: decision === "found" ? "释放占用库存" : "系统临时盘点扣除库存",
    reason: decision === "lost" ? "机器人分拣途中丢失" : null,
    operator: decision === "lost" ? "系统" : null,
  };
  return {
    lines: state.lines.map((item) =>
      item.id === id ? { ...item, status } : item,
    ),
    events: [...state.events, event],
  };
}
