import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Shield, Cloud, Lock, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "VaultX — Secure 1TB Personal Cloud Storage" },
      {
        name: "description",
        content:
          "Encrypted personal vault. Upload, organize, and access your files from anywhere with end-to-end security.",
      },
      { property: "og:title", content: "VaultX — Secure 1TB Personal Cloud Storage" },
      {
        property: "og:description",
        content: "Encrypted personal vault with 1TB per user.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate({ to: "/vault" });
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Shield className="h-5 w-5" />
            </div>
            <span className="text-lg font-semibold">VaultX</span>
          </div>
          <Link to="/login">
            <Button>Sign in</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-20">
        <section className="text-center">
          <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight md:text-6xl">
            Your private vault in the cloud.
          </h1>
          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            1 TB of encrypted storage per account. Upload, organize, and preview
            files from any device — only you have access.
          </p>
          <div className="mt-8 flex justify-center gap-3">
            <Link to="/login">
              <Button size="lg">Get started — it's free</Button>
            </Link>
          </div>
        </section>

        <section className="mt-24 grid gap-6 md:grid-cols-3">
          {[
            {
              icon: Lock,
              title: "Encrypted at rest",
              body: "Every file is stored encrypted. Direct URL access is blocked by per-user authorization.",
            },
            {
              icon: Cloud,
              title: "1 TB per user",
              body: "Generous storage with a real-time dashboard tracking what you use.",
            },
            {
              icon: Upload,
              title: "Drag, drop, done",
              body: "Large file uploads with progress tracking. Folders, search, preview.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-xl border bg-card p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary text-primary">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
