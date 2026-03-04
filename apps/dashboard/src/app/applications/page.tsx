import { getApplications } from "@/lib/queries";
import { ApplicationsTable } from "./applications-table";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await getApplications();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Applications</h1>
        <p className="mt-1 text-sm text-slate-400">
          {applications.length} application{applications.length !== 1 ? "s" : ""} tracked
        </p>
      </div>
      <ApplicationsTable applications={applications} />
    </div>
  );
}
