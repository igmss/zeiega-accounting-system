"use client"

import { useSearchParams } from "next/navigation"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertCircle } from "lucide-react"

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: "Server configuration error. Make sure NEXTAUTH_SECRET and NEXTAUTH_URL environment variables are set.",
  AccessDenied: "Access denied. Your account may be inactive or you lack the required permissions.",
  Verification: "The sign-in link is no longer valid or has expired.",
  Default: "An authentication error occurred. Please try again.",
}

export default function AuthErrorPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const error = searchParams.get("error") || "Default"

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <AlertCircle className="h-6 w-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Authentication Error</CardTitle>
          <CardDescription>
            {ERROR_MESSAGES[error] || ERROR_MESSAGES.Default}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center">
          <p className="text-sm text-muted-foreground">
            Error code: <code className="bg-muted px-1 rounded text-xs">{error}</code>
          </p>
        </CardContent>
        <CardFooter className="flex justify-center">
          <Button onClick={() => router.push("/auth/login")}>
            Back to Login
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
