"use client";

import { useEffect, useState } from "react";
import {
  isSourcesViewEnabled,
  setSourcesViewEnabled,
} from "@/lib/dev-flags";

export default function AdminDevPage() {
  const [sourcesView, setSourcesView] = useState(false);

  useEffect(() => {
    setSourcesView(isSourcesViewEnabled());
  }, []);

  function toggleSourcesView(next: boolean) {
    setSourcesViewEnabled(next);
    setSourcesView(next);
  }

  return (
    <div className="admin-stack">
      <div className="admin-page-head">
        <h1>Dev tools</h1>
      </div>
      <p className="admin-muted">
        Local-only toggles stored in this browser. Use these to QA product
        surfaces that are hidden in production.
      </p>

      <section className="admin-section">
        <h2>Feed</h2>
        <label className="admin-toggle-row">
          <div>
            <strong>Sources filter</strong>
            <p className="admin-muted">
              Show the Sources dropdown on the feed and persist source filters
              in session prefs. Off by default for users; enable for adapter QA
              in dev.
            </p>
          </div>
          <input
            type="checkbox"
            checked={sourcesView}
            onChange={(e) => toggleSourcesView(e.target.checked)}
          />
        </label>
      </section>
    </div>
  );
}
