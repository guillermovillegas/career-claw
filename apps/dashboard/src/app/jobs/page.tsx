import { getJobs, type JobWithAppStatus } from "@/lib/queries";
import { JobsTable } from "./jobs-table";

export const dynamic = "force-dynamic";

interface JobsPageProps {
  searchParams: Promise<{
    platform?: string;
    job_type?: string;
    work_mode?: string;
    sort_by?: string;
    sort_dir?: string;
  }>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const jobs: JobWithAppStatus[] = await getJobs({
    platform: params.platform,
    job_type: params.job_type,
    work_mode: params.work_mode,
    sort_by: params.sort_by,
    sort_dir: (params.sort_dir as "asc" | "desc") ?? "desc",
  });

  const appliedCount = jobs.filter(
    (j) => j.application_status && j.application_status !== "interested"
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3">
        <h1 className="text-sm font-semibold text-slate-300">
          Full-Time Jobs
        </h1>
        <span className="text-xs text-slate-500">
          {jobs.length} tracked · {appliedCount} applied
        </span>
      </div>
      <JobsTable jobs={jobs} />
    </div>
  );
}
