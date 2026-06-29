import { ROLE_LABEL, type TeamRole } from "@/lib/constants";
import type { TeamMember } from "@/lib/types";
import LogoutButton from "./logout-button";

/** Derives up-to-two initials from a display name. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/**
 * Sidebar identity block: avatar + name + role, with a logout button.
 * Renders a "Guest" state when no member is resolved (env missing /
 * not provisioned) so the shell degrades gracefully.
 */
export default function MemberCard({ member }: { member: TeamMember | null }) {
  if (!member) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2.5">
        <span className="grid size-9 shrink-0 place-items-center rounded-full border border-border/60 bg-surface-2/60 text-xs font-semibold text-muted">
          ?
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-fg">Guest</p>
          <p className="truncate text-xs text-muted">Not signed in</p>
        </div>
      </div>
    );
  }

  const role = member.role as TeamRole;

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-surface-2/40 px-3 py-2.5">
      <Avatar name={member.name} url={member.avatar_url} />
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-sm font-medium text-fg">{member.name}</p>
        <p className="truncate text-xs text-muted">{ROLE_LABEL[role] ?? role}</p>
      </div>
      <LogoutButton />
    </div>
  );
}

function Avatar({ name, url }: { name: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="size-9 shrink-0 rounded-full border border-border/60 object-cover"
      />
    );
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-primary/40 bg-primary/15 text-xs font-semibold text-primary">
      {initials(name)}
    </span>
  );
}
