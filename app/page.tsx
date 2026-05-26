import Staff from "../components/staff";

export default function Home() {
  return (
    <main className="min-h-screen p-8 bg-gray-100">
      <h1 className="text-4xl font-bold mb-8 text-gray-900">
        Chord Finder
      </h1>

      <Staff />
    </main>
  );
}