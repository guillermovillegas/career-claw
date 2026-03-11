import { getApplications } from "@/lib/queries";
import { ApplicationsView } from "./applications-view";

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const applications = await getApplications();

  return <ApplicationsView applications={applications} />;
}
