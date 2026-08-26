import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ClubFit - Sistema de Asistencia",
  description: "Control de acceso y membresías para gimnasio",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
