"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Clock, Play, CheckCircle, AlertCircle, RefreshCw } from "lucide-react"
import { runOrdersJob, runReturnsJob, runInventoryJob } from "@/lib/actions"

interface JobRun {
  id: string
  jobType: "orders" | "returns" | "inventory"
  status: "running" | "completed" | "failed"
  startTime: string
  endTime?: string
  processed?: number
  errors?: string[]
}

export default function BackgroundJobsPage() {
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({})
  const [jobHistory, setJobHistory] = useState<JobRun[]>([
    {
      id: "1",
      jobType: "orders",
      status: "completed",
      startTime: "2024-01-15T10:00:00Z",
      endTime: "2024-01-15T10:02:30Z",
      processed: 15,
    },
    {
      id: "2",
      jobType: "inventory",
      status: "completed",
      startTime: "2024-01-15T09:00:00Z",
      endTime: "2024-01-15T09:01:15Z",
      processed: 245,
    },
    {
      id: "3",
      jobType: "returns",
      status: "failed",
      startTime: "2024-01-15T08:00:00Z",
      endTime: "2024-01-15T08:00:45Z",
      errors: ["Connection timeout to external API"],
    },
  ])

  const runJob = async (jobType: "orders" | "returns" | "inventory") => {
    setIsRunning((prev) => ({ ...prev, [jobType]: true }))

    try {
      let result: any
      const startTime = new Date().toISOString()

      switch (jobType) {
        case "orders":
          result = await runOrdersJob()
          break
        case "returns":
          result = await runReturnsJob()
          break
        case "inventory":
          result = await runInventoryJob()
          break
      }

      // Add to job history
      const newJob: JobRun = {
        id: Date.now().toString(),
        jobType,
        status: result.success ? "completed" : "failed",
        startTime,
        endTime: new Date().toISOString(),
        processed: (result as any).processed?.length || (result as any).updated?.length || 0,
        errors: (result as any).errors || ((result as any).error ? [(result as any).error] : undefined),
      }

      setJobHistory((prev) => [newJob, ...prev.slice(0, 9)]) // Keep last 10 jobs

      console.log(`${jobType} job result:`, result)
    } catch (error) {
      console.error(`Error running ${jobType} job:`, error)

      // Add failed job to history
      const failedJob: JobRun = {
        id: Date.now().toString(),
        jobType,
        status: "failed",
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
      }

      setJobHistory((prev) => [failedJob, ...prev.slice(0, 9)])
    } finally {
      setIsRunning((prev) => ({ ...prev, [jobType]: false }))
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running":
        return <RefreshCw className="h-4 w-4 animate-spin" />
      case "completed":
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case "failed":
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      running: "default",
      completed: "secondary",
      failed: "destructive",
    } as const

    return <Badge variant={variants[status as keyof typeof variants] || "outline"}>{status}</Badge>
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Background Jobs</h1>
          <p className="text-muted-foreground">Monitor and manage automated background processing tasks</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Process Orders</CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Fetches new orders from website and creates accounting entries
                </p>
                <Button onClick={() => runJob("orders")} disabled={isRunning.orders} className="w-full">
                  {isRunning.orders ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    "Run Now"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Process Returns</CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Processes return requests and creates credit memos</p>
                <Button onClick={() => runJob("returns")} disabled={isRunning.returns} className="w-full">
                  {isRunning.returns ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    "Run Now"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Update Inventory</CardTitle>
              <Play className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">Updates inventory valuations and checks stock levels</p>
                <Button onClick={() => runJob("inventory")} disabled={isRunning.inventory} className="w-full">
                  {isRunning.inventory ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Running...
                    </>
                  ) : (
                    "Run Now"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Job History</CardTitle>
            <CardDescription>Recent background job executions and their results</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {jobHistory.map((job, index) => (
                <div key={job.id}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(job.status)}
                      <div>
                        <p className="font-medium capitalize">{job.jobType} Processing</p>
                        <p className="text-sm text-muted-foreground">
                          Started: {new Date(job.startTime).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      {job.processed && <span className="text-sm text-muted-foreground">{job.processed} items</span>}
                      {getStatusBadge(job.status)}
                    </div>
                  </div>
                  {job.errors && job.errors.length > 0 && (
                    <div className="mt-2 ml-7">
                      <div className="rounded-md bg-red-50 p-3">
                        <p className="text-sm text-red-800">{job.errors.join(", ")}</p>
                      </div>
                    </div>
                  )}
                  {index < jobHistory.length - 1 && <Separator className="mt-4" />}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cron Schedule</CardTitle>
            <CardDescription>Automated job scheduling configuration</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-3">
                <div className="space-y-2">
                  <h4 className="font-medium">Process Orders</h4>
                  <p className="text-sm text-muted-foreground">Every 15 minutes</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded">*/15 * * * *</code>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Process Returns</h4>
                  <p className="text-sm text-muted-foreground">Every 30 minutes</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded">*/30 * * * *</code>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">Update Inventory</h4>
                  <p className="text-sm text-muted-foreground">Every hour</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded">0 * * * *</code>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
