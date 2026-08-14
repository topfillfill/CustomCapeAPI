import {
    head
} from "@vercel/blob";


const MAX_UUIDS =
    100;


// ==========================================
// UUID 정리
// ==========================================

function normalizeUuid(value) {

    if (!value) {
        return null;
    }


    const uuid =
        String(value)
            .trim()
            .replaceAll("-", "")
            .toLowerCase();


    if (
        !/^[0-9a-f]{32}$/.test(uuid)
    ) {

        return null;
    }


    return uuid;
}


// ==========================================
// 망토 경로
// ==========================================

function capePath(uuid) {

    return `capes/${uuid}.png`;
}


// ==========================================
// Blob 없음 확인
// ==========================================

function isBlobNotFound(error) {

    const name =
        String(
            error?.name ?? ""
        );


    const message =
        String(
            error?.message ?? ""
        ).toLowerCase();


    return (
        name === "BlobNotFoundError"
        ||
        message.includes(
            "requested blob does not exist"
        )
        ||
        message.includes(
            "blob does not exist"
        )
    );
}


// ==========================================
// HEAD
//
// list() 사용하지 않음!
// ==========================================

async function getCapeInfo(uuid) {

    try {

        return await head(
            capePath(uuid)
        );

    } catch (error) {

        if (
            isBlobNotFound(error)
        ) {

            return null;
        }


        throw error;
    }
}


// ==========================================
// JSON 응답
// ==========================================

function json(
    data,
    status = 200
) {

    return Response.json(
        data,
        {
            status,

            headers: {
                "Cache-Control":
                    "no-store"
            }
        }
    );
}


// ==========================================
// POST
//
// {
//   "uuids": [
//      "...",
//      "..."
//   ]
// }
// ==========================================

export async function POST(request) {

    try {

        let body;


        try {

            body =
                await request.json();

        } catch {

            return json(
                {
                    error:
                        "invalid_json"
                },
                400
            );
        }


        if (
            !Array.isArray(
                body?.uuids
            )
        ) {

            return json(
                {
                    error:
                        "uuids_required"
                },
                400
            );
        }


        // ======================================
        // UUID 정리 + 중복 제거
        // ======================================

        const uuids =
            [
                ...new Set(

                    body.uuids

                        .map(
                            normalizeUuid
                        )

                        .filter(
                            uuid =>
                                uuid !== null
                        )
                )
            ];


        if (
            uuids.length >
            MAX_UUIDS
        ) {

            return json(
                {
                    error:
                        "too_many_uuids"
                },
                400
            );
        }


        const capes = {};


        // ======================================
        // UUID마다 list()가 아니라 head()
        // ======================================

        await Promise.all(

            uuids.map(

                async uuid => {

                    const blob =
                        await getCapeInfo(
                            uuid
                        );


                    if (!blob) {

                        return;
                    }


                    capes[uuid] = {

                        url:
                        blob.url,

                        etag:
                        blob.etag,

                        uploadedAt:
                        blob.uploadedAt

                    };
                }
            )
        );


        return json(
            {
                success:
                    true,

                capes
            }
        );


    } catch (error) {

        console.error(
            "[CustomCape] CAPES error:",
            error
        );


        return json(
            {
                error:
                    "server_error"
            },
            500
        );
    }
}