import { notFound } from "next/navigation";
import { api } from "~/trpc/server";
import { EditCollectionForm } from "./EditCollectionForm";

export default async function EditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const collection = await api.collection.adminGetById({ id });
  if (!collection) notFound();

  return (
    <EditCollectionForm
      initial={{
        id: collection.id,
        title: collection.title,
        description: collection.description,
        slug: collection.slug,
        eventDate: collection.eventDate ? new Date(collection.eventDate).toISOString() : null,
        pricePerBib: collection.pricePerBib != null ? Number(collection.pricePerBib) : null,
        isPublished: collection.isPublished,
        bannerUrl: collection.bannerUrl,
        logoUrl: collection.logoUrl,
        bannerFocalY: collection.bannerFocalY,
      }}
    />
  );
}
