export type ActionState = {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string[] | undefined>;
  /** رابط دعوة/استعادة يظهر للأدمن لو الإيميل مش متظبط */
  link?: string;
  id?: string;
} | null;
