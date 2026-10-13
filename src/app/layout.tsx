import type { Metadata } from "next";
import { Bricolage_Grotesque, Zen_Kaku_Gothic_New } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

// コード名と数字に使う欧文書体。幅を詰めて、レコードジャケットの見出しのように組む
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  axes: ["wdth", "opsz"],
  variable: "--font-display",
});

// 日本語の本文。字数が多いので先読みはしない
const body = Zen_Kaku_Gothic_New({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-body",
  preload: false,
});

export const metadata: Metadata = {
  title: "Jev Session",
  description: "鍵盤から次のコードを選ぶと、Jevがそれに合わせたアドリブソロを展開するセッション",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${display.variable} ${body.variable}`}>
      <body>{children}</body>
    </html>
  );
}
