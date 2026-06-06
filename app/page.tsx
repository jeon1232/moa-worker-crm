import { redirect } from "next/navigation";

export default function Home({
  searchParams
}: {
  searchParams: Record<string, string | string[] | undefined>;
}) {
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value === "string") {
      params.set(key, value);
    }
  }

  if (params.has("code") || params.has("error") || params.has("error_description")) {
    redirect(`/auth/callback?${params.toString()}`);
  }

  redirect("/dashboard");
}
