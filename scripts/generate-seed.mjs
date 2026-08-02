/**
 * 開発・デモ用のシードデータを SQL として生成する。
 *
 *   node scripts/generate-seed.mjs > database/seed.generated.sql
 *
 * 登場する氏名はすべて架空のもの（十干を用いた法文書式の仮名）。
 * 実在の人物・物件のデータは絶対に含めないこと。
 */

const ORG_ID = "org_demo";
const BUILDING_ID = "bld_demo";

/** 基準日。決め打ちにして毎回同じデータが出るようにする */
const TODAY = new Date("2026-08-01T00:00:00Z");
const NOW_MS = TODAY.getTime();

const SURNAMES = ["甲野", "乙川", "丙山", "丁田", "戊本", "己村", "庚島", "辛崎", "壬生", "癸見"];
const GIVEN = ["太郎", "花子", "一郎", "幸子", "健一", "良子", "大輔", "明美", "次郎", "百合子"];

const lines = [];
const out = (sql) => lines.push(sql);

const q = (v) => {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "1" : "0";
  return `'${String(v).replace(/'/g, "''")}'`;
};

const insert = (table, row) => {
  const cols = Object.keys(row);
  out(
    `INSERT INTO ${table} (${cols.map((c) => `\`${c}\``).join(", ")}) VALUES (${cols
      .map((c) => q(row[c]))
      .join(", ")});`,
  );
};

const stamps = (offsetDays = 0) => {
  const t = NOW_MS - offsetDays * 86_400_000;
  return { created_at: t, updated_at: t };
};

const isoDate = (d) => d.toISOString().slice(0, 10);
const shiftDays = (days) => isoDate(new Date(NOW_MS + days * 86_400_000));
const addYears = (date, years) => {
  const [y, m, d] = date.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
};

// ---------------------------------------------------------------- 初期化
//
// 業務データだけを消す。
// organizations / memberships / invitations と Better Auth のテーブルは残す。
// これらを消すとログイン済みのユーザーが所属を失い、ログインできなくなるため。
out("PRAGMA defer_foreign_keys = true;");
for (const t of [
  "attachments",
  "work_orders",
  "equipment_records",
  "procedure_items",
  "procedures",
  "rent_revisions",
  "leases",
  "tenants",
  "units",
  "buildings",
]) {
  out(`DELETE FROM ${t};`);
}

// ---------------------------------------------------------------- 組織・建物
// 既存メンバーの所属を壊さないよう、同じ id で置き換える
out(
  `INSERT INTO organizations (\`id\`, \`name\`, \`created_at\`, \`updated_at\`) VALUES (${q(ORG_ID)}, ${q("デモ管理")}, ${NOW_MS}, ${NOW_MS}) ON CONFLICT(\`id\`) DO UPDATE SET \`name\` = excluded.\`name\`, \`updated_at\` = excluded.\`updated_at\`;`,
);
insert("buildings", {
  id: BUILDING_ID,
  organization_id: ORG_ID,
  name: "サンプルマンション",
  address: "架空県架空市架空町1-2-3",
  ...stamps(),
});

// ---------------------------------------------------------------- 部屋・駐車場
const unitDefs = [];
let order = 0;
for (const floor of [1, 2, 3, 4]) {
  for (let n = 1; n <= 10; n++) {
    unitDefs.push({ id: `unit_${floor}${String(n).padStart(2, "0")}`, type: "room", code: `${floor}${String(n).padStart(2, "0")}`, order: order++ });
  }
}
for (let n = 1; n <= 5; n++) {
  unitDefs.push({ id: `unit_P${n}`, type: "parking", code: `P${n}`, order: order++ });
}

/** 空室にする部屋（40室中5室 + 駐車場1台） */
const VACANT = new Set(["unit_105", "unit_208", "unit_301", "unit_407", "unit_410", "unit_P4"]);

