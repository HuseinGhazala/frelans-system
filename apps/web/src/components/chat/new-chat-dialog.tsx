"use client";

import { useState, useTransition } from "react";
import { Check, Search } from "lucide-react";
import { createGroupAction, openDirectAction } from "@/app/actions/chat";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import type { ChatUser, ConversationSummary, PresenceStatus } from "@/lib/chat/types";
import { MAX_GROUP_NAME } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { ChatAvatar, ErrorNote, Modal } from "./parts";

/** قائمة مستخدمين بالبحث — اختيار واحد (خاص) أو أكتر (جروب) */
export function UserPicker({
  users,
  presence,
  selected,
  onPick,
  multiple,
}: {
  users: ChatUser[];
  presence: Record<string, PresenceStatus>;
  selected?: Set<string>;
  onPick: (u: ChatUser) => void;
  multiple?: boolean;
}) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = users.filter((u) => !query || u.name.toLowerCase().includes(query) || u.jobTitle?.toLowerCase().includes(query));
  return (
    <div>
      <div className="relative px-5 pt-3">
        <Search size={16} className="pointer-events-none absolute right-8 top-1/2 mt-1.5 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر على اسم..." className="pr-9" autoFocus />
      </div>
      <ul className="max-h-[45dvh] overflow-y-auto px-2 py-2">
        {list.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">مفيش نتايج</li>}
        {list.map((u) => {
          const on = selected?.has(u.id);
          return (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPick(u)}
                className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-right hover:bg-surface-2", on && "bg-primary-soft/60")}
                aria-pressed={multiple ? on : undefined}
              >
                <ChatAvatar name={u.name} status={presence[u.id] ?? "OFFLINE"} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{u.name}</span>
                  <span className="block truncate text-xs text-muted">{u.role === "ADMIN" ? "المدير" : u.jobTitle ?? "موظف"}</span>
                </span>
                {multiple && (
                  <span className={cn("flex h-5 w-5 items-center justify-center rounded border", on ? "border-primary bg-primary text-on-primary" : "border-border")}>
                    {on && <Check size={14} />}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function NewChatDialog({
  users,
  presence,
  onClose,
  onOpened,
}: {
  users: ChatUser[];
  presence: Record<string, PresenceStatus>;
  onClose: () => void;
  onOpened: (c: ConversationSummary) => void;
}) {
  const [tab, setTab] = useState<"direct" | "group">("direct");
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const openDirect = (u: ChatUser) =>
    start(async () => {
      const r = await openDirectAction(u.id);
      if (r.ok) onOpened(r.data);
      else setError(r.error);
    });

  const toggle = (u: ChatUser) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(u.id)) next.delete(u.id);
      else next.add(u.id);
      return next;
    });

  const create = () =>
    start(async () => {
      const r = await createGroupAction({ name, memberIds: [...selected] });
      if (r.ok) onOpened(r.data);
      else setError(r.error);
    });

  return (
    <Modal title="محادثة جديدة" onClose={onClose}>
      <div className="flex gap-1 border-b border-border px-5 pt-3">
        {(
          [
            ["direct", "رسالة خاصة"],
            ["group", "جروب جديد"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn("-mb-px border-b-2 px-3 py-2 text-sm font-medium", tab === key ? "border-primary text-primary" : "border-transparent text-muted hover:text-text")}
          >
            {label}
          </button>
        ))}
      </div>
      {error && (
        <div className="px-5 pt-3">
          <ErrorNote error={error} onClose={() => setError(null)} />
        </div>
      )}
      {tab === "direct" ? (
        <UserPicker users={users} presence={presence} onPick={(u) => !pending && openDirect(u)} />
      ) : (
        <>
          <div className="px-5 pt-3">
            <label htmlFor="group-name" className="mb-1.5 block text-sm font-medium">
              اسم الجروب
            </label>
            <Input id="group-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={MAX_GROUP_NAME} placeholder="مثلاً: فريق التصميم" />
          </div>
          <UserPicker users={users} presence={presence} selected={selected} onPick={toggle} multiple />
          <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3">
            <span className="text-sm text-muted">{selected.size ? `اخترت ${selected.size}` : "اختار الأعضاء"}</span>
            <Button onClick={create} disabled={pending || !name.trim() || selected.size === 0}>
              اعمل الجروب
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}
