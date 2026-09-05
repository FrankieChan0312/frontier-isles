import { createServer, type Server as HttpServer } from 'node:http'
import { createRealtimeHealthResponse } from '@frontier-isles/realtime-contracts'

const NOT_FOUND_RESPONSE = JSON.stringify({ error: 'NOT_FOUND' })

export function createFrontierHttpServer(): HttpServer {
  return createServer((request, response) => {
    response.setHeader('content-type', 'application/json; charset=utf-8')

    if (request.method === 'GET' && request.url === '/health') {
      response.statusCode = 200
      response.end(JSON.stringify(createRealtimeHealthResponse()))
      return
    }

    response.statusCode = 404
    response.end(NOT_FOUND_RESPONSE)
  })
}
