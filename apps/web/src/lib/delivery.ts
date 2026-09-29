import "server-only";
import { db } from "./db";
import { getSettings } from "./settings";

export type TaskState = "DONE_ON_TIME" | "DONE_LATE" | "OVERDUE" | "OPEN";

export const TASK_STATE_LABEL: Record<TaskState, string> = {
  DONE_ON_TIME: "اتسلّم في ميعاده",
  DONE_LATE: "اتسلّم متأخر",
  OVERDUE: "متأخر ولسه ما اتسلمش",
  OPEN: "شغال عليه",
};

export type DeliveryCard = {
  id: string;
  name: string;
  url: string;
  boardName: string;
  listName: string;
  due: Date | null;
  completedAt: Date | null;
  state: TaskState;
  /** أيام التأخير (للمتأخر) */
  lateDays: number;
};

const DAY = 86_400_000;

/** حالة كارت بالنسبة لميعاد التسليم */
export function cardState(due: Date | null, completedAt: Date | null, now: Date): { state: TaskState; lateDays: number } {
  if (completedAt) {
    if (due && completedAt > due) return { state: "DONE_LATE", lateDays: Math.ceil((completedAt.getTime() - due.getTime()) / DAY) };
    return { state: "DONE_ON_TIME", lateDays: 0 };
  }
  if (due && due < now) return { state: "OVERDUE", lateDays: Math.ceil((now.getTime() - due.getTime()) / DAY) };
  return { state: "OPEN", lateDays: 0 };
}

/**
 * كروت الموظف في فترة: اللي اتسلمت فيها، أو ميعاد تسليمها فيها، أو لسه مفتوحة.
 * بيرجع [] لو الموظف مش مربوط بـ Trello.
 */
export async function employeeDelivery(userId: string, from: Date, to: Date, now = new Date()): Promise<DeliveryCard[]> {
  const [profile, { trello }] = await Promise.all([db.employeeProfile.findUnique({ where: { userId } }), getSettings()]);
  if (!profile?.trelloMemberId) return [];
  const cards = await db.trelloCard.findMany({
    where: {
      memberIds: { has: profile.trelloMemberId },
      boardId: { in: trello.boardIds },
      OR: [
        { completedAt: { gte: from, lt: to } },
        { completedAt: null, closed: false },
        { due: { gte: from, lt: to } },
      ],
    },
    include: { board: { select: { name: true } } },
    orderBy: [{ due: "asc" }, { name: "asc" }],
  });
  return cards.map((c) => ({
    id: c.id,
    name: c.name,
    url: c.url,
    boardName: c.board.name,
    listName: c.listName,
    due: c.due,
    completedAt: c.completedAt,
    ...cardState(c.due, c.completedAt, now),
  }));
}

export function deliveryStats(cards: DeliveryCard[]) {
  const count = (s: TaskState) => cards.filter((c) => c.state === s).length;
  const done = count("DONE_ON_TIME") + count("DONE_LATE");
  return {
    done,
    onTime: count("DONE_ON_TIME"),
    late: count("DONE_LATE"),
    overdue: count("OVERDUE"),
    open: count("OPEN"),
    onTimePercent: done ? Math.round((count("DONE_ON_TIME") / done) * 100) : null,
  };
}
