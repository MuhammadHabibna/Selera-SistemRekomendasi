import "./globals.css";
import { Inter } from "next/font/google";
import NavBar from "@/components/NavBar";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata = {
  title: "Selera — Rekomendasi Produk Personal",
  description:
    "Selera memahami seleramu: rekomendasi produk yang belajar dari like, rating, dan jelajahmu — dijelaskan oleh Generative AI.",
  other: {
    "dicoding:email": "muhammadhabibna@gmail.com",
  },
  openGraph: {
    title: "Selera — Rekomendasi Produk Personal",
    description:
      "Rekomendasi produk yang belajar dari like, rating, dan jelajahmu — dijelaskan oleh Generative AI.",
    type: "website",
    locale: "id_ID",
    siteName: "Selera",
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id" className={inter.variable}>
      <body>
        <NavBar />
        {children}
      </body>
    </html>
  );
}
