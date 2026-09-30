import './globals.css';
import Providers from '@/components/Providers';

export const metadata = {
  title: 'LaughingStock • Stock Portfolio & Signal Portal',
  description: 'Multi-User Stock Portfolio Manager, Historical Pattern Miner, and App Universe Trading Signals',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
