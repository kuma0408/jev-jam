import type { Metadata } from "next";
import { Bricolage_Grotesque, Noto_Music, Zen_Kaku_Gothic_New } from "next/font/google";
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

// 五線譜のト音記号とフラットに使う、楽譜記号の書体
const music = Noto_Music({
  subsets: ["music"],
  weight: "400",
  variable: "--font-music",
  // 代わりの書体（寸法を合わせた端末の書体）を作らない。楽譜記号を持つ端末の書体は無く、
  // 作ると存在しない書体を読みに行って、ブラウザがネットワークエラーを出す
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Jev Session",
  description: "五線を叩いて和音を鳴らすと、Jevがそれに合わせてアドリブソロを展開するセッション",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja" className={`${display.variable} ${body.variable} ${music.variable}`}>
      <body>{children}</body>
    </html>
  );
}
