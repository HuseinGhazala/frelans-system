export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <main className="flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-lg font-bold text-on-primary">ر</span>
            <span className="text-xl font-bold">راصد</span>
          </div>
          {children}
        </div>
      </main>
      <aside className="hidden flex-col justify-end bg-primary p-12 text-on-primary lg:flex">
        <div className="max-w-md">
          <p className="text-3xl font-bold leading-snug">تابع شغل فريقك عن بُعد بشفافية ووضوح</p>
          <p className="mt-4 opacity-80">الحضور، ساعات العمل، النشاط، الإجازات والمرتبات — في مكان واحد، وكل موظف شايف بياناته.</p>
        </div>
      </aside>
    </div>
  );
}
