import Navbar from './components/Navbar';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-gray-900">
      <Navbar />
      <main className="flex-1 flex flex-col relative">
        {children}
      </main>
    </div>
  );
}