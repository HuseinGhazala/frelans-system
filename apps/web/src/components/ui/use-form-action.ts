"use client";

import { startTransition, useActionState } from "react";
import type { ActionState } from "@/app/actions/types";

/**
 * زي useActionState بس من غير ما React يفضّي الفورم بعد الإرسال،
 * عشان لو في خطأ في حقل واحد المستخدم ما يكتبش كل حاجة من الأول.
 */
export function useFormAction(action: (state: ActionState, formData: FormData) => Promise<ActionState>) {
  const [state, dispatch, pending] = useActionState(action, null);
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(() => dispatch(formData));
  };
  return [state, onSubmit, pending] as const;
}
