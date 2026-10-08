import {
  multipleServiceGroupId,
  multipleServiceTitle,
  shortServiceName,
  timeToMinutes,
} from "@/lib/multiple-services";
import type { RosterShiftCard } from "@/types/roster";

export type RosterSingleCardItem = {
  kind: "single";
  key: string;
  card: RosterShiftCard;
};

export type RosterMultipleServiceCardItem = {
  kind: "multiple-service";
  key: string;
  groupId: string;
  card: RosterShiftCard;
  memberCards: RosterShiftCard[];
  shiftIds: number[];
  title: string;
  serviceSummary: string;
  kaipokeCsIds: Array<string | number>;
  clientFieldsMixed: {
    gender: boolean;
    note: boolean;
  };
};

export type RosterRenderItem = RosterSingleCardItem | RosterMultipleServiceCardItem;

export function rosterCardShiftId(card: RosterShiftCard) {
  if (Number.isFinite(card.dialog?.shift_id)) return Number(card.dialog?.shift_id);
  const separator = card.id.lastIndexOf("_");
  return Number(separator < 0 ? card.id : card.id.slice(0, separator));
}

function groupTitle(cards: RosterShiftCard[]) {
  return multipleServiceTitle(
    cards.map((card) => ({
      shift_id: rosterCardShiftId(card),
      shift_start_date: card.dialog?.shift_date ?? "",
      shift_start_time: card.start_at,
      shift_end_time: card.end_at,
      service_code: card.service_code,
      client_name: card.client_name,
      kaipoke_cs_id: card.kaipoke_cs_id,
      multiple_service_group_id: card.multiple_service_group_id,
    })),
  );
}

function distinctText(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean)));
}

function distinctValues(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").trim())));
}

export function buildRosterRenderItems(cards: RosterShiftCard[], enabled: boolean): RosterRenderItem[] {
  if (!enabled) {
    return cards.map((card) => ({ kind: "single", key: card.id, card }));
  }

  const singles: RosterSingleCardItem[] = [];
  const grouped = new Map<string, { groupId: string; cards: RosterShiftCard[] }>();

  for (const card of cards) {
    const groupId = multipleServiceGroupId({
      shift_id: rosterCardShiftId(card),
      shift_start_date: card.dialog?.shift_date ?? "",
      shift_start_time: card.start_at,
      shift_end_time: card.end_at,
      multiple_service_group_id:
        card.dialog?.multiple_service_group_id ?? card.multiple_service_group_id ?? null,
    });

    if (!groupId) {
      singles.push({ kind: "single", key: card.id, card });
      continue;
    }

    const key = `${groupId}::${card.staff_id}::${card.staff_slot ?? 1}`;
    const entry = grouped.get(key) ?? { groupId, cards: [] };
    entry.cards.push(card);
    grouped.set(key, entry);
  }

  const items: RosterRenderItem[] = [...singles];

  for (const [key, entry] of grouped) {
    const uniqueCards = Array.from(
      new Map(entry.cards.map((card) => [rosterCardShiftId(card), card])).values(),
    ).sort((left, right) => timeToMinutes(left.start_at) - timeToMinutes(right.start_at));

    if (uniqueCards.length < 2) {
      items.push(...uniqueCards.map((card) => ({ kind: "single" as const, key: card.id, card })));
      continue;
    }

    const first = uniqueCards[0];
    const last = uniqueCards.reduce((latest, card) =>
      timeToMinutes(card.end_at) >= timeToMinutes(latest.end_at) ? card : latest
    );
    const representative =
      uniqueCards.find((card) => card.spot_status === "確定") ??
      uniqueCards.find((card) => card.spot_status === "募集中") ??
      first;
    const title = groupTitle(uniqueCards);
    const services = Array.from(
      new Set(uniqueCards.map((card) => shortServiceName(card.service_code))),
    );
    const clientNames = distinctText(uniqueCards.map((card) => card.client_name));
    const regions = distinctText(uniqueCards.map((card) => card.dsp_short));
    const addresses = distinctText(uniqueCards.map((card) => card.dialog?.address));
    const mapUrls = distinctText(uniqueCards.map((card) => card.dialog?.map_url));
    const genderRequests = distinctValues(uniqueCards.map((card) => card.dialog?.gender_request));
    const genderNames = distinctValues(uniqueCards.map((card) => card.dialog?.gender_request_name));
    const notes = distinctValues(uniqueCards.map((card) => card.dialog?.cs_note));
    const kaipokeCsIds = Array.from(
      new Map(
        uniqueCards
          .map((card) => card.kaipoke_cs_id ?? card.dialog?.kaipoke_cs_id)
          .filter((value): value is string | number => value != null && String(value).trim() !== "")
          .map((value) => [String(value), value]),
      ).values(),
    );
    const baseDialog = representative.dialog ?? first.dialog;
    const syntheticCard: RosterShiftCard = {
      ...representative,
      id: `multiple:${key}`,
      start_at: first.start_at,
      end_at: last.end_at,
      client_name: clientNames.join("・") || title,
      service_name: services.join(" → "),
      service_code: "",
      dsp_short: regions.join("・") || null,
      spot_status: uniqueCards.some((card) => card.spot_status === "確定")
        ? "確定"
        : uniqueCards.some((card) => card.spot_status === "募集中")
          ? "募集中"
          : null,
      dialog: baseDialog ? {
        ...baseDialog,
        start_at: first.start_at,
        end_at: last.end_at,
        client_name: clientNames.join("・") || baseDialog.client_name,
        service_name: services.join("・"),
        address: addresses.join("／") || baseDialog.address,
        map_url: mapUrls.length === 1 ? mapUrls[0] : null,
        gender_request: genderRequests.length === 1 ? genderRequests[0] || null : null,
        gender_request_name: genderNames.length === 1 ? genderNames[0] || null : null,
        cs_note: notes.length === 1 ? notes[0] : "",
        multiple_service_group_id: entry.groupId,
      } : undefined,
      multiple_service_group_id: entry.groupId,
    };

    items.push({
      kind: "multiple-service",
      key: syntheticCard.id,
      groupId: entry.groupId,
      card: syntheticCard,
      memberCards: uniqueCards,
      shiftIds: uniqueCards.map(rosterCardShiftId),
      title,
      serviceSummary: services.join(" → "),
      kaipokeCsIds,
      clientFieldsMixed: {
        gender: genderRequests.length > 1,
        note: notes.length > 1,
      },
    });
  }

  return items.sort(
    (left, right) =>
      left.card.staff_id.localeCompare(right.card.staff_id) ||
      timeToMinutes(left.card.start_at) - timeToMinutes(right.card.start_at),
  );
}
