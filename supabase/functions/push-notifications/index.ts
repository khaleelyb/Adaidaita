import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createHttpError } from "https://deno.land/std@0.168.0/http/http_errors.ts"

// Using a lightweight JWT library for Deno
import * as djwt from "https://deno.land/x/djwt@v2.8/mod.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface NotificationPayload {
    tokens: string[]
    title: string
    body: string
    data?: Record<string, string>
}

async function getAccessToken(serviceAccount: any) {
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 3600;

    const payload = {
        iss: serviceAccount.client_email,
        sub: serviceAccount.client_email,
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: expiry,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
    };

    const header: djwt.Header = {
        alg: "RS256",
        typ: "JWT",
    };

    // Extract the private key and clean it up
    const pemHeader = "-----BEGIN PRIVATE KEY-----";
    const pemFooter = "-----END PRIVATE KEY-----";
    const privateKeyPem = serviceAccount.private_key
        .replace(/\n/g, "")
        .replace(pemHeader, "")
        .replace(pemFooter, "");

    const binaryKey = Uint8Array.from(atob(privateKeyPem), (c) => c.charCodeAt(0));

    const key = await crypto.subtle.importKey(
        "pkcs8",
        binaryKey,
        {
            name: "RSASSA-PKCS1-v1_5",
            hash: "SHA-256",
        },
        true,
        ["sign"]
    );

    const jwt = await djwt.create(header, payload, key);

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: jwt,
        }),
    });

    const data = await response.json();
    if (data.error) {
        throw new Error(`Failed to get access token: ${data.error_description || data.error}`);
    }
    return data.access_token;
}

serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const serviceAccountJson = Deno.env.get('FIREBASE_SERVICE_ACCOUNT')
        if (!serviceAccountJson) {
            throw createHttpError(500, 'FIREBASE_SERVICE_ACCOUNT secret is not set')
        }
        const serviceAccount = JSON.parse(serviceAccountJson)
        const projectId = serviceAccount.project_id

        const { tokens, title, body, data } = await req.json() as NotificationPayload

        if (!tokens || tokens.length === 0) {
            throw createHttpError(400, 'Tokens are required')
        }

        const accessToken = await getAccessToken(serviceAccount)
        const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`

        const results = await Promise.all(tokens.map(async (token) => {
            const message = {
                message: {
                    token,
                    notification: {
                        title,
                        body,
                    },
                    data: data || {},
                    webpush: {
                        fcm_options: {
                            link: "/"
                        }
                    }
                }
            }

            const response = await fetch(fcmUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(message),
            })

            return {
                token,
                status: response.status,
                data: await response.json()
            }
        }))

        return new Response(
            JSON.stringify({ success: true, results }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error) {
        console.error(error)
        return new Response(
            JSON.stringify({ error: error.message }),
            { status: error.status || 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
