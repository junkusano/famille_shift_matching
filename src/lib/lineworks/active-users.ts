import type { User } from "@/types/lineworks";

/**
 * Return only users that are still active in LINE WORKS.
 *
 * The directory API can include users in the seven-day deleted state. They
 * must not keep appearing as a LINE WORKS deletion candidate.
 */
export function filterActiveLineWorksUsers(users: User[]): User[] {
  return users.filter((user) => user.isDeleted !== true);
}
