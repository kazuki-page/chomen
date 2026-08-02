import { useState } from "react";
import { Form, Link, redirect } from "react-router";

import { listBuildings } from "@db/repositories/buildings.server";
import { createUnits } from "@db/services/units.server";
import { requireOrg } from "~/lib/auth.server";
import {
  DEFAULT_FLOOR_PATTERN,
  MAX_UNITS_PER_BATCH,
  generateFloorCodes,
  generateSequentialCodes,
  parseCodeList,
} from "~/lib/unit-codes";
import type { Route } from "./+types/unit-new";

export function meta(_: Route.MetaArgs) {
  return [{ title: "部屋の追加 | おおやさん" }];
}

export async function loader({ request }: Route.LoaderArgs) {
  const { ctx } = await requireOrg(request);
  return { buildings: await listBuildings(ctx) };
}

export async function action({ request }: Route.ActionArgs) {
  const { ctx } = await requireOrg(request);
  const form = await request.formData();

  const buildingId = String(form.get("buildingId") ?? "");
  if (!buildingId) return { error: "建物を選んでください", result: null };

  const codes = codesFromForm(form);
  if (codes.length === 0) {
    return { error: "作成する番号がありません。入力を確認してください", result: null };
  }

  const rent = String(form.get("listingRent") ?? "").trim();
  const result = await createUnits(ctx, {
    buildingId,
    type: form.get("type") === "parking" ? "parking" : "room",
    codes,
    listingRent: rent ? Number(rent) : null,
  });

  if (result.created === 0) {
    return { error: "すべて既存の番号でした。新しく作られたものはありません", result };
  }

  return redirect(`/units?created=${result.created}&skipped=${result.skipped.length}`);
}

/** 入力方式ごとに番号の一覧を組み立てる */
function codesFromForm(form: FormData): string[] {
  const mode = String(form.get("mode") ?? "floors");
  const num = (key: string, fallback: number) => {
    const value = Number(form.get(key));
    return Number.isFinite(value) ? value : fallback;
  };

  if (mode === "floors") {
    return generateFloorCodes({
      fromFloor: num("fromFloor", 1),
      toFloor: num("toFloor", 1),
      roomsPerFloor: num("roomsPerFloor", 1),
      startNumber: num("startNumber", 1),
      pad: num("pad", 2),
    });
  }

  if (mode === "sequential") {
    return generateSequentialCodes(
      String(form.get("prefix") ?? "P").trim(),
      num("from", 1),
      num("to", 1),
    );
  }

  return parseCodeList(String(form.get("codeList") ?? ""));
}

type Mode = "floors" | "sequential" | "list";

export default function UnitNew({ loaderData, actionData }: Route.ComponentProps) {
  const { buildings } = loaderData;
  const [mode, setMode] = useState<Mode>("floors");

  if (buildings.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-6">
        <h1 className="text-2xl font-bold">部屋の追加</h1>
        <p className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-4 text-base text-amber-900">
          先に建物を登録してください。
        </p>
        <Link
          to="/buildings/new"
          className="mt-4 inline-block rounded-xl bg-sky-600 px-4 py-3 text-lg font-bold text-white hover:bg-sky-700"
        >
          建物を登録する
        </Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-16">
      <Link to="/units" className="text-slate-500 hover:underline">
        ← 部屋・駐車場
      </Link>
      <h1 className="mt-3 text-2xl font-bold">部屋・駐車場の追加</h1>

      {actionData?.error && (
        <p className="mt-4 rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-base text-rose-900">
          {actionData.error}
        </p>
      )}

      <Form method="post" className="mt-6 space-y-5">
        <label className="block">
          <span className="text-base font-medium text-slate-700">建物</span>
          <select
            name="buildingId"
            defaultValue={buildings[0]?.id}
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-lg"
          >
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}（{b.unitCount}件）
              </option>
            ))}
          </select>
        </label>

        <fieldset>
          <legend className="text-base font-medium text-slate-700">種別</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Radio name="type" value="room" label="部屋" defaultChecked />
            <Radio name="type" value="parking" label="駐車場" />
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-base font-medium text-slate-700">番号の作り方</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-3">
            <ModeButton current={mode} value="floors" label="階から作る" onSelect={setMode} />
            <ModeButton current={mode} value="sequential" label="連番で作る" onSelect={setMode} />
            <ModeButton current={mode} value="list" label="番号を指定" onSelect={setMode} />
          </div>
        </fieldset>

        <input type="hidden" name="mode" value={mode} />

        {mode === "floors" && <FloorFields />}
        {mode === "sequential" && <SequentialFields />}
        {mode === "list" && <ListFields />}

        <label className="block">
          <span className="text-base font-medium text-slate-700">募集家賃（円）</span>
          <span className="mt-0.5 block text-sm text-slate-500">
            空のままでも構いません。入居中の部屋は、このあと個別に契約を登録します
          </span>
          <input
            type="number"
            name="listingRent"
            inputMode="numeric"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg tabular-nums"
          />
        </label>

        <button
          type="submit"
          className="w-full rounded-xl bg-sky-600 px-4 py-4 text-lg font-bold text-white hover:bg-sky-700"
        >
          まとめて作成する
        </button>
      </Form>
    </main>
  );
}

