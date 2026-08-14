import {
    head,
    put
} from "@vercel/blob";


const MAX_CAPE_SIZE =
    128 * 1024;


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
// 고정 망토 경로
//
// 기존:
// capes/UUID/시간.png
//
// 변경:
// capes/UUID.png
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
// 안전한 HEAD
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
// PNG 64x32 검사
// ==========================================

function isValidCapePng(bytes) {

    if (
        !bytes
        ||
        bytes.length < 24
    ) {

        return false;
    }


    // PNG Signature

    const signature = [
        137,
        80,
        78,
        71,
        13,
        10,
        26,
        10
    ];


    for (
        let i = 0;
        i < signature.length;
        i++
    ) {

        if (
            bytes[i] !== signature[i]
        ) {

            return false;
        }
    }


    // IHDR 확인

    if (
        bytes[12] !== 73
        ||
        bytes[13] !== 72
        ||
        bytes[14] !== 68
        ||
        bytes[15] !== 82
    ) {

        return false;
    }


    const view =
        new DataView(
            bytes.buffer,
            bytes.byteOffset,
            bytes.byteLength
        );


    const width =
        view.getUint32(
            16,
            false
        );


    const height =
        view.getUint32(
            20,
            false
        );


    return (
        width === 64
        &&
        height === 32
    );
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
// GET
//
// /api/cape?uuid=UUID
// ==========================================

export async function GET(request) {

    try {

        const url =
            new URL(
                request.url
            );


        const uuid =
            normalizeUuid(
                url.searchParams.get(
                    "uuid"
                )
            );


        if (!uuid) {

            return json(
                {
                    error:
                        "invalid_uuid"
                },
                400
            );
        }


        const blob =
            await getCapeInfo(
                uuid
            );


        if (!blob) {

            return json(
                {
                    found:
                        false,

                    uuid
                }
            );
        }


        return json(
            {
                found:
                    true,

                uuid,

                url:
                blob.url,

                etag:
                blob.etag,

                uploadedAt:
                blob.uploadedAt
            }
        );


    } catch (error) {

        console.error(
            "[CustomCape] GET error:",
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


// ==========================================
// PUT
//
// /api/cape?uuid=UUID
// body = image/png
// ==========================================

export async function PUT(request) {

    try {

        const url =
            new URL(
                request.url
            );


        const uuid =
            normalizeUuid(
                url.searchParams.get(
                    "uuid"
                )
            );


        if (!uuid) {

            return json(
                {
                    error:
                        "invalid_uuid"
                },
                400
            );
        }


        const contentType =
            request.headers
                .get(
                    "content-type"
                )
                ?.toLowerCase()
            ?? "";


        if (
            !contentType.startsWith(
                "image/png"
            )
        ) {

            return json(
                {
                    error:
                        "png_required"
                },
                415
            );
        }


        const buffer =
            await request.arrayBuffer();


        if (
            buffer.byteLength === 0
        ) {

            return json(
                {
                    error:
                        "empty_file"
                },
                400
            );
        }


        if (
            buffer.byteLength >
            MAX_CAPE_SIZE
        ) {

            return json(
                {
                    error:
                        "file_too_large"
                },
                413
            );
        }


        const bytes =
            new Uint8Array(
                buffer
            );


        if (
            !isValidCapePng(
                bytes
            )
        ) {

            return json(
                {
                    error:
                        "cape_must_be_64x32_png"
                },
                400
            );
        }


        // ======================================
        // UUID당 딱 1개만 저장
        // 같은 파일 계속 덮어쓰기
        // ======================================

        const blob =
            await put(
                capePath(uuid),
                buffer,
                {
                    access:
                        "public",

                    contentType:
                        "image/png",

                    addRandomSuffix:
                        false,

                    allowOverwrite:
                        true,

                    // 이전 이미지가 너무 오래 캐시되는 것 방지
                    cacheControlMaxAge:
                        60
                }
            );


        return json(
            {
                success:
                    true,

                uuid,

                url:
                blob.url,

                etag:
                blob.etag
            }
        );


    } catch (error) {

        console.error(
            "[CustomCape] PUT error:",
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