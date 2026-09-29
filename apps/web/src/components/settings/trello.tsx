"use client";

import { useState, useTransition } from "react";
import { chooseDoneLists, chooseTrelloBoards, connectTrello, disconnectTrello, syncTrelloNow } from "@/app/actions/trello";
import type { ActionState } from "@/app/actions/types";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { useFormAction } from "@/components/ui/use-form-action";

export function TrelloSettings({
  apiKey,
  hasToken,
  boards,
  selected,
  boardsError,
  lastSync,
  listNames,
  doneLists,
}: {
  apiKey: string;
  hasToken: boolean;
  boards: { id: string; name: string }[];
  selected: string[];
  boardsError: string | null;
  lastSync: string | null;
  listNames: string[];
  doneLists: string[];
}) {
  const [doneState, saveDone, savingDone] = useFormAction(chooseDoneLists);
  const [connState, connect, connecting] = useFormAction(connectTrello);
  const [boardState, saveBoards, saving] = useFormAction(chooseTrelloBoards);
  const [syncState, setSyncState] = useState<ActionState>(null);
  const [busy, start] = useTransition();
  const connected = Boolean(apiKey && hasToken);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="ربط Trello"
          description="من trello.com/power-ups/admin اعمل Power-Up وخد الـ API Key، وبعدين اضغط على رابط Token جنبه عشان تطلع التوكن."
        />
        <form onSubmit={connect} className="space-y-4 p-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="API Key" htmlFor="apiKey">
              <Input id="apiKey" name="apiKey" dir="ltr" defaultValue={apiKey} autoComplete="off" required />
            </Field>
            <Field label="Token" htmlFor="token" hint={hasToken ? "متسجل — سيبه فاضي عشان يفضل زي ما هو" : undefined}>
              <Input id="token" name="token" type="password" dir="ltr" autoComplete="off" required={!hasToken} />
            </Field>
          </div>
          <FormMessage state={connState} />
          <div className="flex gap-3">
            <Button type="submit" disabled={connecting}>{connected ? "تحديث الربط" : "ربط"}</Button>
            {connected && (
              <Button type="button" variant="ghost" className="text-danger" disabled={busy} onClick={() => confirm("إلغاء ربط Trello؟") && start(() => disconnectTrello())}>
                إلغاء الربط
              </Button>
            )}
          </div>
        </form>
      </Card>

      {connected && (
        <Card>
          <CardHeader title="البوردات" description={`الكروت اللي في البوردات دي هتظهر للموظفين في البرنامج. ${lastSync ? `آخر مزامنة: ${lastSync}` : ""}`} />
          {boardsError ? (
            <p className="p-5 text-sm text-danger">{boardsError}</p>
          ) : (
            <form onSubmit={saveBoards} className="space-y-4 p-5">
              <div className="grid gap-2 sm:grid-cols-2">
                {boards.map((b) => (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                    <input type="checkbox" name="boardIds" value={b.id} defaultChecked={selected.includes(b.id)} className="h-4 w-4 accent-[var(--primary)]" />
                    <span dir="auto">{b.name}</span>
                  </label>
                ))}
              </div>
              <FormMessage state={boardState} />
              <div className="flex gap-3">
                <Button type="submit" disabled={saving}>حفظ ومزامنة</Button>
                <Button type="button" variant="secondary" disabled={busy} onClick={() => start(async () => setSyncState(await syncTrelloNow()))}>
                  مزامنة الآن
                </Button>
              </div>
              <FormMessage state={syncState} />
            </form>
          )}
        </Card>
      )}

      {connected && selected.length > 0 && listNames.length > 0 && (
        <Card>
          <CardHeader title="ليستات التسليم" description="لموظفين نظام التاسكات: الكارت لما يتنقل لليست من دول يتحسب اتسلّم، ولو بعد ميعاد التسليم (Due) يتعلّم متأخر." />
          <form onSubmit={saveDone} className="space-y-4 p-5">
            <div className="grid gap-2 sm:grid-cols-3">
              {listNames.map((n) => (
                <label key={n} className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
                  <input type="checkbox" name="doneLists" value={n} defaultChecked={doneLists.some((d) => d.trim().toLowerCase() === n.trim().toLowerCase())} className="h-4 w-4 accent-[var(--primary)]" />
                  <span dir="auto">{n}</span>
                </label>
              ))}
            </div>
            <FormMessage state={doneState} />
            <Button type="submit" disabled={savingDone}>حفظ</Button>
          </form>
        </Card>
      )}
    </div>
  );
}
