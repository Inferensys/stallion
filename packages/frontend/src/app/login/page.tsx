import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginButton } from "@/components/login-button";
import { StallionMark } from "@/components/logo";

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-bg-surface p-8 shadow-xl">
        <div className="flex flex-col items-center gap-6">
          <StallionMark size={40} className="text-accent" />
          <div className="text-center space-y-1.5">
            <h1 className="text-xl font-semibold text-text-primary">
              Welcome to Stallion
            </h1>
            <p className="text-sm text-text-muted">
              Sign in to start building with AI agent teams
            </p>
          </div>
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
