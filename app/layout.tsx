import type { Metadata } from "next";
import { Geist, Geist_Mono, Figtree, Noto_Sans } from "next/font/google";
import "./globals.css";
import { cn } from "@/lib/utils";
import Navbar from "./navbar";

const notoSansHeading = Noto_Sans({subsets:['latin'],variable:'--font-heading'});

const figtree = Figtree({subsets:['latin'],variable:'--font-sans'});

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tekuchi Media Suite",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={cn("h-full", "antialiased", geistSans.variable, geistMono.variable, "font-sans", figtree.variable, notoSansHeading.variable)}
    >
      
      <body
        className={cn(
          "h-full antialiased bg-slate-50 font-sans",
          figtree.variable,
          notoSansHeading.variable
        )}
      >
        <div className="flex flex-col h-screen overflow-hidden">
          {/* Persistent Header */}
          <Navbar /> 
          
          {/* Main Content Area */}
          <main className="flex-grow overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
