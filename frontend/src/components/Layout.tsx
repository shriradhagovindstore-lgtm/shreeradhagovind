import { type ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { DiwaliDecoration } from "./DiwaliDecoration";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col relative">
      <DiwaliDecoration />
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
