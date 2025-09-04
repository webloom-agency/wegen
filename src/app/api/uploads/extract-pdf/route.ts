// @ts-expect-error: pdfjs-dist ESM build has no TypeScript types for this path
import * as pdfjsLib from "pdfjs-dist/build/pdf.mjs";

export const runtime = "nodejs";

export async function POST(request: Request) {
	try {
		const contentType = request.headers.get("content-type") || "";
		if (!contentType.includes("multipart/form-data")) {
			return new Response(
				JSON.stringify({ error: "Expected multipart/form-data with a 'file' field" }),
				{ status: 400, headers: { "content-type": "application/json" } },
			);
		}

		const formData = await request.formData();
		const file = formData.get("file");

		if (!file || !(file instanceof File)) {
			return new Response(
				JSON.stringify({ error: "Missing 'file' field" }),
				{ status: 400, headers: { "content-type": "application/json" } },
			);
		}

		const arrayBuffer = await file.arrayBuffer();
		const pdfBuffer = new Uint8Array(arrayBuffer);

		// Ensure worker is not required in Node context
		if ((pdfjsLib as any).GlobalWorkerOptions) {
			(pdfjsLib as any).GlobalWorkerOptions.workerSrc = undefined as any;
		}

		const getDocument = (pdfjsLib as any).getDocument || (pdfjsLib as any).default?.getDocument;
		if (typeof getDocument !== "function") {
			return new Response(
				JSON.stringify({ error: "Invalid pdfjs-dist import: getDocument not found" }),
				{ status: 500, headers: { "content-type": "application/json" } },
			);
		}

		const doc = await getDocument({ data: pdfBuffer }).promise;

		let combined = "";
		for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
			const page = await doc.getPage(pageNum);
			const textContent = await page.getTextContent();
			const pageText = (textContent.items || [])
				.map((item: any) => (typeof item?.str === "string" ? item.str : ""))
				.join(" ")
				.trim();
			if (pageText) {
				combined += (combined ? "\n\n" : "") + pageText;
			}
		}

		return new Response(
			JSON.stringify({ text: combined }),
			{ status: 200, headers: { "content-type": "application/json" } },
		);
	} catch (error: any) {
		return new Response(
			JSON.stringify({ error: error?.message || "Failed to extract PDF text" }),
			{ status: 500, headers: { "content-type": "application/json" } },
		);
	}
} 