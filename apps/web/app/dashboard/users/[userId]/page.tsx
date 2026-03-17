import { UserRecordPage } from "../../../../components/dashboard-pages";

export default async function DashboardUserRecordRoute({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ userId: string }>;
  searchParams?: Promise<{ tab?: string }>;
}>) {
  const { userId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const initialTab = resolvedSearchParams?.tab === "schedule"
    ? "schedule"
    : resolvedSearchParams?.tab === "training"
      ? "training"
      : resolvedSearchParams?.tab === "settings"
        ? "settings"
        : "information";

  return <UserRecordPage initialTab={initialTab} userId={userId} />;
}
