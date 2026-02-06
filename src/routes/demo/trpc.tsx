/**
 * tRPC Demo Page
 *
 * Demonstrates tRPC integration with TanStack Query.
 * Tests type-safe API calls and type inference.
 */
import { createFileRoute } from '@tanstack/react-router'
import { trpc } from '@/lib/trpc/client'
import { useState } from 'react'

export const Route = createFileRoute('/demo/trpc')({
  component: TRPCDemo,
})

function TRPCDemo() {
  const [echoMessage, setEchoMessage] = useState('')

  // Type-safe query - hover to see inferred types
  const healthQuery = trpc.health.check.useQuery()

  // Type-safe query with input validation
  const echoQuery = trpc.health.echo.useQuery(
    { message: echoMessage },
    { enabled: echoMessage.length > 0 }
  )

  return (
    <div className="container mx-auto p-4 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">tRPC Demo</h1>

      {/* Health Check Section */}
      <section className="mb-8 p-4 border border-gray-700 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Health Check</h2>
        {healthQuery.isLoading && (
          <p className="text-gray-400">Loading...</p>
        )}
        {healthQuery.error && (
          <p className="text-red-500">Error: {healthQuery.error.message}</p>
        )}
        {healthQuery.data && (
          <div className="space-y-2">
            <p>
              <span className="text-gray-400">Status:</span>{' '}
              <span className="text-green-500 font-mono">{healthQuery.data.status}</span>
            </p>
            <p>
              <span className="text-gray-400">Timestamp:</span>{' '}
              <span className="font-mono">{healthQuery.data.timestamp.toISOString()}</span>
            </p>
            <p>
              <span className="text-gray-400">Uptime:</span>{' '}
              <span className="font-mono">{healthQuery.data.uptime.toFixed(2)}s</span>
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={() => healthQuery.refetch()}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          Refresh
        </button>
      </section>

      {/* Echo Section */}
      <section className="p-4 border border-gray-700 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">Echo Test</h2>
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={echoMessage}
            onChange={(e) => setEchoMessage(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-500"
          />
        </div>
        {echoQuery.isLoading && (
          <p className="text-gray-400">Sending...</p>
        )}
        {echoQuery.error && (
          <p className="text-red-500">Error: {echoQuery.error.message}</p>
        )}
        {echoQuery.data && (
          <div className="p-3 bg-gray-800 rounded">
            <p>
              <span className="text-gray-400">Echo:</span>{' '}
              <span className="font-mono">{echoQuery.data.echo}</span>
            </p>
            <p>
              <span className="text-gray-400">Received at:</span>{' '}
              <span className="font-mono text-sm">{echoQuery.data.receivedAt.toISOString()}</span>
            </p>
          </div>
        )}
      </section>

      {/* Type Inference Demo */}
      <section className="mt-8 p-4 border border-gray-700 rounded-lg bg-gray-900">
        <h2 className="text-xl font-semibold mb-4">Type Inference</h2>
        <p className="text-gray-400 text-sm">
          Hover over the variables in your IDE to see type inference working:
        </p>
        <pre className="mt-2 p-3 bg-gray-800 rounded text-sm overflow-x-auto">
{`// healthQuery.data is typed as:
// { status: "ok"; timestamp: Date; uptime: number; } | undefined

// echoQuery.data is typed as:
// { echo: string; receivedAt: Date; } | undefined`}
        </pre>
      </section>
    </div>
  )
}
