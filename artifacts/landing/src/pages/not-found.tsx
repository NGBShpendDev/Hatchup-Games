import { Link } from "wouter";

export default function NotFound() {
  return (
    <div className="grid min-h-screen place-items-center bg-[var(--hatchup-bg)] text-[var(--hatchup-text)]">
      <div className="text-center">
        <h1 className="moonlit-text-gradient mb-3 font-display text-6xl font-bold">404</h1>
        <p className="mb-6 text-[var(--hatchup-muted)]">That page hasn't hatched yet.</p>
        <Link
          to="/"
          className="inline-block rounded-full bg-[var(--hatchup-primary)] px-5 py-2 font-medium text-white hover:bg-[var(--hatchup-primary-deep)]"
        >
          Back home
        </Link>
      </div>
    </div>
  );
}
