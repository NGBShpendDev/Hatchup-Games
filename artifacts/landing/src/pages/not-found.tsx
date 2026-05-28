import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="min-h-screen grid place-items-center bg-[hsl(var(--background))] text-white">
      <div className="text-center">
        <h1 className="font-display text-6xl font-bold mb-3 neon-text">404</h1>
        <p className="text-white/60 mb-6">That page hasn't hatched yet.</p>
        <Link to="/" className="inline-block rounded-full bg-pink-500 hover:bg-pink-400 px-5 py-2 font-medium">
          Back home
        </Link>
      </div>
    </div>
  );
}
