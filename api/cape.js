import {
    put,
    list,
    del
} from "@vercel/blob";


const MAX_CAPE_SIZE = 128 * 1024;


// ==========================================
// UUID 정리
// ==========================================

function normalizeUuid(value) {

    if (!value) {
        return null;
    }

    const uuid = value
        .toLowerCase()
        .replaceAll("-", "");

    if (!/^[0-9a-f]{32}$/.test(uuid)) {
        return null;
    }

    return uuid;
}


// ==========================================
// PNG 확인
// ==========================================

function validateCape(buffer) {

    if (buffer.length < 24) {
        return false;
    }

    if (buffer.length > MAX_CAPE_SIZE) {
        return false;
    }


    // PNG signature
    const signature = [
        0x89,
        0x50,
        0x4E,
        0x47,
        0x0D,
        0x0A,
        0x1A,
        0x0A
    ];


    for (let i = 0; i < signature.length; i++) {

        if (buffer[i] !== signature[i]) {
            return false;
        }
    }


    // PNG IHDR width / height
    const view = new DataView(
        buffer.buffer,
        buffer.byteOffset,
        buffer.byteLength
    );


    const width =
        view.getUint32(16, false);

    const height =
        view.getUint32(20, false);


    // 현재 CustomCape는 64x32
    return width === 64 && height === 32;
}


// ==========================================
// GET
//
// /api/cape?uuid=UUID
// ==========================================

export async function GET(request) {

    try {

        const url =
            new URL(request.url);

        const uuid =
            normalizeUuid(
                url.searchParams.get("uuid")
            );


        if (!uuid) {

            return Response.json(
                {
                    error: "invalid_uuid"
                },
                {
                    status: 400
                }
            );
        }


        const result =
            await list({
                prefix: `capes/${uuid}/`,
                limit: 10
            });


        if (result.blobs.length === 0) {

            return Response.json({
                found: false
            });
        }


        const blobs =
            [...result.blobs]
                .sort(
                    (a, b) =>
                        new Date(b.uploadedAt)
                        - new Date(a.uploadedAt)
                );


        const cape =
            blobs[0];


        return Response.json({

            found: true,

            uuid: uuid,

            url: cape.url,

            etag: cape.etag,

            uploadedAt:
            cape.uploadedAt
        });


    } catch (error) {

        console.error(error);

        return Response.json(
            {
                error: "server_error"
            },
            {
                status: 500
            }
        );
    }
}


// ==========================================
// PUT
//
// /api/cape?uuid=UUID
//
// Body:
// image/png
// ==========================================

export async function PUT(request) {

    try {

        const url =
            new URL(request.url);


        const uuid =
            normalizeUuid(
                url.searchParams.get("uuid")
            );


        if (!uuid) {

            return Response.json(
                {
                    error: "invalid_uuid"
                },
                {
                    status: 400
                }
            );
        }


        const arrayBuffer =
            await request.arrayBuffer();


        const bytes =
            new Uint8Array(
                arrayBuffer
            );


        if (!validateCape(bytes)) {

            return Response.json(
                {
                    error: "invalid_cape",
                    message: "Cape must be a valid 64x32 PNG."
                },
                {
                    status: 400
                }
            );
        }


        // ==================================
        // 기존 망토 확인
        // ==================================

        const oldResult =
            await list({
                prefix: `capes/${uuid}/`,
                limit: 100
            });


        // ==================================
        // 새 망토
        //
        // 매번 새 URL 사용
        // CDN 캐시 문제 방지
        // ==================================

        const pathname =
            `capes/${uuid}/${Date.now()}.png`;


        const blob =
            await put(
                pathname,
                bytes,
                {
                    access: "public",

                    addRandomSuffix: false,

                    contentType: "image/png",

                    cacheControlMaxAge:
                        31536000
                }
            );


        // ==================================
        // 이전 망토 삭제
        // ==================================

        const oldUrls =
            oldResult.blobs
                .map(blob => blob.url)
                .filter(oldUrl =>
                    oldUrl !== blob.url
                );


        if (oldUrls.length > 0) {

            await del(
                oldUrls
            );
        }


        return Response.json({

            success: true,

            uuid: uuid,

            url: blob.url,

            etag: blob.etag
        });


    } catch (error) {

        console.error(error);

        return Response.json(
            {
                error: "server_error"
            },
            {
                status: 500
            }
        );
    }
}