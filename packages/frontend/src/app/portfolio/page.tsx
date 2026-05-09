import Image from "next/image";
import { PortfolioShell, PageHeader } from "@/components/portfolio-screens";

const shots = [
  {
    src: "/case-study/restored-ui/screenshots/04-auth-login.png",
    title: "Enterprise sign in",
    description: "SSO-ready authentication with secure workspace entry.",
  },
  {
    src: "/case-study/restored-ui/screenshots/case-study-restored-UI-01-plan-review.png",
    title: "Mission plan review",
    description: "Agents, task ownership, and approval flow before execution.",
  },
  {
    src: "/case-study/restored-ui/screenshots/case-study-restored-UI-02-graph-complete.png",
    title: "Workflow graph",
    description: "Completed task graph, VM preview, and workspace state.",
  },
  {
    src: "/case-study/restored-ui/screenshots/case-study-restored-UI-03-vm-view.png",
    title: "Live VM preview",
    description: "Sandbox browser showing the dashboard prototype output.",
  },
  {
    src: "/case-study/restored-ui/screenshots/05-admin-console.png",
    title: "Admin console",
    description: "Workspace operations, usage, spend, and policy guardrails.",
  },
  {
    src: "/case-study/restored-ui/screenshots/09-team-management.png",
    title: "Team management",
    description: "Role-based access, groups, approvals, and workspace members.",
  },
  {
    src: "/case-study/restored-ui/screenshots/10-integrations.png",
    title: "Integrations",
    description: "Source control, warehouse, ticketing, and notification channels.",
  },
  {
    src: "/case-study/restored-ui/screenshots/06-billing-payments.png",
    title: "Billing and payments",
    description: "Plan, payment method, invoices, and budget utilization.",
  },
  {
    src: "/case-study/restored-ui/screenshots/11-audit-compliance.png",
    title: "Audit and compliance",
    description: "Signed event trail for policy, credentials, and mission actions.",
  },
  {
    src: "/case-study/restored-ui/screenshots/07-settings-security.png",
    title: "Workspace settings",
    description: "Identity, runtime defaults, and security posture controls.",
  },
];

export default function PortfolioPage() {
  return (
    <PortfolioShell active="Case Study">
      <PageHeader
        title="Portfolio Case Study"
        description="A curated client-facing view of Stallion's agentic workflow experience."
        action="Export Deck"
      />
      <div className="space-y-6 p-8">
        <section className="rounded-lg border border-border bg-bg-surface p-6">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-semibold">From prompt to reviewed product artifact</h2>
            <p className="mt-3 text-sm leading-7 text-text-secondary">
              Stallion turns an ambiguous product request into a planned, observable, multi-agent mission.
              The showcase includes discovery, planning, task graph execution, VM verification, workspace files,
              and handoff documentation.
            </p>
          </div>
          <div className="mt-6 grid grid-cols-4 gap-3">
            {["Explore", "Plan", "Execute", "Deliver"].map((step, index) => (
              <div key={step} className="rounded-lg bg-bg-elevated p-4">
                <span className="text-[10px] font-mono text-text-muted">0{index + 1}</span>
                <p className="mt-2 text-sm font-medium">{step}</p>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-3 gap-4">
          {shots.map((shot) => (
            <article key={shot.title} className="overflow-hidden rounded-lg border border-border bg-bg-surface">
              <div className="relative aspect-[1.44] bg-bg">
                <Image src={shot.src} alt={shot.title} fill className="object-cover" />
              </div>
              <div className="p-4">
                <h3 className="text-sm font-semibold">{shot.title}</h3>
                <p className="mt-1 text-xs leading-5 text-text-muted">{shot.description}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </PortfolioShell>
  );
}
