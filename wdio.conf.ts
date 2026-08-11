import type { Options } from '@wdio/types'
import { createServer, type ViteDevServer } from 'vite'

let server: ViteDevServer | undefined

export const config: Options.Testrunner = {
  autoCompileOpts: {
    autoCompile: true,
    tsNodeOpts: {
      project: './tsconfig.json',
      transpileOnly: true,
    },
  },
  specs: [
    './e2e/specs/**/*.ts',
  ],
  exclude: [],
  maxInstances: 1,
  capabilities: [
    {
      browserName: 'chrome',
      'goog:chromeOptions': {
        args: ['--headless', '--disable-gpu', '--no-sandbox'],
      },
    },
  ],
  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost:1420',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  services: [],
  framework: 'mocha',
  reporters: ['dot'],
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
  async onPrepare() {
    try {
      server = await createServer({
        server: { port: 1420, strictPort: true },
      })
      await server.listen()
      console.log('Vite dev server started at http://localhost:1420')
    } catch (err) {
      console.error('Failed to start Vite dev server:', err)
    }
  },
  async onComplete() {
    if (server) {
      await server.close()
      console.log('Vite dev server stopped')
    }
  },
}
