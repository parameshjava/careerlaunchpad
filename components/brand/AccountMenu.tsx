"use client";

import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/**
 * The signed-in account control for the shared navbar's `right` slot. Replaces
 * the old standalone "Sign out" button: the user's social-login photo (falling
 * back to their initials) is the trigger, and clicking it opens a menu whose
 * only action is Sign out. Sign-out posts to /auth/signout, which clears the
 * session and redirects to the marketing home page.
 *
 * Client component because the dropdown uses Radix hooks.
 */
export function AccountMenu({
  email,
  name,
  avatarUrl,
}: {
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
}) {
  const label = name ?? email ?? "Account";
  const initials = initialsFrom(name, email);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label="Account menu"
      >
        <Avatar size="lg" className="cursor-pointer">
          {avatarUrl && (
            <AvatarImage src={avatarUrl} alt={label} referrerPolicy="no-referrer" />
          )}
          <AvatarFallback className="bg-gradient-to-br from-[#2563eb] to-[#7c3aed] text-white">
            {initials}
          </AvatarFallback>
        </Avatar>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="flex flex-col gap-0.5">
          {name && <span className="text-foreground text-sm font-medium">{name}</span>}
          {email && <span className="truncate font-normal">{email}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/account">
            <UserRound />
            Profile
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {/* Native form submit so sign-out works without JS; the route clears the
            session and redirects home. */}
        <form action="/auth/signout" method="post">
          <DropdownMenuItem asChild variant="destructive">
            <button type="submit" className="w-full">
              <LogOut />
              Sign out
            </button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Up to two initials from a display name, falling back to the email's first char. */
function initialsFrom(name: string | null, email: string | null): string {
  const source = name?.trim() || email?.split("@")[0] || "";
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