function FloorFields() {
  const [p, setP] = useState(DEFAULT_FLOOR_PATTERN);
  const codes = generateFloorCodes(p);
  const set = (key: keyof typeof p) => (value: number) => setP({ ...p, [key]: value });

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="開始階" name="fromFloor" value={p.fromFloor} onChange={set("fromFloor")} />
        <NumberField label="終了階" name="toFloor" value={p.toFloor} onChange={set("toFloor")} />
        <NumberField
          label="各階の部屋数"
          name="roomsPerFloor"
          value={p.roomsPerFloor}
          onChange={set("roomsPerFloor")}
        />
        <NumberField
          label="各階の開始番号"
          name="startNumber"
          value={p.startNumber}
          onChange={set("startNumber")}
        />
      </div>
      <input type="hidden" name="pad" value={p.pad} />
      <Preview codes={codes} />
    </div>
  );
}

function SequentialFields() {
  const [prefix, setPrefix] = useState("P");
  const [from, setFrom] = useState(1);
  const [to, setTo] = useState(5);
  const codes = generateSequentialCodes(prefix, from, to);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-sm font-medium text-slate-700">記号</span>
          <input
            type="text"
            name="prefix"
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg"
          />
        </label>
        <NumberField label="開始" name="from" value={from} onChange={setFrom} />
        <NumberField label="終了" name="to" value={to} onChange={setTo} />
      </div>
      <Preview codes={codes} />
    </div>
  );
}

function ListFields() {
  const [text, setText] = useState("");
  const codes = parseCodeList(text);

  return (
    <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-4">
      <label className="block">
        <span className="text-sm font-medium text-slate-700">番号を並べて入力</span>
        <span className="mt-0.5 block text-sm text-slate-500">
          改行・カンマ・スペースのどれで区切っても構いません
        </span>
        <textarea
          name="codeList"
          rows={4}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="101, 102, 103"
          className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-3 text-lg"
        />
      </label>
      <Preview codes={codes} />
    </div>
  );
}

/** 作成前に必ず結果が見えるようにする。一括生成は取り返しがつきにくいため */
function Preview({ codes }: { codes: string[] }) {
  const shown = codes.slice(0, 12);

  return (
    <div className="rounded-lg bg-slate-100 px-3 py-3">
      <p className="text-sm font-medium text-slate-700">
        作られる番号：{codes.length}件
        {codes.length >= MAX_UNITS_PER_BATCH && (
          <span className="ml-2 text-amber-700">（一度に作れるのは{MAX_UNITS_PER_BATCH}件まで）</span>
        )}
      </p>
      {codes.length > 0 && (
        <p className="mt-1 break-all text-base tabular-nums">
          {shown.join("、")}
          {codes.length > shown.length && ` … ${codes[codes.length - 1]}`}
        </p>
      )}
    </div>
  );
}

function NumberField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <input
        type="number"
        name={name}
        value={value}
        inputMode="numeric"
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg tabular-nums"
      />
    </label>
  );
}

function ModeButton({
  current,
  value,
  label,
  onSelect,
}: {
  current: Mode;
  value: Mode;
  label: string;
  onSelect: (mode: Mode) => void;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onSelect(value)}
      className={`rounded-lg border px-3 py-3 text-base ${
        active
          ? "border-sky-600 bg-sky-600 font-bold text-white"
          : "border-slate-300 bg-white hover:bg-slate-50"
      }`}
    >
      {label}
    </button>
  );
}

function Radio({
  name,
  value,
  label,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="cursor-pointer">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="peer sr-only"
      />
      <span className="block rounded-lg border border-slate-300 bg-white px-2 py-3 text-center text-base peer-checked:border-sky-600 peer-checked:bg-sky-600 peer-checked:font-bold peer-checked:text-white">
        {label}
      </span>
    </label>
  );
}