for (const u of unitDefs) {
  const vacant = VACANT.has(u.id);
  insert("units", {
    id: u.id,
    organization_id: ORG_ID,
    building_id: BUILDING_ID,
    type: u.type,
    code: u.code,
    display_order: u.order,
    listing_rent: vacant ? (u.type === "room" ? 74000 : 8000) : null,
    listing_started_on: vacant ? shiftDays(-40) : null,
    note: null,
    ...stamps(),
  });
}

// ---------------------------------------------------------------- 入居者・契約・家賃
let personIndex = 0;
const occupied = unitDefs.filter((u) => !VACANT.has(u.id));

occupied.forEach((u, i) => {
  const tenantId = `tenant_${u.id}`;
  // 姓と名で異なる周期を使い、同じ組み合わせが並ばないようにする
  const name = `${SURNAMES[personIndex % SURNAMES.length]} ${GIVEN[(personIndex * 3) % GIVEN.length]}`;
  personIndex++;

  insert("tenants", {
    id: tenantId,
    organization_id: ORG_ID,
    name,
    birth_year: 1960 + ((i * 7) % 45),
    ...stamps(),
  });

  // 契約日は過去1〜4年でばらけさせる
  const contractDate = shiftDays(-(120 + i * 31));
  const leaseId = `lease_${u.id}`;
  insert("leases", {
    id: leaseId,
    organization_id: ORG_ID,
    unit_id: u.id,
    tenant_id: tenantId,
    contract_date: contractDate,
    next_renewal_date: addYears(contractDate, 2),
    status: "active",
    ended_on: null,
    ...stamps(),
  });

  const rent = u.type === "room" ? 68000 + ((i % 6) * 2000) : 8000;
  insert("rent_revisions", {
    id: `rev_${u.id}_0`,
    organization_id: ORG_ID,
    lease_id: leaseId,
    effective_from: contractDate,
    amount: rent,
    reason: "initial",
    procedure_id: null,
    confirmed: true,
    ...stamps(),
  });

  // 一部は更新済みで家賃改定が入っている
  if (i % 5 === 0) {
    const renewedOn = addYears(contractDate, 2);
    if (renewedOn <= isoDate(TODAY)) {
      insert("rent_revisions", {
        id: `rev_${u.id}_1`,
        organization_id: ORG_ID,
        lease_id: leaseId,
        effective_from: renewedOn,
        amount: rent + 2000,
        reason: "renewal",
        procedure_id: null,
        confirmed: true,
        ...stamps(),
      });
    }
  }
});

// ---------------------------------------------------------------- 手続き
const MOVE_IN_ITEMS = [
  ["contract_payment_notice", "契約金お届け明細を受領"],
  ["commission_info", "委託手数料支払いに関する情報を受領"],
  ["commission_paid", "委託手数料の支払いを確認"],
  ["contract_filed", "契約書をファイリング"],
  ["rent_remittance", "家賃送金明細を確認"],
];
const RENEWAL_ITEMS = [
  ["notice_decided", "更新通知内容を決定"],
  ["renewal_fee_paid", "更新料金の支払いを確認"],
  ["commission_paid", "委託手数料の支払いを確認"],
  ["new_rent_received", "家賃変更後の金額での入金を確認"],
];

const procedureSeeds = [
  { unit: "unit_203", type: "renewal", items: RENEWAL_ITEMS, checked: 1, scheduled: shiftDays(14) },
  { unit: "unit_306", type: "renewal", items: RENEWAL_ITEMS, checked: 2, scheduled: shiftDays(3) },
  { unit: "unit_112", type: null, items: null, checked: 0, scheduled: null }, // 存在しない部屋はスキップ
  { unit: "unit_402", type: "move_in", items: MOVE_IN_ITEMS, checked: 3, scheduled: shiftDays(-10) },
];

