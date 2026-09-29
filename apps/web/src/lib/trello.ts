import "server-only";
import { db } from "./db";
import { getSettings, saveSettingsSection } from "./settings";

const API = () => (process.env.TRELLO_API_URL ?? "https://api.trello.com/1").replace(/\/$/, "");

export class TrelloError extends Error {}

async function trello<T>(path: string, auth: { apiKey: string; token: string }, params: Record<string, string> = {}): Promise<T> {
  const qs = new URLSearchParams({ ...params, key: auth.apiKey, token: auth.token });
  const res = await fetch(`${API()}${path}?${qs}`, { signal: AbortSignal.timeout(20_000), cache: "no-store" });
  if (res.status === 401) throw new TrelloError("مفتاح Trello أو التوكن غير صحيح");
  if (!res.ok) throw new TrelloError(`Trello رد بخطأ (${res.status})`);
  return (await res.json()) as T;
}

type ApiBoard = { id: string; name: string; url: string; closed: boolean };
type ApiList = { id: string; name: string };
type ApiCard = { id: string; name: string; url: string; idList: string; idMembers: string[]; closed: boolean; due: string | null; dateLastActivity: string | null };
type ApiMember = { id: string; fullName: string; username: string };

/** البوردات اللي الحساب ده يقدر يشوفها (لاختيار البوردات من الإعدادات) */
export async function listBoards(auth: { apiKey: string; token: string }) {
  const boards = await trello<ApiBoard[]>("/members/me/boards", auth, { fields: "name,url,closed", filter: "open" });
  return boards.map((b) => ({ id: b.id, name: b.name, url: b.url }));
}

/** مزامنة البوردات المختارة: الكروت المفتوحة والأعضاء */
export async function syncTrello(now = new Date()) {
  const { trello: cfg } = await getSettings();
  if (!cfg.apiKey || !cfg.token || !cfg.boardIds.length) return { boards: 0, cards: 0 };
  let cardCount = 0;
  for (const boardId of cfg.boardIds) {
    const [board, lists, cards, members] = await Promise.all([
      trello<ApiBoard>(`/boards/${boardId}`, cfg, { fields: "name,url,closed" }),
      trello<ApiList[]>(`/boards/${boardId}/lists`, cfg, { fields: "name" }),
      trello<ApiCard[]>(`/boards/${boardId}/cards`, cfg, { fields: "name,url,idList,idMembers,closed,due,dateLastActivity", filter: "open" }),
      trello<ApiMember[]>(`/boards/${boardId}/members`, cfg, { fields: "fullName,username" }),
    ]);
    const listNames = new Map(lists.map((l) => [l.id, l.name]));
    const doneNames = new Set(cfg.doneListNames.map((n) => n.trim().toLowerCase()));
    const previous = new Map(
      (await db.trelloCard.findMany({ where: { boardId: board.id }, select: { id: true, completedAt: true } })).map((c) => [c.id, c.completedAt]),
    );
    await db.trelloBoard.upsert({
      where: { id: board.id },
      create: { id: board.id, name: board.name, url: board.url, closed: board.closed, syncedAt: now },
      update: { name: board.name, url: board.url, closed: board.closed, syncedAt: now },
    });
    for (const m of members) {
      await db.trelloMember.upsert({ where: { id: m.id }, create: m, update: { fullName: m.fullName, username: m.username } });
    }
    for (const c of cards) {
      const listName = listNames.get(c.idList) ?? "";
      const done = doneNames.has(listName.trim().toLowerCase());
      const lastActivity = c.dateLastActivity ? new Date(c.dateLastActivity) : null;
      const data = {
        boardId: board.id,
        listId: c.idList,
        listName,
        // أول مرة نشوفه في ليست "خلصت" بناخد آخر نشاط عليه كوقت التسليم
        completedAt: done ? (previous.get(c.id) ?? lastActivity ?? now) : null,
        name: c.name,
        url: c.url,
        closed: c.closed,
        due: c.due ? new Date(c.due) : null,
        memberIds: c.idMembers,
        lastActivity,
        syncedAt: now,
      };
      await db.trelloCard.upsert({ where: { id: c.id }, create: { id: c.id, ...data }, update: data });
    }
    // الكروت اللي ما رجعتش = اتقفلت أو اتنقلت (بنسيبها عشان الوقت المسجل عليها)
    await db.trelloCard.updateMany({ where: { boardId: board.id, syncedAt: { lt: now } }, data: { closed: true } });
    cardCount += cards.length;
  }
  return { boards: cfg.boardIds.length, cards: cardCount };
}

/** أسماء الليستات في البوردات المختارة (عشان الأدمن يختار ليستات "خلصت") */
export async function listNamesForBoards(auth: { apiKey: string; token: string }, boardIds: string[]) {
  const names = new Set<string>();
  for (const id of boardIds) {
    for (const l of await trello<ApiList[]>(`/boards/${id}/lists`, auth, { fields: "name", filter: "open" })) names.add(l.name);
  }
  return [...names];
}

export async function saveDoneLists(names: string[]) {
  const { trello: cfg } = await getSettings();
  await saveSettingsSection("trello", { ...cfg, doneListNames: names });
}

export async function saveTrelloBoards(boardIds: string[]) {
  const { trello: cfg } = await getSettings();
  await saveSettingsSection("trello", { ...cfg, boardIds });
}

/** الكروت المفتوحة المسندة لموظف (للبرنامج) */
export async function cardsForUser(userId: string) {
  const [profile, { trello: cfg }] = await Promise.all([db.employeeProfile.findUnique({ where: { userId } }), getSettings()]);
  if (!profile?.trelloMemberId) return [];
  const cards = await db.trelloCard.findMany({
    where: { closed: false, memberIds: { has: profile.trelloMemberId }, boardId: { in: cfg.boardIds } },
    include: { board: { select: { name: true } } },
    orderBy: [{ lastActivity: "desc" }],
    take: 200,
  });
  return cards.map((c) => ({ id: c.id, name: c.name, url: c.url, boardName: c.board.name, listName: c.listName, due: c.due?.toISOString() ?? null }));
}
