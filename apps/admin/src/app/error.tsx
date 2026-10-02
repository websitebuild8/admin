'use client';
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="setup-page"><div className="setup-card"><h1>Something needs attention</h1><p>The workspace could not be loaded. Your saved records have not been changed.</p><button className="error-retry" onClick={reset}>Try again</button></div></main>; }
