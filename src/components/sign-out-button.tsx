import { signOut } from "@/lib/auth/actions";

export default function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut}>
      <button type="submit" className={className ?? "btn-secondary w-fit"}>
        Sign out
      </button>
    </form>
  );
}
