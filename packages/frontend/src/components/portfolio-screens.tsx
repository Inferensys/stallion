"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  Boxes,
  Check,
  CreditCard,
  DatabaseZap,
  FileClock,
  GitBranch,
  KeyRound,
  Lock,
  Mail,
  PlugZap,
  ReceiptText,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  WalletCards,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { StallionMark } from "@/components/logo";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/", label: "Mission Control" },
  { href: "/admin", label: "Admin" },
  { href: "/team", label: "Team" },
  { href: "/integrations", label: "Integrations" },
  { href: "/billing", label: "Billing" },
  { href: "/audit", label: "Audit" },
  { href: "/settings", label: "Settings" },
  { href: "/portfolio", label: "Case Study" },
];

export function PortfolioShell({
  active,
  children,
}: {
  active: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-bg text-text-primary">
      <aside className="fixed inset-y-0 left-0 w-[260px] border-r border-white/[0.06] bg-[#0e0e16]">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <StallionMark size={22} className="text-accent" />
          <span className="text-lg font-semibold tracking-tight">Stallion</span>
        </div>
        <nav className="px-3">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "block rounded-lg px-3 py-2.5 text-sm transition-colors",
                active === item.label
                  ? "bg-white/[0.08] text-text-primary"
                  : "text-text-secondary hover:bg-white/[0.05] hover:text-text-primary",
              )}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="absolute bottom-0 left-0 right-0 border-t border-white/[0.06] p-4">
          <div className="rounded-lg bg-bg-elevated p-3">
            <p className="text-xs font-medium text-text-primary">Enterprise workspace</p>
            <p className="mt-1 text-[11px] text-text-muted">SAML, audit logs, and spend controls enabled</p>
          </div>
        </div>
      </aside>
      <main className="ml-[260px] min-h-screen">{children}</main>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <header className="border-b border-border px-8 py-5">
      <div className="flex items-center justify-between gap-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-text-primary">{title}</h1>
          <p className="mt-1 text-sm text-text-muted">{description}</p>
        </div>
        {action && (
          <button className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white shadow-[0_0_20px_rgba(99,102,241,0.28)]">
            {action}
          </button>
        )}
      </div>
    </header>
  );
}

export function StatCard({
  label,
  value,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string;
  trend: string;
  icon: typeof Activity;
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-text-muted">{label}</p>
        <Icon className="h-4 w-4 text-accent" />
      </div>
      <p className="mt-4 text-2xl font-semibold text-text-primary">{value}</p>
      <p className="mt-1 text-xs text-success">{trend}</p>
    </div>
  );
}

