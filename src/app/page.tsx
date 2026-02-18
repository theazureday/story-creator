'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';

export default function Home() {
  const { user, userData } = useAuth();

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Navigation Bar */}
      <nav className="sticky top-0 z-50 bg-gray-950/80 backdrop-blur-sm border-b border-gray-800/50">
        <div className="max-w-6xl mx-auto px-4 py-3 flex justify-between items-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="text-violet-400 text-xl">✦</span>
            <span className="font-bold text-lg">Story Creator</span>
          </Link>

          <div className="hidden md:flex items-center gap-6">
            <Link href="/browse" className="text-sm text-gray-400 hover:text-white transition">
              Browse
            </Link>
            <Link href="/create" className="text-sm text-gray-400 hover:text-white transition">
              Create
            </Link>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="text-sm text-gray-300 hidden sm:inline">
                  {userData?.displayName || user.displayName}
                </span>
                <Link
                  href="/create"
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm transition"
                >
                  Dashboard
                </Link>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm text-gray-400 hover:text-white transition">
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-lg text-sm transition"
                >
                  Sign Up
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-4xl mx-auto px-4 py-20 md:py-32 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-violet-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
          Story Creator
        </h1>
        <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
          Build interactive AI visual novels with dynamic characters, branching dialogue, and
          player-driven story progression.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/create"
            className="px-6 py-3 bg-violet-600 hover:bg-violet-500 rounded-xl font-semibold transition hover:shadow-lg hover:shadow-violet-500/20"
          >
            Start Creating
          </Link>
          <Link
            href="/browse"
            className="px-6 py-3 border border-gray-700 hover:border-violet-500 text-gray-300 hover:text-white rounded-xl font-semibold transition"
          >
            Browse Stories
          </Link>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 pb-20">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6 hover:border-violet-500/30 transition">
            <div className="text-2xl mb-3">🎭</div>
            <h3 className="font-semibold mb-2">AI Characters</h3>
            <p className="text-sm text-gray-400">
              Generate anime-style character sprites with NovelAI, or upload your own art. Each
              character has 7 dynamic expressions.
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6 hover:border-violet-500/30 transition">
            <div className="text-2xl mb-3">💬</div>
            <h3 className="font-semibold mb-2">Dynamic Dialogue</h3>
            <p className="text-sm text-gray-400">
              Characters respond in real-time with AI-generated dialogue. Emotions and expressions
              change based on the conversation.
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6 hover:border-violet-500/30 transition">
            <div className="text-2xl mb-3">🎯</div>
            <h3 className="font-semibold mb-2">Win Conditions</h3>
            <p className="text-sm text-gray-400">
              Set objectives per scene that players must achieve through dialogue choices to
              progress the story.
            </p>
          </div>
          <div className="bg-gray-900/50 border border-gray-800/50 rounded-xl p-6 hover:border-violet-500/30 transition">
            <div className="text-2xl mb-3">📱</div>
            <h3 className="font-semibold mb-2">Mobile-First VN</h3>
            <p className="text-sm text-gray-400">
              Vertical visual novel layout designed for phone browsers. Characters fade in/out with
              smooth expression transitions.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800/50 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-gray-600 text-sm">
          <p>&copy; 2026 Story Creator. Built with Next.js, Firebase, Gemini & NovelAI.</p>
        </div>
      </footer>
    </div>
  );
}
