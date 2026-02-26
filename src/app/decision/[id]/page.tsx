import { DecisionStudio } from "@/components/DecisionStudio";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function DecisionPage({ params }: PageProps) {
  const { id } = await params;

  return <DecisionStudio initialDecisionId={id} />;
}