export function AdminScreen() {
  const missions = [
    ["Product analytics dashboard", "Completed", "4 agents", "$0.18", "2m ago"],
    ["Enterprise onboarding flow", "Running", "6 agents", "$0.42", "8m ago"],
    ["API documentation refresh", "Review", "3 agents", "$0.11", "21m ago"],
    ["Pricing experiment setup", "Completed", "5 agents", "$0.29", "1h ago"],
  ];

  return (
    <PortfolioShell active="Admin">
      <PageHeader
        title="Admin Console"
        description="Monitor workspaces, missions, agent usage, and operational health."
        action="Invite Member"
      />
      <div className="space-y-6 p-8">
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Active missions" value="18" trend="+24% this week" icon={Activity} />
          <StatCard label="Agents spawned" value="142" trend="+38% this month" icon={Boxes} />
          <StatCard label="Workspace spend" value="$1,248" trend="42% below budget" icon={BarChart3} />
          <StatCard label="Team members" value="32" trend="6 invited" icon={Users} />
        </div>

        <div className="grid grid-cols-12 gap-4">
          <section className="col-span-8 rounded-lg border border-border bg-bg-surface">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-sm font-semibold">Mission Operations</h2>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wider text-text-muted">
                <tr className="border-b border-border">
                  <th className="px-5 py-3 font-medium">Mission</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                  <th className="px-5 py-3 font-medium">Agents</th>
                  <th className="px-5 py-3 font-medium">Cost</th>
                  <th className="px-5 py-3 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody>
                {missions.map((row) => (
                  <tr key={row[0]} className="border-b border-border/60 last:border-0">
                    {row.map((cell, index) => (
                      <td key={cell} className={cn("px-5 py-3", index === 1 ? "text-success" : "text-text-secondary")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="col-span-4 rounded-lg border border-border bg-bg-surface p-5">
            <h2 className="text-sm font-semibold">Policy Guardrails</h2>
            <div className="mt-4 space-y-3">
              {["Budget cap enforcement", "Credential proxy", "Network isolation", "Audit event retention"].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-lg bg-bg-elevated px-3 py-2">
                  <Check className="h-4 w-4 text-success" />
                  <span className="text-sm text-text-secondary">{item}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </PortfolioShell>
  );
}

export function BillingScreen() {
  const invoices = [
    ["INV-2026-05", "May usage", "$1,248.00", "Paid"],
    ["INV-2026-04", "April usage", "$982.50", "Paid"],
    ["INV-2026-03", "March usage", "$756.80", "Paid"],
  ];

  return (
    <PortfolioShell active="Billing">
      <PageHeader
        title="Billing & Payments"
        description="Usage-based billing, payment methods, invoices, and budget controls."
        action="Update Plan"
      />
      <div className="grid grid-cols-12 gap-4 p-8">
        <section className="col-span-5 rounded-lg border border-border bg-bg-surface p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-wider text-text-muted">Current plan</p>
              <h2 className="mt-2 text-2xl font-semibold">Scale</h2>
              <p className="mt-1 text-sm text-text-muted">For teams running agentic workflows daily.</p>
            </div>
            <Sparkles className="h-5 w-5 text-accent" />
          </div>
          <div className="mt-6 rounded-lg bg-bg-elevated p-4">
            <div className="flex items-end gap-2">
              <span className="text-3xl font-semibold">$499</span>
              <span className="pb-1 text-sm text-text-muted">base / month</span>
            </div>
            <div className="mt-4 h-2 rounded-full bg-bg">
              <div className="h-full w-[62%] rounded-full bg-accent" />
            </div>
            <p className="mt-2 text-xs text-text-muted">$1,248 of $2,000 monthly budget used</p>
          </div>
        </section>

        <section className="col-span-7 rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="text-sm font-semibold">Payment Method</h2>
          <div className="mt-4 flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-4">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-accent/15 p-2 text-accent">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <p className="text-sm font-medium">Visa ending in 4242</p>
                <p className="text-xs text-text-muted">Expires 09/29, billed to finance@company.com</p>
              </div>
            </div>
            <button className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary">Change</button>
          </div>
          <div className="mt-4 grid grid-cols-3 gap-3">
            <StatCard label="This month" value="$1,248" trend="Projected $1,620" icon={WalletCards} />
            <StatCard label="Avg mission" value="$0.31" trend="-12% vs last month" icon={ReceiptText} />
            <StatCard label="Budget left" value="$752" trend="Healthy" icon={ShieldCheck} />
          </div>
        </section>

        <section className="col-span-12 rounded-lg border border-border bg-bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Invoices</h2>
          </div>
          {invoices.map((invoice) => (
            <div key={invoice[0]} className="grid grid-cols-4 items-center border-b border-border px-5 py-3 text-sm last:border-0">
              <span className="font-mono text-text-secondary">{invoice[0]}</span>
              <span className="text-text-secondary">{invoice[1]}</span>
              <span className="text-text-primary">{invoice[2]}</span>
              <span className="text-success">{invoice[3]}</span>
            </div>
          ))}
        </section>
      </div>
    </PortfolioShell>
  );
}

export function TeamScreen() {
  const members = [
    ["Priya Shah", "Owner", "Product Engineering", "Active"],
    ["Marcus Lee", "Admin", "Platform", "Active"],
    ["Elena Torres", "Member", "Design Systems", "Active"],
    ["Noah Kim", "Member", "Data", "Pending"],
  ];

  return (
    <PortfolioShell active="Team">
      <PageHeader
        title="Team Management"
        description="Workspace roles, groups, approvals, and access policies."
        action="Add Member"
      />
      <div className="grid grid-cols-12 gap-4 p-8">
        <section className="col-span-8 rounded-lg border border-border bg-bg-surface">
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Members</h2>
            <div className="flex items-center gap-2 rounded-lg border border-border bg-bg-elevated px-3 py-2 text-xs text-text-muted">
              <Search className="h-3.5 w-3.5" />
              Search workspace
            </div>
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wider text-text-muted">
              <tr className="border-b border-border">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Group</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member[0]} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 text-text-primary">{member[0]}</td>
                  <td className="px-5 py-3 text-text-secondary">{member[1]}</td>
                  <td className="px-5 py-3 text-text-secondary">{member[2]}</td>
                  <td className="px-5 py-3 text-success">{member[3]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="col-span-4 rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="text-sm font-semibold">Approval Rules</h2>
          <div className="mt-4 space-y-3">
            {["Production deploys require admin approval", "High-spend missions route to finance", "External integrations require owner review"].map((rule) => (
              <div key={rule} className="rounded-lg bg-bg-elevated p-3">
                <div className="flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 h-4 w-4 text-accent" />
                  <p className="text-sm leading-5 text-text-secondary">{rule}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortfolioShell>
  );
}

export function IntegrationsScreen() {
  const integrations = [
    ["GitHub", "Repository access and pull request automation", "Connected", GitBranch],
    ["Postgres", "Read-only analytics warehouse connection", "Connected", DatabaseZap],
    ["Slack", "Mission approvals and delivery notifications", "Connected", PlugZap],
    ["Linear", "Ticket creation from completed mission tasks", "Ready", FileClock],
  ] satisfies Array<[string, string, string, LucideIcon]>;

  return (
    <PortfolioShell active="Integrations">
      <PageHeader
        title="Integrations"
        description="Connect source control, data systems, ticketing, and approval channels."
        action="Add Integration"
      />
      <div className="grid grid-cols-12 gap-4 p-8">
        <section className="col-span-7 space-y-3">
          {integrations.map(([name, body, status, Icon]) => (
            <div key={name} className="flex items-center justify-between rounded-lg border border-border bg-bg-surface p-4">
              <div className="flex items-center gap-4">
                <div className="rounded-lg bg-accent/15 p-2 text-accent">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-medium">{name}</p>
                  <p className="mt-1 text-xs text-text-muted">{body}</p>
                </div>
              </div>
              <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">{status}</span>
            </div>
          ))}
        </section>
        <section className="col-span-5 rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="text-sm font-semibold">Credential Routing</h2>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Secrets stay in the workspace vault and are brokered into mission sandboxes only when the policy engine approves scope, duration, and destination.
          </p>
          <div className="mt-6 space-y-3">
            {["Scoped tokens", "One-time credentials", "Egress review", "Usage audit"].map((item) => (
              <div key={item} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                <span className="text-sm text-text-muted">{item}</span>
                <Check className="h-4 w-4 text-success" />
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortfolioShell>
  );
}

export function AuditScreen() {
  const events = [
    ["13:42", "Mission approved", "Priya Shah", "Product analytics dashboard"],
    ["13:41", "Credential scoped", "Policy engine", "GitHub read access"],
    ["13:39", "Agent spawned", "Mission planner", "Frontend engineer"],
    ["13:37", "Workspace export", "Marcus Lee", "Case study bundle"],
    ["13:33", "Budget rule evaluated", "Policy engine", "$5 mission cap"],
  ];

  return (
    <PortfolioShell active="Audit">
      <PageHeader
        title="Audit & Compliance"
        description="Trace user actions, policy decisions, credentials, and mission lifecycle events."
        action="Export Log"
      />
      <div className="grid grid-cols-12 gap-4 p-8">
        <section className="col-span-8 rounded-lg border border-border bg-bg-surface">
          <div className="border-b border-border px-5 py-4">
            <h2 className="text-sm font-semibold">Event Stream</h2>
          </div>
          {events.map((event) => (
            <div key={`${event[0]}-${event[1]}`} className="grid grid-cols-[80px_1.2fr_1fr_1.4fr] border-b border-border px-5 py-3 text-sm last:border-0">
              <span className="font-mono text-text-muted">{event[0]}</span>
              <span className="text-text-primary">{event[1]}</span>
              <span className="text-text-secondary">{event[2]}</span>
              <span className="text-text-secondary">{event[3]}</span>
            </div>
          ))}
        </section>
        <section className="col-span-4 rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="text-sm font-semibold">Compliance Posture</h2>
          <div className="mt-5 space-y-4">
            <StatCard label="Events retained" value="90d" trend="Policy aligned" icon={FileClock} />
            <StatCard label="Exports signed" value="100%" trend="Checksum verified" icon={ShieldCheck} />
            <StatCard label="Access reviews" value="12" trend="Current quarter" icon={Users} />
          </div>
        </section>
      </div>
    </PortfolioShell>
  );
}

export function SettingsScreen() {
  return (
    <PortfolioShell active="Settings">
      <PageHeader
        title="Workspace Settings"
        description="Identity, access controls, environment policies, and deployment defaults."
        action="Save Changes"
      />
      <div className="grid grid-cols-12 gap-4 p-8">
        <section className="col-span-7 rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="text-sm font-semibold">Authentication</h2>
          <div className="mt-4 space-y-3">
            {([
              ["SAML SSO", "Required for all company users", ShieldCheck],
              ["Domain lock", "Only @company.com accounts can join", Mail],
              ["Session duration", "12 hours with admin override", Lock],
              ["API key vault", "Keys are proxied and never exposed to agents", KeyRound],
            ] satisfies Array<[string, string, LucideIcon]>).map(([title, body, Icon]) => (
              <div key={title} className="flex items-center justify-between rounded-lg bg-bg-elevated p-4">
                <div className="flex items-center gap-3">
                  <Icon className="h-5 w-5 text-accent" />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-xs text-text-muted">{body}</p>
                  </div>
                </div>
                <span className="rounded-full bg-success/10 px-2 py-1 text-xs text-success">Enabled</span>
              </div>
            ))}
          </div>
        </section>
        <section className="col-span-5 rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="text-sm font-semibold">Runtime Defaults</h2>
          <div className="mt-5 space-y-4">
            {[
              ["Default model", "Claude Sonnet"],
              ["Sandbox memory", "4 GB"],
              ["Max wall clock", "30 minutes"],
              ["Network policy", "Restricted egress"],
              ["Spend limit", "$5 per mission"],
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                <span className="text-sm text-text-muted">{label}</span>
                <span className="text-sm text-text-primary">{value}</span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </PortfolioShell>
  );
}

export function LoginScreen() {
  return (
    <div className="grid min-h-screen grid-cols-[1.05fr_0.95fr] bg-bg text-text-primary">
      <section className="flex flex-col justify-between border-r border-border p-10">
        <div className="flex items-center gap-2.5">
          <StallionMark size={24} className="text-accent" />
          <span className="text-lg font-semibold">Stallion</span>
        </div>
        <div className="max-w-xl">
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">
            Run agent teams with enterprise control.
          </h1>
          <p className="mt-5 text-base leading-7 text-text-secondary">
            Secure mission planning, sandboxed execution, live VM inspection, and billing controls for teams shipping with AI agents.
          </p>
          <div className="mt-8 grid grid-cols-3 gap-3">
            {["SSO ready", "VM sandbox", "Audit logs"].map((item) => (
              <div key={item} className="rounded-lg border border-border bg-bg-surface p-3 text-sm text-text-secondary">
                {item}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-text-muted">SOC2-ready controls for enterprise workspaces.</p>
      </section>
      <section className="flex items-center justify-center p-10">
        <div className="w-full max-w-md rounded-xl border border-border bg-bg-surface p-8 shadow-2xl">
          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-2 text-sm text-text-muted">Use your company identity provider to enter Mission Control.</p>
          <div className="mt-8 space-y-3">
            <button className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-3 text-sm font-medium text-white">
              Continue with SSO <ArrowRight className="h-4 w-4" />
            </button>
            <button className="w-full rounded-lg border border-border px-4 py-3 text-sm text-text-secondary">
              Continue with Google
            </button>
          </div>
          <div className="mt-6 space-y-3">
            <label className="block">
              <span className="text-xs text-text-muted">Work email</span>
              <input className="mt-1 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-sm outline-none" value="priya@company.com" readOnly />
            </label>
            <label className="block">
              <span className="text-xs text-text-muted">Password</span>
              <input className="mt-1 w-full rounded-lg border border-border bg-bg-elevated px-3 py-2.5 text-sm outline-none" value="••••••••••••" readOnly />
            </label>
          </div>
        </div>
      </section>
    </div>
  );
}
