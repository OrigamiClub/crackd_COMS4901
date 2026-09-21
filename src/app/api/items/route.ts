import { NextResponse } from "next/server";

// TODO: replace with real DB query via src/lib/db.ts
const items = [
  { id: 1, name: "Sample item 1" },
  { id: 2, name: "Sample item 2" },
];

export async function GET() {
  return NextResponse.json(items);
}
