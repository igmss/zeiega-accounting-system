"use client"

import { useState } from "react"
import { DashboardLayout } from "@/components/dashboard-layout"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Clock, Play, CheckCircle, AlertCircle, RefreshCw, Trash2, ExternalLink, History } from "lucide-react"
import { runOrdersJob, runReturnsJob, runInventoryJob } from "@/lib/actions"

interface JobRun {
  id: string
  jobType: "orders" | "returns" | "inventory"
  status: "running" | "completed" | "failed"
  startTime: string
  endTime?: string
  processed?: number
  errors?: string[]
  updated?: number
  lowStockAlerts?: number
}

const JOB_CONFIG = {
  orders: {
    title: "Process Orders",
    description: "Fetches new orders from website and creates accounting entries",
    cronLabel: "Every 15 minutes",
    cronExpr: "*/15 * * * *",
    apiPath: "/api/cron/process-orders",
  },
  returns: {
    title: "Process Returns",
    description: "Processes return requests and creates credit memos",
    cronLabel: "Every 30 minutes",
    cronExpr: "*/30 * * * *",
    apiPath: "/api/cron/process-returns",
  },
  inventory: {
    title: "Update Inventory",
    description: "Updates inventory valuations and checks stock levels",
    cronLabel: "Every hour",
    cronExpr: "0 * * * *",
    apiPath: "/api/cron/update-inventory",
  },
} as const

export default function BackgroundJobsPage() {
  const [isRunning, setIsRunning] = useState<Record<string, boolean>>({})
  const [jobHistory, setJobHistory] = useState<JobRun[]>([])

  const runJob = async (jobType: "orders" | "returns" | "inventory") => {
    setIsRunning((prev) => ({ ...prev, [jobType]: true }))
    const startTime = new Date()

    const runningJob: JobRun = {
      id: Date.now().toString(),
      jobType,
      status: "running",
      startTime: startTime.toISOString(),
    }
    setJobHistory((prev) => [runningJob, ...prev])

    try {
      let result: any
      switch (jobType) {
        case "orders": result = await runOrdersJob(); break
        case "returns": result = await runReturnsJob(); break
        case "inventory": result = await runInventoryJob(); break
      }

      const completedJob: JobRun = {
        id: runningJob.id,
        jobType,
        status: result.success ? "completed" : "failed",
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        processed: runningJob.jobType === 'inventory'
          ? (result.updated?.length ?? result.updated ?? 0)
          : (result.processed?.length ?? result.processed ?? 0),
        updated: result.updated?.length ?? result.updated ?? 0,
        lowStockAlerts: result.lowStockAlerts ?? 0,
        errors: result.errors ?? (result.error ? [result.error] : undefined),
      }

      setJobHistory((prev) => prev.map(j => j.id === runningJob.id ? completedJob : j))
    } catch (error) {
      const failedJob: JobRun = {
        id: runningJob.id,
        jobType,
        status: "failed",
        startTime: startTime.toISOString(),
        endTime: new Date().toISOString(),
        errors: [error instanceof Error ? error.message : "Unknown error"],
      }
      setJobHistory((prev) => prev.map(j => j.id === runningJob.id ? failedJob : j))
    } finally {
      setIsRunning((prev) => ({ ...prev, [jobType]: false }))
    }
  }

  const clearHistory = () => setJobHistory([])

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "running": return <RefreshCw className="h-4 w-4 animate-spin text-blue-600" />
      case "completed": return <CheckCircle className="h-4 w-4 text-green-600" />
      case "failed": return <AlertCircle className="h-4 w-4 text-red-600" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      running: "default",
      completed: "secondary",
      failed: "destructive",
    }
    return <Badge variant={variants[status] || "outline"}>{status}</Badge>
  }

  const getElapsed = (start: string, end?: string) => {
    const s = new Date(start)
    const e = end ? new Date(end) : new Date()
    const ms = e.getTime() - s.getTime()
    if (ms < 1000) return "< 1s"
    if (ms < 60000) return `${Math.round(ms / 1000)}s`
    return `${Math.round(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
  }

  const lastCompleted = (type: string) => jobHistory.find(j => j.jobType === type && j.status === "completed")
  const totalCompleted = jobHistory.filter(j => j.status === "completed").length
  const totalFailed = jobHistory.filter(j => j.status === "failed").length

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Background Jobs</h1>
            <p className="text-muted-foreground">Monitor and manage automated background processing tasks</p>
          </div>
          {jobHistory.length > 0 && (
            <Button variant="outline" size="sm" onClick={clearHistory}>
              <Trash2 className="h-4 w-4 mr-1" /> Clear History
            </Button>
          )}
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {(Object.keys(JOB_CONFIG) as Array<keyof typeof JOB_CONFIG>).map((type) => {
            const config = JOB_CONFIG[type]
            const last = lastCompleted(type)
            return (
              <Card key={type}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">{config.title}</CardTitle>
                  <Play className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">{config.description}</p>
                    {last && (
                      <p className="text-xs text-muted-foreground">
                        Last run: {new Date(last.startTime).toLocaleString()} ({getElapsed(last.startTime, last.endTime)})
                        {last.processed ? ` — ${last.processed} processed` : ""}
                        {last.updated ? ` — ${last.updated} updated` : ""}
                      </p>
                    )}
                    <Button onClick={() => runJob(type)} disabled={isRunning[type]} className="w-full">
                      {isRunning[type] ? (
                        <><RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Running...</>
                      ) : (
                        "Run Now"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <History className="h-5 w-5" /> Job History
              </CardTitle>
              <CardDescription>
                Recent background job executions
                {jobHistory.length > 0 && ` — ${totalCompleted} completed, ${totalFailed} failed`}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            {jobHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No jobs run yet. Click &quot;Run Now&quot; to execute a background job.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {jobHistory.map((job, index) => (
                  <div key={job.id}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        {getStatusIcon(job.status)}
                        <div>
                          <p className="font-medium capitalize">
                            {job.jobType} Processing
                            {job.status !== "running" && (
                              <span className="text-xs text-muted-foreground ml-1">— {getElapsed(job.startTime, job.endTime)}</span>
                            )}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {new Date(job.startTime).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        {job.processed != null && job.processed > 0 && (
                          <span className="text-sm text-muted-foreground">{job.processed} processed</span>
                        )}
                        {job.updated != null && job.updated > 0 && (
                          <span className="text-sm text-muted-foreground">{job.updated} updated</span>
                        )}
                        {job.lowStockAlerts != null && job.lowStockAlerts > 0 && (
                          <Badge variant="destructive">{job.lowStockAlerts} low stock</Badge>
                        )}
                        {getStatusBadge(job.status)}
                      </div>
                    </div>
                    {job.errors && job.errors.length > 0 && (
                      <div className="mt-2 ml-7">
                        <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-3">
                          <p className="text-sm text-red-800 dark:text-red-300">{job.errors.join(", ")}</p>
                        </div>
                      </div>
                    )}
                    {index < jobHistory.length - 1 && <Separator className="mt-4" />}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cron Schedule</CardTitle>
            <CardDescription>Automated job scheduling — configure via external scheduler or Vercel Cron</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              {(Object.values(JOB_CONFIG)).map((config) => (
                <div key={config.apiPath} className="space-y-2 p-3 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <h4 className="font-medium text-sm">{config.title}</h4>
                    <a
                      href={config.apiPath}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-foreground"
                      title="Open endpoint"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  <p className="text-sm text-muted-foreground">{config.cronLabel}</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded inline-block">{config.cronExpr}</code>
                  <p className="text-xs text-muted-foreground break-all">{config.apiPath}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}
