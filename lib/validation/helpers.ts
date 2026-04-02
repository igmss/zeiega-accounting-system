import { NextRequest, NextResponse } from "next/server"
import { ZodSchema, ZodError } from "zod"

/**
 * Validates request body against a Zod schema
 */
export async function validateRequestBody<T>(
    request: NextRequest,
    schema: ZodSchema<T>
): Promise<{ success: true; data: T } | { success: false; error: NextResponse }> {
    try {
        const body = await request.json()
        const validatedData = schema.parse(body)
        return { success: true, data: validatedData }
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                success: false,
                error: NextResponse.json(
                    {
                        success: false,
                        error: "Validation failed",
                        details: error.errors.map((e) => ({
                            field: e.path.join("."),
                            message: e.message,
                        })),
                    },
                    { status: 400 }
                ),
            }
        }

        if (error instanceof SyntaxError) {
            return {
                success: false,
                error: NextResponse.json(
                    { success: false, error: "Invalid JSON in request body" },
                    { status: 400 }
                ),
            }
        }

        return {
            success: false,
            error: NextResponse.json(
                { success: false, error: "Request validation failed" },
                { status: 400 }
            ),
        }
    }
}

/**
 * Validates query parameters against a Zod schema
 */
export function validateQueryParams<T>(
    searchParams: URLSearchParams,
    schema: ZodSchema<T>
): { success: true; data: T } | { success: false; error: NextResponse } {
    try {
        const params: Record<string, string> = {}
        searchParams.forEach((value, key) => {
            params[key] = value
        })
        const validatedData = schema.parse(params)
        return { success: true, data: validatedData }
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                success: false,
                error: NextResponse.json(
                    {
                        success: false,
                        error: "Invalid query parameters",
                        details: error.errors.map((e) => ({
                            field: e.path.join("."),
                            message: e.message,
                        })),
                    },
                    { status: 400 }
                ),
            }
        }
        return {
            success: false,
            error: NextResponse.json(
                { success: false, error: "Query parameter validation failed" },
                { status: 400 }
            ),
        }
    }
}

/**
 * Creates a standardized error response
 */
export function createErrorResponse(
    message: string,
    status: number = 500,
    details?: unknown
): NextResponse {
    console.error(`API Error [${status}]:`, message, details)
    return NextResponse.json(
        {
            success: false,
            error: message,
            ...(process.env.NODE_ENV === "development" && details ? { details } : {}),
        },
        { status }
    )
}

/**
 * Creates a standardized success response
 */
export function createSuccessResponse<T>(
    data: T,
    status: number = 200,
    meta?: Record<string, unknown>
): NextResponse {
    return NextResponse.json(
        {
            success: true,
            data,
            ...meta,
        },
        { status }
    )
}

/**
 * Wraps an API handler with error handling
 */
export function withErrorHandling(
    handler: (request: NextRequest) => Promise<NextResponse>
) {
    return async (request: NextRequest): Promise<NextResponse> => {
        try {
            return await handler(request)
        } catch (error) {
            console.error("Unhandled API error:", error)
            return createErrorResponse(
                error instanceof Error ? error.message : "An unexpected error occurred"
            )
        }
    }
}
