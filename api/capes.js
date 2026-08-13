import {
    list
} from "@vercel/blob";


const MAX_UUIDS = 200;


// ==========================================
// UUID 정리
// ==========================================

function normalizeUuid(value) {

    if (typeof value !== "string") {
        return null;
    }


    const uuid =
        value
            .toLowerCase()
            .replaceAll("-", "");


    if (!/^[0-9a-f]{32}$/.test(uuid)) {
        return null;
    }


    return uuid;
}


// ==========================================
// POST
//
// /api/capes
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

        const body =
            await request.json();


        if (!Array.isArray(body.uuids)) {

            return Response.json(
                {
                    error: "invalid_request"
                },
                {
                    status: 400
                }
            );
        }


        const uuids =
            [...new Set(
                body.uuids
                    .map(normalizeUuid)
                    .filter(Boolean)
            )]
                .slice(
                    0,
                    MAX_UUIDS
                );


        const results =
            await Promise.all(

                uuids.map(
                    async uuid => {

                        try {

                            const result =
                                await list({
                                    prefix:
                                        `capes/${uuid}/`,

                                    limit: 10
                                });


                            if (
                                result.blobs.length
                                === 0
                            ) {

                                return [
                                    uuid,
                                    null
                                ];
                            }


                            const blobs =
                                [...result.blobs]
                                    .sort(
                                        (a, b) =>
                                            new Date(
                                                b.uploadedAt
                                            )
                                            -
                                            new Date(
                                                a.uploadedAt
                                            )
                                    );


                            const cape =
                                blobs[0];


                            return [
                                uuid,
                                {
                                    url:
                                    cape.url,

                                    etag:
                                    cape.etag,

                                    uploadedAt:
                                    cape.uploadedAt
                                }
                            ];


                        } catch (error) {

                            console.error(
                                "Cape lookup failed:",
                                uuid,
                                error
                            );


                            return [
                                uuid,
                                null
                            ];
                        }
                    }
                )
            );


        const capes = {};


        for (
            const [uuid, cape]
            of results
            ) {

            if (cape !== null) {

                capes[uuid] =
                    cape;
            }
        }


        return Response.json({

            success: true,

            capes: capes
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