import "server-only";
import { db } from "./db";

/** الوقت على كل كارت Trello (بالدقايق) في فترة، مقسم على الموظفين */
export async function taskTime(from: Date, to: Date, boardId?: string) {
  const [grouped, noTask] = await Promise.all([
    db.activityMinute.groupBy({
      by: ["trelloCardId", "userId"],
      where: { minute: { gte: from, lt: to }, idle: false, trelloCardId: { not: null } },
      _count: true,
    }),
    db.activityMinute.count({ where: { minute: { gte: from, lt: to }, idle: false, trelloCardId: null } }),
  ]);
  const cardIds = [...new Set(grouped.map((g) => g.trelloCardId!))];
  const userIds = [...new Set(grouped.map((g) => g.userId))];
  const [cards, users] = await Promise.all([
    db.trelloCard.findMany({ where: { id: { in: cardIds } }, include: { board: { select: { id: true, name: true } } } }),
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
  ]);
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const rows = cards
    .filter((c) => !boardId || c.boardId === boardId)
    .map((c) => {
      const per = grouped.filter((g) => g.trelloCardId === c.id).map((g) => ({ userId: g.userId, name: userName.get(g.userId) ?? "—", minutes: g._count }));
      return {
        id: c.id,
        name: c.name,
        url: c.url,
        boardId: c.board.id,
        boardName: c.board.name,
        listName: c.listName,
        closed: c.closed,
        minutes: per.reduce((t, p) => t + p.minutes, 0),
        perUser: per.sort((a, b) => b.minutes - a.minutes),
      };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const perBoard = new Map<string, { name: string; minutes: number }>();
  for (const r of rows) perBoard.set(r.boardId, { name: r.boardName, minutes: (perBoard.get(r.boardId)?.minutes ?? 0) + r.minutes });
  return { rows, noTaskMinutes: noTask, perBoard: [...perBoard.values()].sort((a, b) => b.minutes - a.minutes) };
}
