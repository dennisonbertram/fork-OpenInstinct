import {
  browserActivityKinds,
  type BrowserActivityDurations,
  type BrowserActivityKind,
} from "@/lib/browser-activity";

const activityPresentation: Record<
  BrowserActivityKind,
  { className: string; label: string }
> = {
  model: { className: "bg-activity-1", label: "Model" },
  playwright: { className: "bg-activity-2", label: "Playwright" },
  semantic: { className: "bg-activity-3", label: "Browser DOM" },
  visual: { className: "bg-activity-4", label: "Visual CUA" },
  web: { className: "bg-activity-5", label: "Web" },
  vault: { className: "bg-activity-6", label: "Vault" },
  setup: { className: "bg-activity-7", label: "Setup" },
  waiting: { className: "bg-activity-8", label: "Waiting" },
  other: { className: "bg-activity-9", label: "Other" },
};

export function ActivityDurationBreakdown({
  durations,
}: {
  durations: BrowserActivityDurations;
}) {
  const segments = browserActivityKinds.flatMap((kind) => {
    const durationMs = durations[kind] ?? 0;
    return durationMs > 0 ? [{ durationMs, kind }] : [];
  });
  const total = segments.reduce((sum, segment) => sum + segment.durationMs, 0);
  if (total === 0) return null;

  return (
    <div className="grid gap-2">
      <div
        aria-label="Time by activity type"
        className="flex h-1.5 overflow-hidden rounded-full bg-muted"
      >
        {segments.map(({ durationMs, kind }) => {
          const presentation = activityPresentation[kind];
          const label = `${presentation.label}: ${formatDuration(durationMs)}`;
          return (
            <span
              aria-label={label}
              className={presentation.className}
              key={kind}
              style={{ width: `${String((durationMs / total) * 100)}%` }}
              title={label}
            />
          );
        })}
      </div>
      <div className="grid gap-0.5 type-caption text-muted-foreground">
        {segments.map(({ durationMs, kind }) => {
          const presentation = activityPresentation[kind];
          return (
            <span className="inline-flex items-center gap-1" key={kind}>
              <span
                aria-hidden="true"
                className={`size-1.5 rounded-full ${presentation.className}`}
              />
              {presentation.label} {formatDuration(durationMs)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function formatDuration(milliseconds: number) {
  if (milliseconds < 1_000) return `${String(Math.round(milliseconds))}ms`;
  const seconds = milliseconds / 1_000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)}s`;
  return `${String(Math.floor(seconds / 60))}m ${String(Math.floor(seconds % 60))}s`;
}
