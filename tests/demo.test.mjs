import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { createDemoServer } from "../server.mjs";
import { matches, newState, pendingLines, decide } from "../model.js";

let server, browser, page, origin;
const errors = [];

before(async () => {
  server = createDemoServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
});
after(async () => {
  await browser?.close();
  await new Promise((resolve) => server?.close(resolve));
});
beforeEach(async () => {
  page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(origin);
});
afterEach(async () => {
  await page?.close();
  assert.deepEqual(errors.splice(0), []);
});

async function openInventory() {
  await page.getByRole("button", { name: "库存确认" }).click();
  await page.getByRole("heading", { name: "库存确认" }).waitFor();
}

test("首页入口和静态素材正常", async () => {
  await page.screenshot({ path: "qa/home.png" });
  const imageHealth = await page
    .locator("img")
    .evaluateAll((images) =>
      images.every((image) => image.complete && image.naturalWidth > 0),
    );
  assert.equal(imageHealth, true);
  await openInventory();
  assert.equal(await page.locator(".stock-card").count(), 4);
  await page.screenshot({ path: "qa/list.png" });
  await page.getByRole("button", { name: "返回我的" }).click();
  await page.getByRole("button", { name: "库存确认" }).waitFor();
});

test("订单全号/尾四位、流水号、名称、货位按需求搜索", async () => {
  await openInventory();
  const input = page.locator("#search");
  for (const query of [
    "6384",
    "2026101200016384",
    "18",
    "氨溴特罗",
    "R-05-01-06-06",
  ]) {
    await input.fill(query);
    assert.deepEqual(
      await page
        .locator(".stock-card")
        .evaluateAll((nodes) => nodes.map((node) => node.dataset.lineId)),
      ["line-01"],
      query,
    );
  }
  await input.fill("R-03-02-04-01");
  assert.equal(await page.locator(".stock-card").count(), 2);
  await input.fill("638");
  assert.equal(await page.locator(".stock-card").count(), 0);
  await page.getByRole("button", { name: "清空搜索" }).first().click();
  assert.equal(await page.locator(".stock-card").count(), 4);
});

test("销售平台、规格、条码、数量不进入搜索索引", async () => {
  await openInventory();
  for (const query of ["饿了么", "100ml/瓶", "6942860180338", "1"]) {
    await page.locator("#search").fill(query);
    assert.equal(await page.locator(".stock-card").count(), 0, query);
  }
});

test("取消不处理；放回架上只释放一条", async () => {
  await openInventory();
  await page
    .locator('[data-line-id="line-01"] [data-decision="found"]')
    .click();
  await page.getByRole("dialog").waitFor();
  await page.screenshot({ path: "qa/confirm.png" });
  await page.getByRole("button", { name: "取消" }).click();
  assert.equal(await page.locator(".stock-card").count(), 4);
  await page
    .locator('[data-line-id="line-01"] [data-decision="found"]')
    .click();
  await page.getByRole("button", { name: "确认放回" }).click();
  await page.getByRole("heading", { name: "库存占用已释放" }).waitFor();
  await page.screenshot({ path: "qa/success.png" });
  await page.getByRole("button", { name: "继续处理" }).click();
  assert.equal(await page.locator(".stock-card").count(), 3);
  assert.equal(await page.locator('[data-line-id="line-01"]').count(), 0);
  assert.match(await page.locator(".list-summary").innerText(), /待确认 3 条/);
});

test("未找到按系统临时盘点扣除并支持全部处理空态", async () => {
  await openInventory();
  for (const id of ["line-01", "line-02", "line-03", "line-04"]) {
    await page.locator(`[data-line-id="${id}"] [data-decision="lost"]`).click();
    assert.match(
      await page.getByRole("dialog").innerText(),
      /机器人分拣途中丢失/,
    );
    await page.getByRole("button", { name: "确认扣除" }).click();
    await page.getByRole("heading", { name: "库存已扣除" }).waitFor();
    await page.getByRole("button", { name: "继续处理" }).click();
  }
  assert.equal(await page.locator(".stock-card").count(), 0);
  await page.getByRole("heading", { name: "库存已全部确认" }).waitFor();
  await page.reload();
  await openInventory();
  assert.equal(await page.locator(".stock-card").count(), 4);
});

test("模拟请求失败后保留明细且可重试", async () => {
  await page.goto(origin + "/?failOnce=1");
  await openInventory();
  await page.locator('[data-line-id="line-01"] [data-decision="lost"]').click();
  await page.getByRole("button", { name: "确认扣除" }).click();
  await page
    .getByRole("alert")
    .getByText(/处理失败/)
    .waitFor();
  assert.equal(await page.locator(".stock-card").count(), 4);
  await page.getByRole("button", { name: "确认扣除" }).click();
  await page.getByRole("heading", { name: "库存已扣除" }).waitFor();
  await page.getByRole("button", { name: "继续处理" }).click();
  assert.equal(await page.locator(".stock-card").count(), 3);
});

test("桌面预览与窄屏均无横向溢出，弹层可用 Escape 关闭", async () => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openInventory();
  await page.screenshot({ path: "qa/desktop-1440.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page.setViewportSize({ width: 320, height: 700 });
  await page.waitForFunction(() =>
    [...document.images].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  await page.screenshot({ path: "qa/narrow-320.png" });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    true,
  );
  await page
    .locator('[data-line-id="line-01"] [data-decision="found"]')
    .click();
  await page.getByRole("dialog").waitFor();
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator(".stock-card").count(), 4);
});

test("纯状态转换幂等守卫和搜索规则", () => {
  const first = newState();
  assert.equal(matches(first.lines[0], "6384"), true);
  assert.equal(matches(first.lines[0], "638"), false);
  assert.equal(matches(first.lines[0], "美团"), false);
  const second = decide(first, "line-01", "lost", "2026-10-12T00:00:00Z");
  assert.equal(pendingLines(second).length, 3);
  assert.deepEqual(second.events[0], {
    lineId: "line-01",
    orderNo: "2026101200016384",
    quantity: 1,
    status: "deducted",
    at: "2026-10-12T00:00:00Z",
    action: "系统临时盘点扣除库存",
    reason: "机器人分拣途中丢失",
    operator: "系统",
  });
  assert.throws(() => decide(second, "line-01", "lost"), /已经处理/);
});
