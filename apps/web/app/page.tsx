import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-900 to-slate-800 text-white">
      {/* Navigation */}
      <nav className="container mx-auto px-6 py-4 flex justify-between items-center">
        <div className="text-2xl font-bold text-purple-400">MultiStream</div>
        <div className="space-x-4">
          <Link href="/dashboard" className="hover:text-purple-400 transition">Dashboard</Link>
          <Link href="/login" className="hover:text-purple-400 transition">Login</Link>
          <Link href="/register" className="bg-purple-600 px-4 py-2 rounded-lg hover:bg-purple-700 transition">Get Started</Link>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold mb-6">
          Stream to <span className="text-purple-400">Multiple Platforms</span> Simultaneously
        </h1>
        <p className="text-xl text-gray-300 mb-8 max-w-2xl mx-auto">
          Go live on YouTube, Facebook, Twitch, LinkedIn, and more with a single stream. 
          Professional multistreaming made simple.
        </p>
        <div className="flex gap-4 justify-center">
          <Link href="/register" className="bg-purple-600 px-8 py-4 rounded-lg text-lg font-semibold hover:bg-purple-700 transition">
            Start Streaming Free
          </Link>
          <Link href="#features" className="border border-gray-600 px-8 py-4 rounded-lg text-lg hover:border-purple-400 transition">
            Learn More
          </Link>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="container mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Powerful Features</h2>
        <div className="grid md:grid-cols-3 gap-8">
          <div className="bg-slate-800 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-2 text-purple-400">Multistreaming</h3>
            <p className="text-gray-400">Broadcast to unlimited destinations simultaneously with our FFmpeg-powered engine.</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-2 text-purple-400">Browser Studio</h3>
            <p className="text-gray-400">Professional live studio in your browser with guests, overlays, and screen sharing.</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-2 text-purple-400">Unified Chat</h3>
            <p className="text-gray-400">Aggregate chat from all platforms into one streamlined interface.</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-2 text-purple-400">Scheduled Streams</h3>
            <p className="text-gray-400">Pre-record and schedule streams to go live automatically.</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-2 text-purple-400">Hosted Pages</h3>
            <p className="text-gray-400">Custom branded live pages with your domain for professional presentations.</p>
          </div>
          <div className="bg-slate-800 p-6 rounded-xl">
            <h3 className="text-xl font-semibold mb-2 text-purple-400">Analytics</h3>
            <p className="text-gray-400">Track viewer counts, engagement, and performance across all platforms.</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Simple Pricing</h2>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="bg-slate-800 p-8 rounded-xl">
            <h3 className="text-2xl font-bold mb-2">Free</h3>
            <p className="text-4xl font-bold mb-4">$0<span className="text-lg text-gray-400">/mo</span></p>
            <ul className="space-y-2 text-gray-400 mb-6">
              <li>✓ 3 Destinations</li>
              <li>✓ 720p HD Quality</li>
              <li>✓ Basic Analytics</li>
            </ul>
            <Link href="/register" className="block text-center border border-purple-600 text-purple-400 py-2 rounded-lg hover:bg-purple-600 hover:text-white transition">Get Started</Link>
          </div>
          <div className="bg-purple-900 p-8 rounded-xl border-2 border-purple-600">
            <h3 className="text-2xl font-bold mb-2">Pro</h3>
            <p className="text-4xl font-bold mb-4">$19<span className="text-lg text-gray-400">/mo</span></p>
            <ul className="space-y-2 text-gray-300 mb-6">
              <li>✓ 10 Destinations</li>
              <li>✓ 1080p Full HD</li>
              <li>✓ Priority Support</li>
              <li>✓ Scheduled Streams</li>
            </ul>
            <Link href="/register" className="block text-center bg-purple-600 py-2 rounded-lg hover:bg-purple-700 transition">Start Free Trial</Link>
          </div>
          <div className="bg-slate-800 p-8 rounded-xl">
            <h3 className="text-2xl font-bold mb-2">Business</h3>
            <p className="text-4xl font-bold mb-4">$49<span className="text-lg text-gray-400">/mo</span></p>
            <ul className="space-y-2 text-gray-400 mb-6">
              <li>✓ Unlimited Destinations</li>
              <li>✓ 4K Ultra HD</li>
              <li>✓ Team Management</li>
              <li>✓ Custom Branding</li>
            </ul>
            <Link href="/register" className="block text-center border border-purple-600 text-purple-400 py-2 rounded-lg hover:bg-purple-600 hover:text-white transition">Contact Sales</Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-700 mt-20 py-8">
        <div className="container mx-auto px-6 text-center text-gray-400">
          <p>&copy; 2024 MultiStream. All rights reserved.</p>
        </div>
      </footer>
    </main>
  );
}
