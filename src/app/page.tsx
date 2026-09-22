import { createClient } from "@/utils/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data: cracks } = await supabase.from("cracks").select();

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-3xl font-semibold text-gray-300">
        Cracking Jokes in the City of New York
      </h1>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {cracks?.map((crack) => (
          <figure
            key={crack.id}
            className="flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white dark:border-white/15"
          >
            {crack.img_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={crack.img_url}
                alt={crack.text ?? ""}
                className="aspect-square w-full object-cover"
                loading="lazy"
              />
            )}
            {crack.text && (
              <figcaption className="p-3 text-sm">{crack.text}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </main>
  );
}
