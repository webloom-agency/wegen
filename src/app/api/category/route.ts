import { NextRequest } from "next/server";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  url.pathname = "/api/archive";
  return fetch(url.toString(), { headers: request.headers as any });
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  url.pathname = "/api/archive";
  return fetch(url.toString(), {
    method: "POST",
    headers: request.headers as any,
    body: await request.text(),
  });
} 