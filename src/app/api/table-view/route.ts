// src/app/api/table-view/route.ts

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type FilterOperator = "eq" | "ilike";

type FilterItem = {
  column: string;
  operator: FilterOperator;
  value: string;
};

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const tableName = searchParams.get("tableName");
    const select = searchParams.get("select") ?? "*";
    const limit = Number(searchParams.get("limit") ?? "50");
    const offset = Number(searchParams.get("offset") ?? "0");
    const sortColumn = searchParams.get("sortColumn");
    const sortAscending = searchParams.get("sortAscending") !== "false";
    const filtersRaw = searchParams.get("filters");

    if (!tableName) {
      return NextResponse.json(
        { ok: false, error: "tableName is required" },
        { status: 400 }
      );
    }

    const safeLimit = Number.isFinite(limit)
      ? Math.min(Math.max(limit, 1), 500)
      : 50;

    const safeOffset = Number.isFinite(offset)
      ? Math.max(offset, 0)
      : 0;

    let filters: FilterItem[] = [];
    if (filtersRaw) {
      try {
        const parsed = JSON.parse(filtersRaw);
        if (Array.isArray(parsed)) {
          filters = parsed.filter(
            (f): f is FilterItem =>
              !!f &&
              typeof f.column === "string" &&
              (f.operator === "eq" || f.operator === "ilike") &&
              typeof f.value === "string"
          );
        }
      } catch {
        return NextResponse.json(
          { ok: false, error: "filters JSON is invalid" },
          { status: 400 }
        );
      }
    }

    let countQuery = supabaseAdmin
      .from(tableName)
      .select("*", { count: "exact", head: true });

    let dataQuery = supabaseAdmin
      .from(tableName)
      .select(select, { count: "exact" });

    for (const filter of filters) {
      if (filter.operator === "eq") {
        countQuery = countQuery.eq(filter.column, filter.value);
        dataQuery = dataQuery.eq(filter.column, filter.value);
      } else {
        countQuery = countQuery.ilike(filter.column, `%${filter.value}%`);
        dataQuery = dataQuery.ilike(filter.column, `%${filter.value}%`);
      }
    }

    if (sortColumn) {
      dataQuery = dataQuery.order(sortColumn, { ascending: sortAscending });
    }

    dataQuery = dataQuery.range(safeOffset, safeOffset + safeLimit - 1);

    const [{ count, error: countError }, { data, error: dataError }] =
      await Promise.all([countQuery, dataQuery]);

    if (countError) {
      return NextResponse.json(
        { ok: false, error: countError.message },
        { status: 500 }
      );
    }

    if (dataError) {
      return NextResponse.json(
        { ok: false, error: dataError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      rows: Array.isArray(data) ? data : [],
      totalCount: count ?? 0,
      limit: safeLimit,
      offset: safeOffset,
    });
  } catch (e) {
    return NextResponse.json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}