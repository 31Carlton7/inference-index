import { runsFileUrl } from "@/lib/links";
import type { ProbeStatusRow, RunStatus } from "@/lib/schema";

const SLOTS = 96;
const SEVERITY: Record<RunStatus, number> = { ok: 0, timeout: 1, error: 2 };
const STATUS_LABEL: Record<RunStatus, string> = { ok: "ok", timeout: "timed out", error: "returned an error" };

function clock(ms: number): string {
  return new Date(ms).toISOString().slice(11, 16);
}

// One slot per scheduled probe time, ending at the time the page was drawn.
// A slot with no run stays empty, so a gap in the data is drawn as a gap.
export function RunStrip({ row, intervalMinutes, drawnAt }: { row: ProbeStatusRow; intervalMinutes: number; drawnAt: number }) {
  const slotMs = intervalMinutes * 60_000;
  const lastSlot = Math.floor(drawnAt / slotMs) * slotMs;
  const firstSlot = lastSlot - (SLOTS - 1) * slotMs;

  const slots: ({ ts: string; status: RunStatus } | null)[] = Array(SLOTS).fill(null);
  for (const [ts, status] of row.runs) {
    // Runs start a few seconds either side of the schedule, so each goes to the nearest slot.
    const slot = Math.round((Date.parse(ts) - firstSlot) / slotMs);
    if (slot < 0 || slot >= SLOTS) continue;
    const placed = slots[slot];
    if (!placed || SEVERITY[status] > SEVERITY[placed.status]) slots[slot] = { ts, status };
  }

  const drawn = slots.filter((slot) => slot !== null);
  const failed = drawn.filter((slot) => slot.status !== "ok").length;
  const hours = Math.round((SLOTS * intervalMinutes) / 60);
  const summary = `${drawn.length} runs in the last ${hours} hours: ${drawn.length - failed} ok, ${failed} failed, ${SLOTS - drawn.length} slots with no run`;

  return (
    <div className="strip-cell">
      <div className="strip" role="img" aria-label={summary}>
        {slots.map((slot, index) => {
          const slotTime = firstSlot + index * slotMs;
          if (!slot) return <span key={index} className="gap" title={`No run at ${clock(slotTime)} UTC`} />;
          return (
            <a
              key={index}
              className={slot.status}
              href={runsFileUrl(row.provider, slot.ts)}
              title={`${slot.ts.slice(11, 19)} UTC: one request ${STATUS_LABEL[slot.status]}`}
            />
          );
        })}
      </div>
      <div className="strip-axis" aria-hidden>
        <span>{hours}h ago</span>
        <span>{clock(lastSlot)} UTC</span>
      </div>
    </div>
  );
}

export function RunStripLegend() {
  return (
    <p className="legend">
      <span>
        <i className="ok" /> request succeeded
      </span>
      <span>
        <i className="timeout" /> one request timed out
      </span>
      <span>
        <i className="error" /> one request returned an error
      </span>
      <span>
        <i className="gap" /> no run recorded
      </span>
    </p>
  );
}
