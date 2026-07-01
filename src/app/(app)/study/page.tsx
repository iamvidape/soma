import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { StudyLoader } from "@/components/study/StudyLoader";

export default async function StudyPage({
  searchParams,
}: {
  searchParams: Promise<{ decks?: string }>;
}) {
  const { decks: decksParam } = await searchParams;
  if (!decksParam) redirect("/");

  const deckIds = decksParam.split(",").filter(Boolean);
  if (deckIds.length === 0) redirect("/");

  const session = await auth();
  const userId = session!.user.id;

  return <StudyLoader deckIds={deckIds} userId={userId} />;
}
