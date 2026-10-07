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
    const title = groupTitle(uniqueCards);
    const services = Array.from(
      new Set(uniqueCards.map((card) => shortServiceName(card.service_code))),
    );
    const syntheticCard: RosterShiftCard = {
      ...first,
      id: `multiple:${key}`,
      start_at: first.start_at,
      end_at: last.end_at,
      client_name: title,
      service_name: services.join(" → "),
      service_code: "",
      dialog: undefined,
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
    });
  }

  return items.sort(
    (left, right) =>
      left.card.staff_id.localeCompare(right.card.staff_id) ||
      timeToMinutes(left.card.start_at) - timeToMinutes(right.card.start_at),
  );
}
