"use client";

import { useState, useTransition } from "react";
import { LogOut, Pencil, UserMinus, UserPlus, X } from "lucide-react";
import { addMembersAction, removeMemberAction, renameGroupAction } from "@/app/actions/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { ChatUser, ConversationSummary, PresenceStatus } from "@/lib/chat/types";
import { MAX_GROUP_NAME } from "@/lib/chat/types";
import { UserPicker } from "./new-chat-dialog";
import { ChatAvatar, ErrorNote, Modal } from "./parts";
import { PRESENCE_META } from "./utils";

type Me = { id: string; role: "ADMIN" | "EMPLOYEE" };

/** لوحة تفاصيل المحادثة: الأعضاء وحالتهم، وللجروب: تغيير الاسم والإضافة والشيل والخروج */
export function ConversationInfo({
  conversation,
  me,
  users,
  presence,
  readOnly,
  onClose,
}: {
  conversation: ConversationSummary;
  me: Me;
  users: ChatUser[];
  presence: Record<string, PresenceStatus>;
  readOnly?: boolean;
  onClose: () => void;
}) {
  const isGroup = conversation.type === "GROUP";
  const canManage = isGroup && !readOnly && (me.role === "ADMIN" || conversation.myRole === "OWNER");
  const canAdd = isGroup && !readOnly && (conversation.isMember || me.role === "ADMIN");
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(conversation.title);
  const [adding, setAdding] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const act = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, after?: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) after?.();
      else setError(r.error);
    });

  const memberIds = new Set(conversation.members.map((m) => m.id));
  const addable = users.filter((u) => !memberIds.has(u.id));
  const members = [...conversation.members].sort((a, b) => Number(b.memberRole === "OWNER") - Number(a.memberRole === "OWNER") || a.name.localeCompare(b.name, "ar"));

  return (
    <aside className="flex h-full w-full flex-col bg-surface">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="font-semibold">{isGroup ? "تفاصيل الجروب" : conversation.type === "GENERAL" ? "القناة العامة" : "تفاصيل المحادثة"}</h2>
        <button onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-surface-2" aria-label="إغلاق">
          <X size={18} />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-3 border-b border-border p-4">
          {renaming ? (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                act(() => renameGroupAction(conversation.id, name), () => setRenaming(false));
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_GROUP_NAME} autoFocus aria-label="اسم الجروب" />
              <Button size="md" disabled={pending || !name.trim()}>
                حفظ
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-lg font-semibold">{conversation.title}</p>
              {canManage && (
                <button
                  onClick={() => {
                    setName(conversation.title);
                    setRenaming(true);
                  }}
                  className="rounded-lg p-2 text-muted hover:bg-surface-2"
                  aria-label="تغيير الاسم"
                  title="تغيير الاسم"
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>
          )}
          <p className="text-sm text-muted">{conversation.members.length} عضو</p>
          <ErrorNote error={error} onClose={() => setError(null)} />
          {canAdd && (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)} disabled={addable.length === 0}>
              <UserPlus size={16} /> ضيف أعضاء
            </Button>
          )}
        </div>
        <ul className="divide-y divide-border">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 px-4 py-2.5">
              <ChatAvatar name={m.name} status={presence[m.id] ?? "OFFLINE"} size={36} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {m.name}
                  {m.id === me.id && <span className="text-muted"> (انت)</span>}
                </p>
                <p className="truncate text-xs text-muted">
                  {m.memberRole === "OWNER" && isGroup ? "صاحب الجروب • " : ""}
                  {PRESENCE_META[presence[m.id] ?? "OFFLINE"].label}
                </p>
              </div>
              {canManage && m.id !== me.id && (
                <button
                  onClick={() => confirm(`تشيل ${m.name} من الجروب؟`) && act(() => removeMemberAction(conversation.id, m.id))}
                  disabled={pending}
                  className="rounded-lg p-2 text-muted hover:bg-danger-soft hover:text-danger"
                  aria-label={`شيل ${m.name}`}
                  title="شيل من الجروب"
                >
                  <UserMinus size={16} />
                </button>
              )}
            </li>
          ))}
        </ul>
      </div>
      {isGroup && conversation.isMember && !readOnly && (
        <div className="border-t border-border p-4">
          <Button
            variant="secondary"
            className="w-full text-danger"
            disabled={pending}
            onClick={() => confirm("متأكد إنك عايز تخرج من الجروب؟") && act(() => removeMemberAction(conversation.id, me.id))}
          >
            <LogOut size={16} className="rotate-180" /> اخرج من الجروب
          </Button>
        </div>
      )}

      {adding && (
        <Modal title="ضيف أعضاء" onClose={() => setAdding(false)}>
          <UserPicker
            users={addable}
            presence={presence}
            multiple
            selected={picked}
            onPick={(u) =>
              setPicked((s) => {
                const next = new Set(s);
                if (next.has(u.id)) next.delete(u.id);
                else next.add(u.id);
                return next;
              })
            }
          />
          <div className="flex justify-end border-t border-border px-5 py-3">
            <Button
              disabled={pending || picked.size === 0}
              onClick={() =>
                act(
                  () => addMembersAction(conversation.id, [...picked]),
                  () => {
                    setPicked(new Set());
                    setAdding(false);
                  },
                )
              }
            >
              ضيف {picked.size ? `(${picked.size})` : ""}
            </Button>
          </div>
        </Modal>
      )}
    </aside>
  );
}
