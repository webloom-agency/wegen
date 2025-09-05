import { NextRequest } from "next/server";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return fetch(`/api/category/${id}`);
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  url.pathname = `/api/category/${id}`;
  return fetch(url.toString(), {
    method: "PUT",
    headers: request.headers as any,
    body: await request.text(),
  });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const url = new URL(request.url);
  url.pathname = `/api/category/${id}`;
  return fetch(url.toString(), {
    method: "DELETE",
    headers: request.headers as any,
  });
}