for (const p of procedureSeeds) {
  if (!p.type) continue;
  const leaseId = `lease_${p.unit}`;
  if (!occupied.some((u) => u.id === p.unit)) continue;

  const procId = `proc_${p.unit}_${p.type}`;
  insert("procedures", {
    id: procId,
    organization_id: ORG_ID,
    lease_id: leaseId,
    type: p.type,
    status: p.checked > 0 ? "in_progress" : "todo",
    scheduled_on: p.scheduled,
    completed_at: null,
    ...stamps(),
  });

  p.items.forEach(([key, label], idx) => {
    insert("procedure_items", {
      id: `${procId}_${key}`,
      organization_id: ORG_ID,
      procedure_id: procId,
      key,
      label,
      sort_order: idx,
      checked_at: idx < p.checked ? NOW_MS - (p.checked - idx) * 86_400_000 : null,
      value_text: null,
      note: null,
      ...stamps(),
    });
  });
}

// ---------------------------------------------------------------- 設備・修繕
// 設備の実施記録。履歴として積み、「現在」は最新の1件から導出する
const equipmentSeeds = [
  ["unit_101", "water_heater", "2016-03-10", "架空給湯", "GH-2016", 180000],
  ["unit_101", "air_conditioner", "2021-07-02", "架空電機", "AC-2021", 95000],
  ["unit_101", "drain_cleaning", "2024-11-05", null, null, 12000],
  ["unit_202", "air_conditioner", "2013-05-20", "架空電機", "AC-2013", 88000],
  ["unit_202", "air_conditioner", "2024-06-18", "架空電機", "AC-2024", 112000],
  ["unit_202", "ih_cooktop", "2019-09-01", "架空電機", "IH-2019", 76000],
  ["unit_305", "water_heater", "2012-02-14", "架空給湯", "GH-2012", 165000],
  ["unit_305", "drain_cleaning", "2025-10-20", null, null, 12000],
];

for (const [unitId, category, performedOn, maker, modelNumber, cost] of equipmentSeeds) {
  insert("equipment_records", {
    id: `eq_${unitId}_${category}_${performedOn}`,
    organization_id: ORG_ID,
    unit_id: unitId,
    category,
    performed_on: performedOn,
    maker,
    model_number: modelNumber,
    cost,
    note: null,
    ...stamps(),
  });
}

const workOrderSeeds = [
  {
    id: "wo_1",
    unit_id: "unit_102",
    title: "給湯器の不具合",
    description: "お湯が出ないと管理会社経由で連絡あり",
    handler: "vendor",
    waiting_on: "業者の見積",
    status: "in_progress",
    occurred: shiftDays(-18),
    staleDays: 18, // 14日以上動きが無く、放置検知の対象になる
    cost: null,
    paid: false,
  },
  {
    id: "wo_2",
    unit_id: null,
    title: "1F 共用灯の交換",
    description: "廊下の照明が1本切れている",
    handler: "self",
    waiting_on: "自分たちの作業",
    status: "todo",
    occurred: shiftDays(-3),
    staleDays: 3,
    cost: null,
    paid: false,
  },
  {
    id: "wo_3",
    unit_id: "unit_202",
    title: "エアコンの効きが悪い",
    description: "業者に点検を依頼し、ガス補充で対応",
    handler: "vendor",
    waiting_on: null,
    status: "done",
    occurred: shiftDays(-90),
    staleDays: 60,
    cost: 18000,
    paid: true,
  },
];

for (const w of workOrderSeeds) {
  const t = NOW_MS - w.staleDays * 86_400_000;
  insert("work_orders", {
    id: w.id,
    organization_id: ORG_ID,
    unit_id: w.unit_id,
    location_note: w.unit_id ? null : "1F 廊下",
    title: w.title,
    description: w.description,
    occurred_on: w.occurred,
    handler: w.handler,
    waiting_on: w.waiting_on,
    status: w.status,
    cost: w.cost,
    paid: w.paid,
    completed_on: w.status === "done" ? w.occurred : null,
    created_at: t,
    updated_at: t,
  });
}

process.stdout.write(lines.join("\n") + "\n");
