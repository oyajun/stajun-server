import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "JunJun - 勉強SNS",
  description: "今、何を勉強しているかを共有するSNS",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
