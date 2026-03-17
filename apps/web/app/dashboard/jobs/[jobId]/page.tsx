import { JobRecordPage } from "../../../../components/dashboard-pages";

export default async function DashboardJobRecordRoute({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ jobId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}>) {
  const { jobId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab === "schedule" ? "schedule" : "details";

  return <JobRecordPage initialTab={initialTab} jobId={jobId} />;
}
